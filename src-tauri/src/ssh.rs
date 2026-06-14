//! SSH Connection module for SSH Manager
//!
//! Backend SSH en Rust puro (russh): sin libssh2 ni OpenSSL. Toda la pila es
//! async sobre tokio; los túneles multi-hop usan el canal direct-tcpip como
//! stream directamente (sin puente loopback local).

use crate::db::{JumpHop, Session as SessionConfig};
use russh::client::{self, Handle};
use russh::keys::agent::client::{AgentClient, AgentStream};
use russh::keys::agent::AgentIdentity;
use russh::keys::known_hosts::{check_known_hosts_path, learn_known_hosts_path};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKey};
use russh::{cipher, kex, mac, ChannelMsg, ChannelWriteHalf, Disconnect};
use std::borrow::Cow;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use thiserror::Error;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::Notify;
use uuid::Uuid;

// Tuning constants
const TCP_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
// Coalesce PTY output: emit one IPC event per batch instead of per message.
// With data pending, wait this long for more before flushing (echo latency cap)
const FLUSH_INTERVAL: Duration = Duration::from_millis(4);
const FLUSH_THRESHOLD: usize = 32 * 1024;
// With nothing pending the reader just parks on the channel
const IDLE_WAIT: Duration = Duration::from_secs(60);
// Graceful close must not hang the disconnect command on a dead network
const DISCONNECT_TIMEOUT: Duration = Duration::from_secs(5);
// Keepalive: detect dead connections and keep NAT mappings alive (handled by
// russh's session task; keepalive_max unanswered probes close the connection)
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
const KEEPALIVE_MAX: usize = 4;

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
    #[error("SSH error: {0}")]
    Protocol(#[from] russh::Error),
    #[error("SSH key error: {0}")]
    KeyError(#[from] russh::keys::Error),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("Host key verification failed: {0}")]
    HostKeyMismatch(String),
}

/// Everything a live terminal needs: the write half feeds keystrokes/resizes,
/// the handles keep the SSH session (and every jump hop's session) alive.
struct ChannelEntry {
    write: ChannelWriteHalf<client::Msg>,
    handle: Handle<TofuHandler>,
    // Dropping a hop handle tears its session down, so they live here
    #[allow(dead_code)]
    hop_handles: Vec<Handle<TofuHandler>>,
    close_notify: Arc<Notify>,
}

pub struct SshManager {
    channels: Mutex<HashMap<String, Arc<ChannelEntry>>>,
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

// Algoritmos de compatibilidad: los modernos (seguros) van primero, pero
// añadimos los legacy que russh excluye por defecto para poder conectar con
// equipos viejos (switches/firewalls/bastiones) que solo ofrecen ECDH NIST,
// diffie-hellman-group14-sha1, cifrados CBC o HMAC-SHA1.
const COMPAT_KEX: &[kex::Name] = &[
    kex::MLKEM768X25519_SHA256,
    kex::CURVE25519,
    kex::CURVE25519_PRE_RFC_8731,
    kex::DH_GEX_SHA256,
    kex::DH_G16_SHA512,
    kex::DH_G14_SHA256,
    // Legacy (añadidos): NIST P-256/384/521 y group14-sha1
    kex::ECDH_SHA2_NISTP256,
    kex::ECDH_SHA2_NISTP384,
    kex::ECDH_SHA2_NISTP521,
    kex::DH_G14_SHA1,
    kex::DH_GEX_SHA1,
    // Extensiones OpenSSH (ext-info / strict-kex) como cliente
    kex::EXTENSION_SUPPORT_AS_CLIENT,
    kex::EXTENSION_OPENSSH_STRICT_KEX_AS_CLIENT,
];

const COMPAT_CIPHER: &[cipher::Name] = &[
    cipher::CHACHA20_POLY1305,
    cipher::AES_256_GCM,
    cipher::AES_256_CTR,
    cipher::AES_192_CTR,
    cipher::AES_128_CTR,
    // Legacy (añadidos): CBC para equipos antiguos
    cipher::AES_256_CBC,
    cipher::AES_192_CBC,
    cipher::AES_128_CBC,
];

const COMPAT_MAC: &[mac::Name] = &[
    mac::HMAC_SHA512_ETM,
    mac::HMAC_SHA256_ETM,
    mac::HMAC_SHA512,
    mac::HMAC_SHA256,
    // Legacy (añadidos): HMAC-SHA1
    mac::HMAC_SHA1_ETM,
    mac::HMAC_SHA1,
];

/// Shared client config: russh sends keepalives and closes the connection
/// after KEEPALIVE_MAX unanswered probes
fn client_config() -> Arc<client::Config> {
    // Partimos del DEFAULT (mantiene host-keys y compresión) y ampliamos la
    // lista de algoritmos para compatibilidad con servidores antiguos.
    let mut preferred = russh::Preferred::DEFAULT;
    preferred.kex = Cow::Borrowed(COMPAT_KEX);
    preferred.cipher = Cow::Borrowed(COMPAT_CIPHER);
    preferred.mac = Cow::Borrowed(COMPAT_MAC);

    Arc::new(client::Config {
        keepalive_interval: Some(KEEPALIVE_INTERVAL),
        keepalive_max: KEEPALIVE_MAX,
        nodelay: true,
        preferred,
        ..Default::default()
    })
}

/// TCP connect with explicit timeout (DNS resolution included)
async fn tcp_connect(host: &str, port: u16) -> Result<tokio::net::TcpStream, SshError> {
    let stream = tokio::time::timeout(
        TCP_CONNECT_TIMEOUT,
        tokio::net::TcpStream::connect((host, port)),
    )
    .await
    .map_err(|_| SshError::ConnectionFailed(format!("{}:{}: connect timeout", host, port)))?
    .map_err(|e| SshError::ConnectionFailed(format!("{}:{}: {}", host, port, e)))?;
    stream.set_nodelay(true).ok();
    Ok(stream)
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
    crate::db::data_dir().join("known_hosts")
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
fn verify_host_key_tofu(host: &str, port: u16, key: &PublicKey) -> Result<bool, SshError> {
    let file = known_hosts_path();
    match check_known_hosts_path(host, port, key, &file) {
        Ok(true) => Ok(true),
        Ok(false) => {
            // Trust on first use: persist the key for future checks
            learn_known_hosts_path(host, port, key, &file).map_err(|e| {
                SshError::HostKeyMismatch(format!("Cannot save known_hosts: {}", e))
            })?;
            log::info!(
                "Host key for {} stored (trust on first use)",
                known_hosts_entry(host, port)
            );
            Ok(true)
        }
        Err(russh::keys::Error::KeyChanged { .. }) => Err(SshError::HostKeyMismatch(format!(
            "Host key for {}:{} CHANGED. Possible man-in-the-middle attack. \
             If the server was legitimately reinstalled, remove its entry from {}",
            host,
            port,
            file.display()
        ))),
        Err(e) => Err(SshError::HostKeyMismatch(format!(
            "Could not verify host key for {}:{}: {}",
            host, port, e
        ))),
    }
}

/// russh handler: its only job is host key verification (TOFU) against the
/// logical host/port this session targets (even when tunneled through hops)
struct TofuHandler {
    host: String,
    port: u16,
}

impl client::Handler for TofuHandler {
    type Error = SshError;

    async fn check_server_key(&mut self, server_public_key: &PublicKey) -> Result<bool, SshError> {
        verify_host_key_tofu(&self.host, self.port, server_public_key)
    }
}

/// Connect to the platform's SSH agent (SSH_AUTH_SOCK on unix; the OpenSSH
/// named pipe or Pageant on Windows)
#[cfg(unix)]
async fn connect_agent(
) -> Result<AgentClient<Box<dyn AgentStream + Send + Unpin + 'static>>, SshError> {
    AgentClient::connect_env()
        .await
        .map(|c| c.dynamic())
        .map_err(|e| SshError::AuthFailed(format!("SSH agent: {}", e)))
}

#[cfg(windows)]
async fn connect_agent(
) -> Result<AgentClient<Box<dyn AgentStream + Send + Unpin + 'static>>, SshError> {
    const OPENSSH_AGENT_PIPE: &str = r"\\.\pipe\openssh-ssh-agent";
    if let Ok(client) = AgentClient::connect_named_pipe(OPENSSH_AGENT_PIPE).await {
        return Ok(client.dynamic());
    }
    AgentClient::connect_pageant()
        .await
        .map(|c| c.dynamic())
        .map_err(|e| SshError::AuthFailed(format!("SSH agent: {}", e)))
}

/// Authenticate an SSH session by password, private key (with ~ expansion)
/// or the running ssh-agent
async fn authenticate(
    handle: &mut Handle<TofuHandler>,
    username: &str,
    auth_method: &str,
    password: Option<&str>,
    private_key_path: Option<&str>,
    private_key_passphrase: Option<&str>,
) -> Result<(), SshError> {
    let result = match auth_method {
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

            let key = load_secret_key(&key_path, private_key_passphrase)
                .map_err(|e| SshError::AuthFailed(format!("Cannot load key: {}", e)))?;
            let hash_alg = handle.best_supported_rsa_hash().await?.flatten();
            handle
                .authenticate_publickey(
                    username,
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg),
                )
                .await
                .map_err(|e| SshError::AuthFailed(format!("Key auth failed: {}", e)))?
        }
        "agent" => {
            let mut agent = connect_agent().await?;
            let identities = agent
                .request_identities()
                .await
                .map_err(|e| SshError::AuthFailed(format!("SSH agent: {}", e)))?;
            let keys: Vec<PublicKey> = identities
                .into_iter()
                .filter_map(|id| match id {
                    AgentIdentity::PublicKey { key, .. } => Some(key),
                    _ => None,
                })
                .collect();
            if keys.is_empty() {
                return Err(SshError::AuthFailed(
                    "SSH agent has no identities loaded".to_string(),
                ));
            }
            let hash_alg = handle.best_supported_rsa_hash().await?.flatten();
            let mut accepted = false;
            for key in keys {
                let result = handle
                    .authenticate_publickey_with(username, key, hash_alg, &mut agent)
                    .await
                    .map_err(|e| SshError::AuthFailed(format!("SSH agent auth failed: {}", e)))?;
                if result.success() {
                    accepted = true;
                    break;
                }
            }
            if !accepted {
                return Err(SshError::AuthFailed(
                    "SSH agent auth failed: no identity accepted by server".to_string(),
                ));
            }
            return Ok(());
        }
        _ => {
            let pwd = password.unwrap_or("");
            handle
                .authenticate_password(username, pwd)
                .await
                .map_err(|e| SshError::AuthFailed(e.to_string()))?
        }
    };

    if !result.success() {
        return Err(SshError::AuthFailed(
            "Authentication rejected by server".to_string(),
        ));
    }
    Ok(())
}

/// Handshake + host key check (TOFU) + auth over any transport stream
/// (a TcpStream for direct connections, a tunneled SSH channel for hops)
#[allow(clippy::too_many_arguments)]
async fn establish<S>(
    stream: S,
    host: &str,
    port: u16,
    username: &str,
    auth_method: &str,
    password: Option<&str>,
    private_key_path: Option<&str>,
    private_key_passphrase: Option<&str>,
) -> Result<Handle<TofuHandler>, SshError>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let handler = TofuHandler {
        host: host.to_string(),
        port,
    };
    let mut handle = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        client::connect_stream(client_config(), stream, handler),
    )
    .await
    .map_err(|_| {
        SshError::ConnectionFailed(format!("{}:{}: SSH handshake timeout", host, port))
    })??;

    authenticate(
        &mut handle,
        username,
        auth_method,
        password,
        private_key_path,
        private_key_passphrase,
    )
    .await?;
    Ok(handle)
}

fn hop_port(hop: &JumpHop) -> u16 {
    if hop.port > 0 && hop.port <= 65535 {
        hop.port as u16
    } else {
        22
    }
}

fn hop_username<'a>(hop: &'a JumpHop, default_username: &'a str) -> &'a str {
    if hop.username.trim().is_empty() {
        default_username
    } else {
        hop.username.as_str()
    }
}

async fn establish_hop(
    stream: impl AsyncRead + AsyncWrite + Unpin + Send + 'static,
    hop: &JumpHop,
    hop_n: usize,
    default_username: &str,
) -> Result<Handle<TofuHandler>, SshError> {
    establish(
        stream,
        &hop.host,
        hop_port(hop),
        hop_username(hop, default_username),
        &hop.auth_method,
        hop.password.as_deref(),
        hop.private_key_path.as_deref(),
        hop.private_key_passphrase.as_deref(),
    )
    .await
    .map_err(|e| match e {
        // Host key errors must keep their exact format (the frontend parses it)
        SshError::HostKeyMismatch(_) => e,
        SshError::AuthFailed(msg) => {
            SshError::AuthFailed(format!("Hop {} ({}): {}", hop_n, hop.host, msg))
        }
        other => SshError::ConnectionFailed(format!("Hop {} ({}): {}", hop_n, hop.host, other)),
    })
}

/// Open a transport stream to the target through a chain of jump hosts.
/// Each hop: SSH session over the previous stream -> direct-tcpip channel to
/// the next hop (or the final target), used directly as the next transport.
/// Every hop gets full host key verification (TOFU) and its own auth method.
/// Returns the stream to the target plus every hop's session handle (they
/// must stay alive for the tunnel's lifetime).
async fn open_chain_stream(
    app: &tauri::AppHandle,
    progress_id: Option<&str>,
    default_username: &str,
    hops: &[JumpHop],
    target_host: &str,
    target_port: u16,
) -> Result<
    (
        impl AsyncRead + AsyncWrite + Unpin + Send + 'static,
        Vec<Handle<TofuHandler>>,
    ),
    SshError,
> {
    let total = hops.len();
    let mut handles: Vec<Handle<TofuHandler>> = Vec::with_capacity(total);

    let first = &hops[0];
    emit_progress(
        app,
        progress_id,
        format!(
            "Hop 1/{}: connecting to {}:{}...",
            total,
            first.host,
            hop_port(first)
        ),
    );
    let tcp = tcp_connect(&first.host, hop_port(first))
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("Hop 1 ({}): {}", first.host, e)))?;

    emit_progress(
        app,
        progress_id,
        format!("Hop 1/{}: authenticating on {}...", total, first.host),
    );
    let mut session = establish_hop(tcp, first, 1, default_username).await?;

    for (i, hop) in hops.iter().enumerate() {
        let hop_n = i + 1;
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
            .channel_open_direct_tcpip(next_host, next_port as u32, "127.0.0.1", 0)
            .await
            .map_err(|e| {
                SshError::ChannelError(format!(
                    "Tunnel from {} to {}:{}: {}",
                    hop.host, next_host, next_port, e
                ))
            })?;
        let stream = channel.into_stream();

        match hops.get(i + 1) {
            Some(next) => {
                emit_progress(
                    app,
                    progress_id,
                    format!(
                        "Hop {}/{}: authenticating on {}...",
                        hop_n + 1,
                        total,
                        next.host
                    ),
                );
                let new_session = establish_hop(stream, next, hop_n + 1, default_username).await?;
                handles.push(std::mem::replace(&mut session, new_session));
            }
            None => {
                handles.push(session);
                return Ok((stream, handles));
            }
        }
    }
    unreachable!("open_chain_stream called with empty hop list")
}

impl SshManager {
    pub fn new() -> Self {
        SshManager {
            channels: Mutex::new(HashMap::new()),
            dead_channels: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Clean up channels whose reader task detected EOF/error
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
            // Dropping the entry releases the write half and every session
            // handle (target + hops); russh tears the connections down
            if channels.remove(&id).is_some() {
                log::info!("Cleaned up dead channel: {}", id);
            }
        }
    }

    fn entry(&self, channel_id: &str) -> Result<Arc<ChannelEntry>, SshError> {
        self.channels
            .lock()
            .unwrap()
            .get(channel_id)
            .cloned()
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))
    }

    /// Connect to the session's host (directly or through its jump chain),
    /// open a PTY shell and spawn the reader task. Credentials come already
    /// decrypted inside `config` (loaded backend-side from the DB).
    pub async fn connect(
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

        let (handle, hop_handles) = if valid_hops.is_empty() {
            let tcp = tcp_connect(&config.host, port).await?;
            emit_progress(
                app,
                progress_id,
                format!("Authenticating on {}:{}...", config.host, port),
            );
            let handle = establish(
                tcp,
                &config.host,
                port,
                &config.username,
                &config.auth_method,
                config.password.as_deref(),
                config.private_key_path.as_deref(),
                config.private_key_passphrase.as_deref(),
            )
            .await?;
            (handle, Vec::new())
        } else {
            let (stream, hop_handles) = open_chain_stream(
                app,
                progress_id,
                &config.username,
                &valid_hops,
                &config.host,
                port,
            )
            .await?;
            emit_progress(
                app,
                progress_id,
                format!("Authenticating on {}:{}...", config.host, port),
            );
            // Verify against the logical host (even when tunneled through a jump)
            let handle = establish(
                stream,
                &config.host,
                port,
                &config.username,
                &config.auth_method,
                config.password.as_deref(),
                config.private_key_path.as_deref(),
                config.private_key_passphrase.as_deref(),
            )
            .await?;
            (handle, hop_handles)
        };

        let channel = handle.channel_open_session().await?;
        channel
            .request_pty(
                false,
                "xterm-256color",
                cols.unwrap_or(80) as u32,
                rows.unwrap_or(24) as u32,
                0,
                0,
                &[],
            )
            .await?;
        channel.request_shell(false).await?;

        let (mut read_half, write_half) = channel.split();
        let channel_id = Uuid::new_v4().to_string();
        let close_notify = Arc::new(Notify::new());

        // Spawn reader task: coalesces PTY output into batched IPC events
        let app_handle = app.clone();
        let channel_id_clone = channel_id.clone();
        let notify = close_notify.clone();
        let dead_list = self.dead_channels.clone();

        tauri::async_runtime::spawn(async move {
            let mut pending: Vec<u8> = Vec::with_capacity(FLUSH_THRESHOLD);
            let mut exit_status: Option<i32> = None;
            let mut eof_seen = false;
            // true when the frontend asked to disconnect (no pty_closed event)
            let mut external_close = false;

            loop {
                let wait_for = if pending.is_empty() {
                    IDLE_WAIT
                } else {
                    FLUSH_INTERVAL
                };

                tokio::select! {
                    _ = notify.notified() => {
                        external_close = true;
                        break;
                    }
                    msg = tokio::time::timeout(wait_for, read_half.wait()) => match msg {
                        // Quiet gap: deliver whatever is pending (typing echo path)
                        Err(_) => flush_pending(&app_handle, &channel_id_clone, &mut pending),
                        // Channel/session is gone
                        Ok(None) => {
                            flush_pending(&app_handle, &channel_id_clone, &mut pending);
                            let clean = eof_seen || exit_status.is_some();
                            emit_pty_closed(
                                &app_handle,
                                &channel_id_clone,
                                if clean { "normal" } else { "error" },
                                exit_status,
                            );
                            break;
                        }
                        Ok(Some(ChannelMsg::Data { data })) => {
                            pending.extend_from_slice(&data);
                            if pending.len() >= FLUSH_THRESHOLD {
                                flush_pending(&app_handle, &channel_id_clone, &mut pending);
                            }
                        }
                        Ok(Some(ChannelMsg::ExtendedData { data, .. })) => {
                            pending.extend_from_slice(&data);
                            if pending.len() >= FLUSH_THRESHOLD {
                                flush_pending(&app_handle, &channel_id_clone, &mut pending);
                            }
                        }
                        Ok(Some(ChannelMsg::ExitStatus { exit_status: status })) => {
                            exit_status = Some(status as i32);
                        }
                        Ok(Some(ChannelMsg::Eof)) => {
                            eof_seen = true;
                            flush_pending(&app_handle, &channel_id_clone, &mut pending);
                        }
                        Ok(Some(ChannelMsg::Close)) => {
                            flush_pending(&app_handle, &channel_id_clone, &mut pending);
                            emit_pty_closed(&app_handle, &channel_id_clone, "normal", exit_status);
                            break;
                        }
                        Ok(Some(_)) => {}
                    }
                }
            }

            // If the channel died on its own, queue it for cleanup
            if !external_close {
                if let Ok(mut dead) = dead_list.lock() {
                    dead.push(channel_id_clone.clone());
                }
            }
            log::info!("Reader task for {} exited", channel_id_clone);
        });

        let entry = ChannelEntry {
            write: write_half,
            handle,
            hop_handles,
            close_notify,
        };
        self.channels
            .lock()
            .unwrap()
            .insert(channel_id.clone(), Arc::new(entry));

        Ok(channel_id)
    }

    pub async fn send_command(&self, channel_id: &str, cmd: &str) -> Result<(), SshError> {
        let entry = self.entry(channel_id)?;
        // data_bytes waits for SSH window space: backpressure instead of data loss
        entry
            .write
            .data_bytes(cmd.as_bytes().to_vec())
            .await
            .map_err(|e| SshError::ChannelError(format!("Write failed: {}", e)))
    }

    pub async fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let entry = self.entry(channel_id)?;
        entry
            .write
            .window_change(cols as u32, rows as u32, 0, 0)
            .await
            .map_err(|e| SshError::ChannelError(format!("Resize failed: {}", e)))
    }

    pub async fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let entry = self.channels.lock().unwrap().remove(channel_id);
        if let Some(entry) = entry {
            // Stop the reader task first so it doesn't emit pty_closed
            entry.close_notify.notify_one();

            // Graceful close, bounded: a dead network must not hang the command
            let _ = tokio::time::timeout(DISCONNECT_TIMEOUT, async {
                entry.write.eof().await.ok();
                entry.write.close().await.ok();
                entry
                    .handle
                    .disconnect(Disconnect::ByApplication, "", "en")
                    .await
                    .ok();
            })
            .await;
            // Dropping the entry releases the hop sessions too
        }
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
        assert_eq!(
            expand_tilde("relative/path"),
            PathBuf::from("relative/path")
        );
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
            name: None,
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

    /// Prueba real contra un sshd local (docker):
    ///   docker run -d --rm -p 2222:2222 -e PASSWORD_ACCESS=true \
    ///     -e USER_NAME=test -e USER_PASSWORD=test123 \
    ///     --name ssh-test lscr.io/linuxserver/openssh-server
    ///   cargo test -- --ignored --test-threads=1 ssh_integration
    /// (en serie: ambos tests comparten la entrada known_hosts de [127.0.0.1]:2222)
    /// Valida: TCP + handshake + TOFU (alta y re-verificación) + auth password
    /// + shell PTY + eco de comando + forget_host_key.
    #[tokio::test]
    #[ignore]
    async fn ssh_integration_password_pty_roundtrip() {
        const HOST: &str = "127.0.0.1";
        const PORT: u16 = 2222;

        // Estado limpio: sin clave previa para este host
        forget_host_key(HOST, PORT).expect("forget pre-test");

        // Primera conexión: TOFU almacena la clave del servidor
        let tcp = tcp_connect(HOST, PORT).await.expect("tcp connect");
        let handle = establish(
            tcp,
            HOST,
            PORT,
            "test",
            "password",
            Some("test123"),
            None,
            None,
        )
        .await
        .expect("first connect (TOFU stores key)");
        drop(handle);

        // Segunda conexión: la clave almacenada debe coincidir
        let tcp = tcp_connect(HOST, PORT).await.expect("tcp connect 2");
        let handle = establish(
            tcp,
            HOST,
            PORT,
            "test",
            "password",
            Some("test123"),
            None,
            None,
        )
        .await
        .expect("second connect (key must match)");

        // Shell PTY de extremo a extremo: enviamos un comando y leemos el eco
        let channel = handle.channel_open_session().await.expect("open session");
        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .expect("request pty");
        channel.request_shell(false).await.expect("request shell");

        let (mut read_half, write_half) = channel.split();
        write_half
            .data_bytes("echo integracion_ok_$((40+2))\n".as_bytes().to_vec())
            .await
            .expect("write command");

        let mut output = String::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        while !output.contains("integracion_ok_42") {
            let msg = tokio::time::timeout_at(deadline, read_half.wait())
                .await
                .expect("timeout waiting for shell output")
                .expect("channel closed before output");
            if let ChannelMsg::Data { data } = msg {
                output.push_str(&String::from_utf8_lossy(&data));
            }
        }

        write_half.eof().await.ok();
        write_half.close().await.ok();
        handle
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .ok();

        // La clave aprendida por TOFU existe y se puede olvidar
        assert!(forget_host_key(HOST, PORT).expect("forget post-test"));
    }

    /// Prueba real del túnel multi-hop con el mismo sshd de docker (ver test
    /// anterior): sesión SSH al salto -> canal direct-tcpip hacia sí mismo ->
    /// el canal es el transporte de la segunda sesión SSH (sin puente local).
    #[tokio::test]
    #[ignore]
    async fn ssh_integration_jump_chain_channel_as_transport() {
        const HOST: &str = "127.0.0.1";
        const PORT: u16 = 2222;

        let tcp = tcp_connect(HOST, PORT).await.expect("tcp connect");
        let hop = establish(
            tcp,
            HOST,
            PORT,
            "test",
            "password",
            Some("test123"),
            None,
            None,
        )
        .await
        .expect("hop session");

        // Desde dentro del contenedor, 127.0.0.1:2222 es el propio sshd
        let channel = hop
            .channel_open_direct_tcpip(HOST, PORT as u32, "127.0.0.1", 0)
            .await
            .expect("direct-tcpip (¿AllowTcpForwarding activo?)");
        let stream = channel.into_stream();

        let target = establish(
            stream,
            HOST,
            PORT,
            "test",
            "password",
            Some("test123"),
            None,
            None,
        )
        .await
        .expect("target session over tunneled channel");

        let session = target.channel_open_session().await.expect("open session");
        session.exec(true, "echo tunel_ok").await.expect("exec");
        let (mut read_half, _write_half) = session.split();

        let mut output = String::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        while !output.contains("tunel_ok") {
            let msg = tokio::time::timeout_at(deadline, read_half.wait())
                .await
                .expect("timeout waiting for tunneled output")
                .expect("channel closed before output");
            if let ChannelMsg::Data { data } = msg {
                output.push_str(&String::from_utf8_lossy(&data));
            }
        }

        forget_host_key(HOST, PORT).ok();
    }

    #[test]
    fn hop_username_falls_back_to_default() {
        let mut hop = JumpHop {
            name: None,
            host: "h".into(),
            port: 22,
            username: String::new(),
            auth_method: "password".into(),
            password: None,
            private_key_path: None,
            private_key_passphrase: None,
        };
        assert_eq!(hop_username(&hop, "alex"), "alex");
        hop.username = "  ".into();
        assert_eq!(hop_username(&hop, "alex"), "alex");
        hop.username = "root".into();
        assert_eq!(hop_username(&hop, "alex"), "root");
    }
}
