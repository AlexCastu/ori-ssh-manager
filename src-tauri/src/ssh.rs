//! SSH Connection module for SSH Manager

use crate::db::{JumpHop, Session as SessionConfig};
use ssh2::{Channel, CheckResult, KnownHostFileKind, KnownHostKeyFormat, Session as SshSession};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;
use thiserror::Error;
use uuid::Uuid;

// Tuning constants
const TCP_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const SSH_BLOCKING_TIMEOUT_MS: u32 = 15_000;
const READ_POLL_INTERVAL: Duration = Duration::from_millis(5);
const TUNNEL_POLL_INTERVAL: Duration = Duration::from_millis(2);
const WRITE_RETRY_INTERVAL: Duration = Duration::from_millis(2);
const READ_BUFFER_SIZE: usize = 16384;
// Coalesce PTY output: emit one IPC event per batch instead of per read
const FLUSH_THRESHOLD: usize = 32 * 1024;
const FLUSH_INTERVAL: Duration = Duration::from_millis(16);
// Keepalive: detect dead connections and keep NAT mappings alive
const KEEPALIVE_INTERVAL_SECS: u32 = 30;
const KEEPALIVE_SEND_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Authentication failed: {0}")]
    AuthFailed(String),
    #[error("Channel error: {0}")]
    ChannelError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("SSH2 error: {0}")]
    Ssh2Error(#[from] ssh2::Error),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("Host key verification failed: {0}")]
    HostKeyMismatch(String),
}

pub(crate) struct SshChannelInner {
    pub(crate) session: SshSession,
    pub(crate) channel: Channel,
}

pub struct SshChannel {
    #[allow(dead_code)]
    pub id: String,
    pub(crate) inner: Arc<Mutex<SshChannelInner>>,
    running: Arc<AtomicBool>,
}

pub struct SshManager {
    pub(crate) channels: Mutex<HashMap<String, SshChannel>>,
    dead_channels: Arc<Mutex<Vec<String>>>,
}

/// Expand a leading `~` to the user's home directory (cross-platform)
fn expand_tilde(path: &str) -> PathBuf {
    if path == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(path));
    }
    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// TCP connect with explicit timeout (resolves DNS, tries every address)
fn tcp_connect(host: &str, port: u16) -> Result<TcpStream, SshError> {
    let addrs: Vec<_> = (host, port)
        .to_socket_addrs()
        .map_err(|e| SshError::ConnectionFailed(format!("DNS resolve '{}': {}", host, e)))?
        .collect();

    if addrs.is_empty() {
        return Err(SshError::ConnectionFailed(format!(
            "DNS resolve '{}': no addresses found",
            host
        )));
    }

    let mut last_err = None;
    for addr in addrs {
        match TcpStream::connect_timeout(&addr, TCP_CONNECT_TIMEOUT) {
            Ok(stream) => {
                stream.set_nodelay(true).ok();
                return Ok(stream);
            }
            Err(e) => last_err = Some(e),
        }
    }
    Err(SshError::ConnectionFailed(
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unreachable".into()),
    ))
}

/// Write a full buffer retrying on WouldBlock (needed on non-blocking sessions)
fn write_full<W: Write>(writer: &mut W, mut data: &[u8]) -> std::io::Result<()> {
    while !data.is_empty() {
        match writer.write(data) {
            Ok(0) => return Err(std::io::ErrorKind::WriteZero.into()),
            Ok(n) => data = &data[n..],
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(WRITE_RETRY_INTERVAL)
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

/// Take the longest valid UTF-8 prefix from `pending` as a String, keeping an
/// incomplete multi-byte sequence at the tail for the next call. Genuinely
/// invalid bytes (not a split sequence) are converted lossily.
fn take_complete_utf8(pending: &mut Vec<u8>) -> String {
    if pending.is_empty() {
        return String::new();
    }

    let (data, rest) = match std::str::from_utf8(pending) {
        Ok(s) => (s.to_string(), Vec::new()),
        Err(e) => {
            let valid_len = e.valid_up_to();
            if pending.len() - valid_len > 3 {
                // Genuinely invalid bytes (not a split sequence): emit lossily
                (String::from_utf8_lossy(pending).into_owned(), Vec::new())
            } else {
                (
                    String::from_utf8_lossy(&pending[..valid_len]).into_owned(),
                    pending[valid_len..].to_vec(),
                )
            }
        }
    };
    *pending = rest;
    data
}

/// Emit accumulated PTY output as a single event, respecting UTF-8 boundaries
fn flush_pending(app: &tauri::AppHandle, channel_id: &str, pending: &mut Vec<u8>) {
    let data = take_complete_utf8(pending);
    if !data.is_empty() {
        let _ = app.emit(
            "pty_output",
            serde_json::json!({
                "channelId": channel_id,
                "data": data
            }),
        );
    }
}

fn emit_pty_closed(
    app: &tauri::AppHandle,
    channel_id: &str,
    reason: &str,
    exit_status: Option<i32>,
) {
    let _ = app.emit(
        "pty_closed",
        serde_json::json!({
            "channelId": channel_id,
            "reason": reason,
            "exitStatus": exit_status,
        }),
    );
}

/// Emit connection progress (used by the frontend to show multi-hop status).
/// `progress_id` is an opaque id chosen by the frontend (the tab id).
fn emit_progress(app: &tauri::AppHandle, progress_id: Option<&str>, message: String) {
    if let Some(id) = progress_id {
        let _ = app.emit(
            "ssh_progress",
            serde_json::json!({
                "progressId": id,
                "message": message,
            }),
        );
    }
}

/// Path of the app-managed known_hosts file (next to the database)
fn known_hosts_path() -> PathBuf {
    dirs::config_dir()
        .map(|p| p.join("SSHManager"))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("known_hosts")
}

/// OpenSSH known_hosts host token for a host/port pair
fn known_hosts_entry(host: &str, port: u16) -> String {
    if port == 22 {
        host.to_string()
    } else {
        format!("[{}]:{}", host, port)
    }
}

/// Remove the stored host key for host:port from the app's known_hosts.
/// Returns true if an entry was removed. Used by the "forget host key"
/// action after a HostKeyMismatch (e.g. legitimately reinstalled server).
pub fn forget_host_key(host: &str, port: u16) -> Result<bool, SshError> {
    let file = known_hosts_path();
    if !file.exists() {
        return Ok(false);
    }

    let entry = known_hosts_entry(host, port);
    let content = std::fs::read_to_string(&file)?;
    let mut removed = false;

    let kept: Vec<&str> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return true;
            }
            let Some(hosts_field) = trimmed.split_whitespace().next() else {
                return true;
            };
            let matches = hosts_field.split(',').any(|h| h == entry);
            if matches {
                removed = true;
            }
            !matches
        })
        .collect();

    if removed {
        std::fs::write(&file, kept.join("\n") + "\n")?;
        log::info!("Removed host key entry for {}", entry);
    }
    Ok(removed)
}

/// Verify the server host key against the app's known_hosts (TOFU:
/// first connection stores the key; a later mismatch aborts the connection)
fn verify_host_key(session: &SshSession, host: &str, port: u16) -> Result<(), SshError> {
    let (key, key_type) = session
        .host_key()
        .ok_or_else(|| SshError::HostKeyMismatch("Server did not provide a host key".into()))?;

    let mut known_hosts = session.known_hosts()?;
    let file = known_hosts_path();
    if file.exists() {
        known_hosts
            .read_file(&file, KnownHostFileKind::OpenSSH)
            .map_err(|e| SshError::HostKeyMismatch(format!("Cannot read known_hosts: {}", e)))?;
    }

    match known_hosts.check_port(host, port, key) {
        CheckResult::Match => Ok(()),
        CheckResult::NotFound => {
            // Trust on first use: persist the key for future checks
            let key_format: KnownHostKeyFormat = key_type.into();
            let host_entry = known_hosts_entry(host, port);
            known_hosts.add(&host_entry, key, "added by ORI-SSHManager", key_format)?;
            known_hosts
                .write_file(&file, KnownHostFileKind::OpenSSH)
                .map_err(|e| {
                    SshError::HostKeyMismatch(format!("Cannot save known_hosts: {}", e))
                })?;
            log::info!("Host key for {} stored (trust on first use)", host_entry);
            Ok(())
        }
        CheckResult::Mismatch => Err(SshError::HostKeyMismatch(format!(
            "Host key for {}:{} CHANGED. Possible man-in-the-middle attack. \
             If the server was legitimately reinstalled, remove its entry from {}",
            host,
            port,
            file.display()
        ))),
        CheckResult::Failure => Err(SshError::HostKeyMismatch(format!(
            "Could not verify host key for {}:{}",
            host, port
        ))),
    }
}

/// Authenticate an SSH session by password, private key (with ~ expansion)
/// or the running ssh-agent
fn authenticate(
    session: &SshSession,
    username: &str,
    auth_method: &str,
    password: Option<&str>,
    private_key_path: Option<&str>,
    private_key_passphrase: Option<&str>,
) -> Result<(), SshError> {
    match auth_method {
        "key" => {
            let raw_path = private_key_path
                .ok_or_else(|| SshError::AuthFailed("No private key path provided".to_string()))?;
            let key_path = expand_tilde(raw_path);

            if !key_path.exists() {
                return Err(SshError::AuthFailed(format!(
                    "Key file not found: {}",
                    key_path.display()
                )));
            }

            session
                .userauth_pubkey_file(username, None, &key_path, private_key_passphrase)
                .map_err(|e| SshError::AuthFailed(format!("Key auth failed: {}", e)))?;
        }
        "agent" => {
            session
                .userauth_agent(username)
                .map_err(|e| SshError::AuthFailed(format!("SSH agent auth failed: {}", e)))?;
        }
        _ => {
            let pwd = password.unwrap_or("");
            session
                .userauth_password(username, pwd)
                .map_err(|e| SshError::AuthFailed(e.to_string()))?;
        }
    }

    if !session.authenticated() {
        return Err(SshError::AuthFailed(
            "Authentication rejected by server".to_string(),
        ));
    }
    Ok(())
}

/// Bridge a local TCP stream and an SSH direct-tcpip channel (jump tunnel).
/// Keeps the hop session alive for the lifetime of the tunnel.
fn bridge_streams(mut local: TcpStream, mut channel: Channel, hop_session: SshSession) {
    hop_session.set_blocking(false);
    if local.set_nonblocking(true).is_err() {
        return;
    }

    let mut buf = vec![0u8; READ_BUFFER_SIZE];
    loop {
        let mut idle = true;

        // local -> remote
        match local.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if write_full(&mut channel, &buf[..n]).is_err() {
                    break;
                }
                idle = false;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        // remote -> local
        match channel.read(&mut buf) {
            Ok(0) => {
                if channel.eof() {
                    break;
                }
            }
            Ok(n) => {
                if write_full(&mut local, &buf[..n]).is_err() {
                    break;
                }
                idle = false;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        if idle {
            thread::sleep(TUNNEL_POLL_INTERVAL);
        }
    }

    channel.close().ok();
    log::info!("Jump tunnel closed");
}

/// Expose an SSH direct-tcpip channel as a real TcpStream by bridging it over
/// a local loopback socket pair (an ssh2 Channel is not a TcpStream, but the
/// next SSH session in the chain needs one). The hop session moves into the
/// bridge thread, which keeps it alive for the tunnel's lifetime.
fn bridge_to_loopback(channel: Channel, hop_session: SshSession) -> Result<TcpStream, SshError> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| SshError::ConnectionFailed(format!("Local tunnel bind: {}", e)))?;
    let local_addr = listener
        .local_addr()
        .map_err(|e| SshError::ConnectionFailed(format!("Local tunnel addr: {}", e)))?;

    // Connect from a helper thread while accepting here, then verify the
    // accepted peer is OUR socket: any other local process racing into the
    // loopback port is rejected (fail-closed)
    let connector = thread::spawn(move || TcpStream::connect(local_addr));

    let (local, peer_addr) = listener
        .accept()
        .map_err(|e| SshError::ConnectionFailed(format!("Local tunnel accept: {}", e)))?;
    let stream = connector
        .join()
        .map_err(|_| SshError::ConnectionFailed("Local tunnel connect thread panicked".into()))?
        .map_err(|e| SshError::ConnectionFailed(format!("Local tunnel connect: {}", e)))?;
    drop(listener);

    let our_addr = stream
        .local_addr()
        .map_err(|e| SshError::ConnectionFailed(format!("Local tunnel addr: {}", e)))?;
    if peer_addr != our_addr {
        return Err(SshError::ConnectionFailed(
            "Local tunnel rejected: unexpected process connected to the loopback port".into(),
        ));
    }

    thread::spawn(move || bridge_streams(local, channel, hop_session));

    stream.set_nodelay(true).ok();
    Ok(stream)
}

fn hop_port(hop: &JumpHop) -> u16 {
    if hop.port > 0 && hop.port <= 65535 {
        hop.port as u16
    } else {
        22
    }
}

/// Open a TCP stream to the target through a chain of jump hosts.
/// Each hop: SSH session over the previous stream -> direct-tcpip channel to
/// the next hop (or the final target) -> loopback bridge -> new TcpStream.
/// Every hop gets full host key verification (TOFU) and its own auth method.
fn open_chain_stream(
    app: &tauri::AppHandle,
    progress_id: Option<&str>,
    default_username: &str,
    hops: &[JumpHop],
    target_host: &str,
    target_port: u16,
) -> Result<TcpStream, SshError> {
    let total = hops.len();
    let first = &hops[0];

    emit_progress(
        app,
        progress_id,
        format!("Hop 1/{}: connecting to {}:{}...", total, first.host, hop_port(first)),
    );
    let mut stream = tcp_connect(&first.host, hop_port(first))
        .map_err(|e| SshError::ConnectionFailed(format!("Hop 1 ({}): {}", first.host, e)))?;

    for (i, hop) in hops.iter().enumerate() {
        let hop_n = i + 1;
        let port = hop_port(hop);

        emit_progress(
            app,
            progress_id,
            format!("Hop {}/{}: authenticating on {}...", hop_n, total, hop.host),
        );

        let mut session = SshSession::new()?;
        session.set_timeout(SSH_BLOCKING_TIMEOUT_MS);
        session.set_compress(true);
        session.set_tcp_stream(stream);
        session
            .handshake()
            .map_err(|e| SshError::ConnectionFailed(format!("Hop {} ({}): {}", hop_n, hop.host, e)))?;
        verify_host_key(&session, &hop.host, port)?;

        let username = if hop.username.trim().is_empty() {
            default_username
        } else {
            hop.username.as_str()
        };
        authenticate(
            &session,
            username,
            &hop.auth_method,
            hop.password.as_deref(),
            hop.private_key_path.as_deref(),
            hop.private_key_passphrase.as_deref(),
        )
        .map_err(|e| SshError::AuthFailed(format!("Hop {} ({}): {}", hop_n, hop.host, e)))?;

        let (next_host, next_port) = match hops.get(i + 1) {
            Some(next) => (next.host.as_str(), hop_port(next)),
            None => (target_host, target_port),
        };

        emit_progress(
            app,
            progress_id,
            format!(
                "Hop {}/{}: opening tunnel to {}:{}...",
                hop_n, total, next_host, next_port
            ),
        );

        let channel = session
            .channel_direct_tcpip(next_host, next_port, None)
            .map_err(|e| {
                SshError::ChannelError(format!(
                    "Tunnel from {} to {}:{}: {}",
                    hop.host, next_host, next_port, e
                ))
            })?;

        stream = bridge_to_loopback(channel, session)?;
    }

    Ok(stream)
}

impl SshManager {
    pub fn new() -> Self {
        SshManager {
            channels: Mutex::new(HashMap::new()),
            dead_channels: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Clean up channels whose reader thread detected EOF/error
    pub fn cleanup_dead_channels(&self) {
        let dead_ids: Vec<String> = {
            let mut dead = self.dead_channels.lock().unwrap();
            std::mem::take(&mut *dead)
        };

        if dead_ids.is_empty() {
            return;
        }

        let mut channels = self.channels.lock().unwrap();
        for id in dead_ids {
            if let Some(ssh) = channels.remove(&id) {
                ssh.running.store(false, Ordering::Relaxed);
                if let Ok(mut inner) = ssh.inner.lock() {
                    inner.channel.send_eof().ok();
                    inner.channel.close().ok();
                }
                log::info!("Cleaned up dead channel: {}", id);
            }
        }
    }

    /// Connect to the session's host (directly or through its jump chain),
    /// open a PTY shell and spawn the reader thread. Credentials come already
    /// decrypted inside `config` (loaded backend-side from the DB).
    pub fn connect(
        &self,
        app: &tauri::AppHandle,
        config: &SessionConfig,
        progress_id: Option<&str>,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<String, SshError> {
        // Clean up any dead channels first
        self.cleanup_dead_channels();

        let port = config.port.clamp(1, 65535) as u16;
        let valid_hops: Vec<JumpHop> = config
            .jump_hops
            .iter()
            .filter(|h| !h.host.trim().is_empty())
            .cloned()
            .collect();

        let stream = if valid_hops.is_empty() {
            tcp_connect(&config.host, port)?
        } else {
            open_chain_stream(
                app,
                progress_id,
                &config.username,
                &valid_hops,
                &config.host,
                port,
            )?
        };

        emit_progress(
            app,
            progress_id,
            format!("Authenticating on {}:{}...", config.host, port),
        );

        let mut session = SshSession::new()?;
        session.set_timeout(SSH_BLOCKING_TIMEOUT_MS);
        session.set_compress(true);
        session.set_tcp_stream(stream);
        session.handshake()?;

        // Verify against the logical host (even when tunneled through a jump)
        verify_host_key(&session, &config.host, port)?;

        authenticate(
            &session,
            &config.username,
            &config.auth_method,
            config.password.as_deref(),
            config.private_key_path.as_deref(),
            config.private_key_passphrase.as_deref(),
        )?;

        let mut channel = session.channel_session()?;

        let term_cols = cols.unwrap_or(80) as u32;
        let term_rows = rows.unwrap_or(24) as u32;

        channel.request_pty("xterm-256color", None, Some((term_cols, term_rows, 0, 0)))?;
        channel.shell()?;

        session.set_keepalive(true, KEEPALIVE_INTERVAL_SECS);
        session.set_blocking(false);

        let channel_id = Uuid::new_v4().to_string();

        let inner = Arc::new(Mutex::new(SshChannelInner { session, channel }));
        let running = Arc::new(AtomicBool::new(true));

        let ssh_channel = SshChannel {
            id: channel_id.clone(),
            inner: inner.clone(),
            running: running.clone(),
        };

        // Spawn reader thread
        let app_handle = app.clone();
        let channel_id_clone = channel_id.clone();
        let inner_clone = inner.clone();
        let running_clone = running.clone();
        let dead_list = self.dead_channels.clone();

        thread::spawn(move || {
            let mut buf = vec![0u8; READ_BUFFER_SIZE];
            // Coalescing buffer: batches many small reads into one IPC event
            let mut pending: Vec<u8> = Vec::with_capacity(READ_BUFFER_SIZE);
            let mut last_flush = Instant::now();
            let mut last_keepalive = Instant::now();

            loop {
                if !running_clone.load(Ordering::Relaxed) {
                    break;
                }

                // Try to read from channel (lock held only during the non-blocking read)
                let read_result = {
                    let mut inner_guard = match inner_clone.lock() {
                        Ok(guard) => guard,
                        Err(_) => break,
                    };
                    inner_guard.channel.read(&mut buf)
                };

                match read_result {
                    Ok(n) if n > 0 => {
                        pending.extend_from_slice(&buf[..n]);
                        if pending.len() >= FLUSH_THRESHOLD
                            || last_flush.elapsed() >= FLUSH_INTERVAL
                        {
                            flush_pending(&app_handle, &channel_id_clone, &mut pending);
                            last_flush = Instant::now();
                        }
                        // Keep draining without sleeping while data flows
                    }
                    Ok(_) => {
                        flush_pending(&app_handle, &channel_id_clone, &mut pending);
                        // No data; check whether channel reached EOF
                        let is_eof = {
                            match inner_clone.lock() {
                                Ok(guard) => guard.channel.eof(),
                                Err(_) => break,
                            }
                        };
                        if is_eof {
                            let exit_status = match inner_clone.lock() {
                                Ok(guard) => guard.channel.exit_status().ok(),
                                Err(_) => None,
                            };
                            emit_pty_closed(&app_handle, &channel_id_clone, "normal", exit_status);
                            break;
                        }
                        thread::sleep(READ_POLL_INTERVAL);
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // Idle: deliver whatever is pending (low-latency path for typing)
                        flush_pending(&app_handle, &channel_id_clone, &mut pending);
                        last_flush = Instant::now();

                        if last_keepalive.elapsed() >= KEEPALIVE_SEND_INTERVAL {
                            if let Ok(inner_guard) = inner_clone.lock() {
                                inner_guard.session.keepalive_send().ok();
                            }
                            last_keepalive = Instant::now();
                        }
                        thread::sleep(READ_POLL_INTERVAL);
                    }
                    Err(_) => {
                        flush_pending(&app_handle, &channel_id_clone, &mut pending);
                        emit_pty_closed(&app_handle, &channel_id_clone, "error", None);
                        break;
                    }
                }
            }

            // If the channel died on its own, queue it for cleanup
            if running_clone.load(Ordering::Relaxed) {
                if let Ok(mut dead) = dead_list.lock() {
                    dead.push(channel_id_clone.clone());
                }
            }
            log::info!("Reader thread for {} exited", channel_id_clone);
        });

        self.channels
            .lock()
            .unwrap()
            .insert(channel_id.clone(), ssh_channel);

        Ok(channel_id)
    }

    pub fn send_command(&self, channel_id: &str, cmd: &str) -> Result<(), SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels
            .get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut inner = ssh.inner.lock().unwrap();
        // Session is non-blocking: retry on WouldBlock so no input is lost (e.g. large pastes)
        write_full(&mut inner.channel, cmd.as_bytes())?;
        Ok(())
    }

    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels
            .get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut inner = ssh.inner.lock().unwrap();

        // Temporarily set blocking to true for resize operation
        inner.session.set_blocking(true);
        let result = inner
            .channel
            .request_pty_size(cols as u32, rows as u32, None, None);
        inner.session.set_blocking(false);

        result.map_err(|e| SshError::ChannelError(format!("Resize failed: {}", e)))?;
        Ok(())
    }

    pub fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        if let Some(ssh) = channels.remove(channel_id) {
            // Signal the reader thread to stop
            ssh.running.store(false, Ordering::Relaxed);

            // Close the channel
            if let Ok(mut inner) = ssh.inner.lock() {
                inner.channel.send_eof().ok();
                inner.channel.close().ok();
                inner.channel.wait_close().ok();
            }
        }
        drop(channels);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_tilde_home_prefix() {
        let home = dirs::home_dir().expect("home dir");
        assert_eq!(expand_tilde("~/.ssh/id_rsa"), home.join(".ssh/id_rsa"));
        assert_eq!(expand_tilde("~"), home);
    }

    #[test]
    fn expand_tilde_plain_paths_untouched() {
        assert_eq!(expand_tilde("/etc/ssh"), PathBuf::from("/etc/ssh"));
        assert_eq!(expand_tilde("relative/path"), PathBuf::from("relative/path"));
    }

    #[test]
    fn take_complete_utf8_full_string() {
        let mut pending = "hola mundo".as_bytes().to_vec();
        assert_eq!(take_complete_utf8(&mut pending), "hola mundo");
        assert!(pending.is_empty());
    }

    #[test]
    fn take_complete_utf8_keeps_split_multibyte_tail() {
        // "ñ" = 0xC3 0xB1; feed only the first byte of the trailing char
        let mut pending = b"espa\xC3".to_vec();
        assert_eq!(take_complete_utf8(&mut pending), "espa");
        assert_eq!(pending, vec![0xC3]);

        // Next read completes the sequence
        pending.push(0xB1);
        assert_eq!(take_complete_utf8(&mut pending), "ñ");
        assert!(pending.is_empty());
    }

    #[test]
    fn take_complete_utf8_lossy_on_invalid_bytes() {
        // 0xFF can never start a UTF-8 sequence; followed by >3 bytes => lossy
        let mut pending = b"ok\xFF\xFF\xFF\xFF\xFFok".to_vec();
        let out = take_complete_utf8(&mut pending);
        assert!(out.starts_with("ok"));
        assert!(out.ends_with("ok"));
        assert!(out.contains('\u{FFFD}'));
        assert!(pending.is_empty());
    }

    #[test]
    fn known_hosts_entry_format() {
        assert_eq!(known_hosts_entry("server", 22), "server");
        assert_eq!(known_hosts_entry("server", 2222), "[server]:2222");
    }

    #[test]
    fn hop_port_defaults_invalid_to_22() {
        let mut hop = JumpHop {
            host: "h".into(),
            port: 0,
            username: String::new(),
            auth_method: "password".into(),
            password: None,
            private_key_path: None,
            private_key_passphrase: None,
        };
        assert_eq!(hop_port(&hop), 22);
        hop.port = 2222;
        assert_eq!(hop_port(&hop), 2222);
        hop.port = 70000;
        assert_eq!(hop_port(&hop), 22);
    }
}
