//! SSH Connection module for ORI-SSHManager using native SSH (ssh2)
//! Cross-platform: works on macOS, Windows, and Linux without external dependencies

use ssh2::Session;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("PTY error: {0}")]
    PtyError(String),
}

/// Wrapper for the SSH channel that can be sent between threads
struct ChannelWrapper {
    channel: ssh2::Channel,
}

// Safety: ssh2::Channel is not Send by default, but we ensure thread-safe access via Mutex
unsafe impl Send for ChannelWrapper {}

pub struct SshChannel {
    channel: Arc<Mutex<ChannelWrapper>>,
    session: Arc<Mutex<Session>>,
    #[allow(dead_code)]
    jump_session: Option<Arc<Mutex<Session>>>,
    is_connected: Arc<Mutex<bool>>,
}

pub struct SshManager {
    channels: Mutex<HashMap<String, SshChannel>>,
}

impl SshManager {
    pub fn new() -> Self {
        SshManager {
            channels: Mutex::new(HashMap::new()),
        }
    }

    fn create_session(host: &str, port: u16, username: &str, password: &str) -> Result<(Session, TcpStream), SshError> {
        log::info!("Creating SSH session to {}@{}:{}", username, host, port);

        let tcp = TcpStream::connect_timeout(
            &format!("{}:{}", host, port).parse().map_err(|e| {
                SshError::ConnectionFailed(format!("Invalid address: {}", e))
            })?,
            Duration::from_secs(30),
        ).map_err(|e| SshError::ConnectionFailed(format!("TCP connect failed: {}", e)))?;

        tcp.set_read_timeout(Some(Duration::from_secs(30))).ok();
        tcp.set_write_timeout(Some(Duration::from_secs(30))).ok();
        tcp.set_nodelay(true).ok();

        let mut session = Session::new()
            .map_err(|e| SshError::ConnectionFailed(format!("Failed to create SSH session: {}", e)))?;

        session.set_tcp_stream(tcp.try_clone().map_err(|e| {
            SshError::ConnectionFailed(format!("Failed to clone TCP stream: {}", e))
        })?);

        session.handshake()
            .map_err(|e| SshError::ConnectionFailed(format!("SSH handshake failed: {}", e)))?;

        session.userauth_password(username, password)
            .map_err(|e| SshError::ConnectionFailed(format!("Authentication failed: {}", e)))?;

        if !session.authenticated() {
            return Err(SshError::ConnectionFailed("Authentication failed".to_string()));
        }

        log::info!("SSH session authenticated successfully");
        Ok((session, tcp))
    }

    pub fn connect(
        &self,
        app_handle: &AppHandle,
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        jump_host: Option<&str>,
        jump_port: Option<u16>,
        jump_username: Option<&str>,
        jump_password: Option<&str>,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<String, SshError> {
        let initial_cols = cols.unwrap_or(80);
        let initial_rows = rows.unwrap_or(24);

        log::info!(
            "Attempting SSH connection to {}@{}:{} ({}x{})",
            username, host, port, initial_cols, initial_rows
        );

        let (session, jump_session): (Session, Option<Session>) = if let Some(jhost) = jump_host {
            // Connect via jump host using SSH tunneling
            let jport = jump_port.unwrap_or(22);
            let juser = jump_username.unwrap_or(username);
            let jpass = jump_password.unwrap_or(password);

            log::info!("Connecting via jump host {}@{}:{}", juser, jhost, jport);

            // First, connect to jump host
            let (jump_sess, _jump_tcp) = Self::create_session(jhost, jport, juser, jpass)?;

            // Create a shell session on the jump host
            let mut shell_channel = jump_sess.channel_session()
                .map_err(|e| SshError::ConnectionFailed(format!("Jump shell channel failed: {}", e)))?;

            // Request PTY for the jump session
            shell_channel.request_pty("xterm-256color", None, Some((
                initial_cols as u32,
                initial_rows as u32,
                0,
                0,
            ))).map_err(|e| SshError::ConnectionFailed(format!("Jump PTY request failed: {}", e)))?;

            // Start shell on jump host
            shell_channel.shell()
                .map_err(|e| SshError::ConnectionFailed(format!("Jump shell start failed: {}", e)))?;

            // Wait for shell to initialize
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Now send SSH command to connect to the final destination
            let ssh_command = format!(
                "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p {} {}@{}\n",
                port, username, host
            );
            shell_channel.write_all(ssh_command.as_bytes())
                .map_err(|e| SshError::ConnectionFailed(format!("SSH command send failed: {}", e)))?;
            shell_channel.flush()
                .map_err(|e| SshError::ConnectionFailed(format!("SSH command flush failed: {}", e)))?;

            // Wait for SSH to prompt for password
            std::thread::sleep(std::time::Duration::from_millis(1500));

            // Send password
            shell_channel.write_all(format!("{}\n", password).as_bytes())
                .map_err(|e| SshError::ConnectionFailed(format!("Password send failed: {}", e)))?;
            shell_channel.flush()
                .map_err(|e| SshError::ConnectionFailed(format!("Password flush failed: {}", e)))?;

            // Wait for connection to establish
            std::thread::sleep(std::time::Duration::from_millis(1000));

            // Set session to non-blocking
            jump_sess.set_blocking(false);

            let channel_id = Uuid::new_v4().to_string();
            let is_connected = Arc::new(Mutex::new(true));
            let channel_wrapper = Arc::new(Mutex::new(ChannelWrapper { channel: shell_channel }));
            let session_arc = Arc::new(Mutex::new(jump_sess));

            // Spawn reader thread for jump host connection
            let connected_clone = is_connected.clone();
            let channel_id_clone = channel_id.clone();
            let app_handle_clone = app_handle.clone();
            let channel_clone = channel_wrapper.clone();

            thread::spawn(move || {
                let mut buf = [0u8; 8192];
                log::info!("Reader thread started for jump channel {}", channel_id_clone);

                loop {
                    if !*connected_clone.lock().unwrap() {
                        break;
                    }

                    let read_result = {
                        let mut locked = channel_clone.lock().unwrap();
                        locked.channel.read(&mut buf)
                    };

                    match read_result {
                        Ok(0) => {
                            let is_eof = {
                                let locked = channel_clone.lock().unwrap();
                                locked.channel.eof()
                            };

                            if is_eof {
                                log::info!("SSH channel EOF for {}", channel_id_clone);
                                *connected_clone.lock().unwrap() = false;
                                let _ = app_handle_clone.emit("pty_closed", &channel_id_clone);
                                break;
                            }
                            thread::sleep(Duration::from_millis(10));
                        }
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[0..n]).to_string();
                            let payload = serde_json::json!({
                                "channelId": channel_id_clone,
                                "data": data
                            });
                            let _ = app_handle_clone.emit("pty_output", &payload);
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(10));
                        }
                        Err(e) => {
                            if e.kind() != std::io::ErrorKind::Interrupted {
                                log::warn!("SSH read error: {}", e);
                                *connected_clone.lock().unwrap() = false;
                                let _ = app_handle_clone.emit("pty_closed", &channel_id_clone);
                                break;
                            }
                        }
                    }
                }
                log::info!("Reader thread ended for jump channel {}", channel_id_clone);
            });

            let ssh_channel = SshChannel {
                channel: channel_wrapper,
                session: session_arc,
                jump_session: None,
                is_connected,
            };

            self.channels.lock().unwrap().insert(channel_id.clone(), ssh_channel);
            return Ok(channel_id);
        } else {
            // Direct connection
            let (sess, _tcp) = Self::create_session(host, port, username, password)?;
            (sess, None)
        };

        // Request PTY and shell
        let mut channel = session.channel_session()
            .map_err(|e| SshError::ConnectionFailed(format!("Channel open failed: {}", e)))?;

        // Request PTY with size
        channel.request_pty("xterm-256color", None, Some((
            initial_cols as u32,
            initial_rows as u32,
            0,
            0,
        ))).map_err(|e| SshError::ConnectionFailed(format!("PTY request failed: {}", e)))?;

        // Start shell
        channel.shell()
            .map_err(|e| SshError::ConnectionFailed(format!("Shell start failed: {}", e)))?;

        // Set session to non-blocking for reading
        session.set_blocking(false);

        let channel_id = Uuid::new_v4().to_string();
        let is_connected = Arc::new(Mutex::new(true));
        let channel_wrapper = Arc::new(Mutex::new(ChannelWrapper { channel }));
        let session_arc = Arc::new(Mutex::new(session));
        let jump_session_arc = jump_session.map(|s| Arc::new(Mutex::new(s)));

        // Spawn a reader thread
        let connected_clone = is_connected.clone();
        let channel_id_clone = channel_id.clone();
        let app_handle_clone = app_handle.clone();
        let channel_clone = channel_wrapper.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            log::info!("Reader thread started for channel {}", channel_id_clone);

            loop {
                // Check if still connected
                if !*connected_clone.lock().unwrap() {
                    log::info!("Reader thread: channel {} marked as disconnected", channel_id_clone);
                    break;
                }

                let read_result = {
                    let mut locked = channel_clone.lock().unwrap();
                    locked.channel.read(&mut buf)
                };

                match read_result {
                    Ok(0) => {
                        // Check if channel is at EOF
                        let is_eof = {
                            let locked = channel_clone.lock().unwrap();
                            locked.channel.eof()
                        };

                        if is_eof {
                            log::info!("SSH channel EOF for {}", channel_id_clone);
                            *connected_clone.lock().unwrap() = false;
                            let _ = app_handle_clone.emit("pty_closed", &channel_id_clone);
                            break;
                        }
                        // No data available, sleep briefly
                        thread::sleep(Duration::from_millis(10));
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[0..n]).to_string();
                        let payload = serde_json::json!({
                            "channelId": channel_id_clone,
                            "data": data
                        });

                        if let Err(e) = app_handle_clone.emit("pty_output", &payload) {
                            log::warn!("Failed to emit pty_output: {}", e);
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // Non-blocking read, no data available
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(e) => {
                        // Check if it's just a temporary error
                        if e.kind() != std::io::ErrorKind::Interrupted {
                            log::warn!("SSH read error: {}", e);
                            *connected_clone.lock().unwrap() = false;
                            let _ = app_handle_clone.emit("pty_closed", &channel_id_clone);
                            break;
                        }
                    }
                }
            }
            log::info!("Reader thread ended for channel {}", channel_id_clone);
        });

        let ssh_channel = SshChannel {
            channel: channel_wrapper,
            session: session_arc,
            jump_session: jump_session_arc,
            is_connected,
        };

        self.channels.lock().unwrap().insert(channel_id.clone(), ssh_channel);

        Ok(channel_id)
    }

    pub fn send_command(&self, channel_id: &str, data: &str) -> Result<(), SshError> {
        log::debug!("send_command called: channel={}, data_len={}", channel_id, data.len());

        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        // Set session to blocking for write
        {
            let session = ssh.session.lock().unwrap();
            session.set_blocking(true);
        }

        let mut channel = ssh.channel.lock().unwrap();
        channel.channel.write_all(data.as_bytes())?;
        channel.channel.flush()?;

        // Set back to non-blocking
        {
            let session = ssh.session.lock().unwrap();
            session.set_blocking(false);
        }

        log::debug!("send_command success: {} bytes sent", data.len());
        Ok(())
    }

    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        // Set session to blocking for PTY resize
        {
            let session = ssh.session.lock().unwrap();
            session.set_blocking(true);
        }

        let result = {
            let mut channel = ssh.channel.lock().unwrap();
            channel.channel.request_pty_size(cols as u32, rows as u32, None, None)
        };

        // Set back to non-blocking
        {
            let session = ssh.session.lock().unwrap();
            session.set_blocking(false);
        }

        result.map_err(|e| SshError::PtyError(format!("Resize failed: {}", e)))?;

        log::debug!("Resized PTY {} to {}x{}", channel_id, cols, rows);
        Ok(())
    }

    pub fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        if let Some(ssh) = channels.remove(channel_id) {
            // Mark as disconnected to stop reader thread
            *ssh.is_connected.lock().unwrap() = false;

            // Try to close gracefully
            {
                let session = ssh.session.lock().unwrap();
                session.set_blocking(true);
            }

            {
                let mut channel = ssh.channel.lock().unwrap();
                let _ = channel.channel.write_all(b"exit\n");
                let _ = channel.channel.flush();
                let _ = channel.channel.send_eof();
                let _ = channel.channel.wait_close();
            }

            log::info!("SSH session {} disconnected", channel_id);
        }
        Ok(())
    }
}
