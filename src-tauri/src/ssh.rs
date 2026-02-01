//! SSH Connection module for SSH Manager

use ssh2::{Channel, Session as SshSession, Sftp};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
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
}

pub struct SshChannel {
    pub id: String,
    pub session: SshSession,
    pub channel: Channel,
    pub stream: TcpStream,
    // Store connection info for SFTP reconnection
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
}

pub struct SshManager {
    channels: Arc<Mutex<HashMap<String, SshChannel>>>,
}

impl SshManager {
    pub fn new() -> Self {
        SshManager {
            channels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn connect(
        &self,
        app: &AppHandle,
        host: &str,
        port: u16,
        username: &str,
        auth_method: &str,
        password: Option<&str>,
        private_key_path: Option<&str>,
        private_key_passphrase: Option<&str>,
        jump_host: Option<&str>,
        jump_port: Option<u16>,
        jump_username: Option<&str>,
        jump_password: Option<&str>,
        cols: Option<u32>,
        rows: Option<u32>,
    ) -> Result<String, SshError> {
        let cols = cols.unwrap_or(80) as u32;
        let rows = rows.unwrap_or(24) as u32;

        let stream = if let Some(jhost) = jump_host {
            self.connect_via_jump(
                jhost,
                jump_port.unwrap_or(22),
                jump_username.unwrap_or(username),
                jump_password.unwrap_or(password.unwrap_or("")),
                host,
                port,
            )?
        } else {
            TcpStream::connect(format!("{}:{}", host, port))
                .map_err(|e| SshError::ConnectionFailed(e.to_string()))?
        };

        let mut session = SshSession::new()?;
        session.set_tcp_stream(stream.try_clone()?);
        session.handshake()?;

        // Authenticate based on method
        match auth_method {
            "key" => {
                if let Some(key_path) = private_key_path {
                    let key_path = Path::new(key_path);
                    session
                        .userauth_pubkey_file(
                            username,
                            None,
                            key_path,
                            private_key_passphrase,
                        )
                        .map_err(|e| SshError::AuthFailed(format!("Key auth failed: {}", e)))?;
                } else {
                    return Err(SshError::AuthFailed("Private key path required for key authentication".to_string()));
                }
            }
            _ => {
                // Default to password authentication
                let pwd = password.unwrap_or("");
                session
                    .userauth_password(username, pwd)
                    .map_err(|e| SshError::AuthFailed(e.to_string()))?;
            }
        }

        let mut channel = session.channel_session()?;
        channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))?;
        channel.shell()?;
        session.set_blocking(false);

        let channel_id = Uuid::new_v4().to_string();
        let ssh_channel = SshChannel {
            id: channel_id.clone(),
            session,
            channel,
            stream,
            host: host.to_string(),
            port,
            username: username.to_string(),
            auth_method: auth_method.to_string(),
            password: password.map(|s| s.to_string()),
            private_key_path: private_key_path.map(|s| s.to_string()),
            private_key_passphrase: private_key_passphrase.map(|s| s.to_string()),
        };

        self.channels
            .lock()
            .unwrap()
            .insert(channel_id.clone(), ssh_channel);

        // Start read thread for this channel
        self.start_read_thread(app.clone(), channel_id.clone());

        Ok(channel_id)
    }

    fn connect_via_jump(
        &self,
        jump_host: &str,
        jump_port: u16,
        jump_username: &str,
        jump_password: &str,
        target_host: &str,
        target_port: u16,
    ) -> Result<TcpStream, SshError> {
        let jump_stream = TcpStream::connect(format!("{}:{}", jump_host, jump_port))
            .map_err(|e| SshError::ConnectionFailed(format!("Jump host: {}", e)))?;

        let mut jump_session = SshSession::new()?;
        jump_session.set_tcp_stream(jump_stream.try_clone()?);
        jump_session.handshake()?;
        jump_session
            .userauth_password(jump_username, jump_password)
            .map_err(|e| SshError::AuthFailed(format!("Jump auth: {}", e)))?;

        let _channel = jump_session
            .channel_direct_tcpip(target_host, target_port, None)
            .map_err(|e| SshError::ChannelError(e.to_string()))?;

        Ok(jump_stream)
    }

    pub fn send_command(&self, channel_id: &str, cmd: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        let ssh = channels
            .get_mut(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;
        ssh.channel.write_all(cmd.as_bytes())?;
        Ok(())
    }

    pub fn read_output(&self, channel_id: &str) -> Result<String, SshError> {
        let mut channels = self.channels.lock().unwrap();
        let ssh = channels
            .get_mut(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut buf = vec![0u8; 4096];
        match ssh.channel.read(&mut buf) {
            Ok(n) if n > 0 => Ok(String::from_utf8_lossy(&buf[0..n]).to_string()),
            Ok(_) => Ok(String::new()),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(String::new()),
            Err(e) => Err(SshError::IoError(e)),
        }
    }

    pub fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        if let Some(mut ssh) = channels.remove(channel_id) {
            ssh.channel.close().ok();
            ssh.channel.wait_close().ok();
        }
        Ok(())
    }

    /// Resize the terminal
    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        let ssh = channels
            .get_mut(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        ssh.channel
            .request_pty_size(cols as u32, rows as u32, None, None)
            .map_err(|e| SshError::ChannelError(format!("Failed to resize: {}", e)))?;

        Ok(())
    }

    /// Create a new SFTP session (separate from terminal)
    pub fn create_sftp_session(&self, channel_id: &str) -> Result<Sftp, SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels
            .get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        // Create a new TCP connection for SFTP
        let stream = TcpStream::connect(format!("{}:{}", ssh.host, ssh.port))
            .map_err(|e| SshError::ConnectionFailed(format!("SFTP connection: {}", e)))?;

        let mut session = SshSession::new()?;
        session.set_tcp_stream(stream);
        session.handshake()?;

        // Authenticate using stored credentials
        match ssh.auth_method.as_str() {
            "key" => {
                if let Some(ref key_path) = ssh.private_key_path {
                    let key_path = Path::new(key_path);
                    session
                        .userauth_pubkey_file(
                            &ssh.username,
                            None,
                            key_path,
                            ssh.private_key_passphrase.as_deref(),
                        )
                        .map_err(|e| SshError::AuthFailed(format!("SFTP key auth: {}", e)))?;
                } else {
                    return Err(SshError::AuthFailed("No key path stored".to_string()));
                }
            }
            _ => {
                let pwd = ssh.password.as_deref().unwrap_or("");
                session
                    .userauth_password(&ssh.username, pwd)
                    .map_err(|e| SshError::AuthFailed(format!("SFTP auth: {}", e)))?;
            }
        }

        session.set_blocking(true);
        let sftp = session
            .sftp()
            .map_err(|e| SshError::ChannelError(format!("Failed to create SFTP: {}", e)))?;

        Ok(sftp)
    }

    /// Start a background thread to read from the SSH channel and emit events
    fn start_read_thread(&self, app: AppHandle, channel_id: String) {
        let channels = self.channels.clone();

        thread::spawn(move || {
            let mut buf = vec![0u8; 8192];

            loop {
                thread::sleep(Duration::from_millis(10));

                let (result, is_eof) = {
                    let mut channels_guard = channels.lock().unwrap();
                    if let Some(ssh) = channels_guard.get_mut(&channel_id) {
                        // Check if channel is at EOF (closed by remote)
                        let eof = ssh.channel.eof();

                        match ssh.channel.read(&mut buf) {
                            Ok(n) if n > 0 => (Some(buf[0..n].to_vec()), false),
                            Ok(_) => (None, eof),
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => (None, eof),
                            Err(_) => {
                                // Connection closed or error
                                (None, true)
                            }
                        }
                    } else {
                        // Channel removed
                        (None, true)
                    }
                };

                if let Some(data) = result {
                    let output = String::from_utf8_lossy(&data).to_string();
                    let _ = app.emit(&format!("ssh-output-{}", channel_id), output);
                }

                // If EOF detected, emit closed event and exit loop
                if is_eof {
                    log::info!("SSH channel {} closed (EOF)", channel_id);
                    let _ = app.emit("pty_closed", channel_id.clone());

                    // Remove the channel from the map
                    let mut channels_guard = channels.lock().unwrap();
                    if let Some(mut ssh) = channels_guard.remove(&channel_id) {
                        ssh.channel.close().ok();
                        ssh.channel.wait_close().ok();
                    }
                    break;
                }
            }
        });
    }
}
