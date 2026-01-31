//! SSH Connection module for SSH Manager with PTY support and Tauri events

use ssh2::{Channel, Session as SshSession};
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

/// Connection parameters stored for SFTP session creation
#[derive(Clone)]
pub struct ConnectionParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub jump_host: Option<String>,
    pub jump_port: Option<u16>,
    pub jump_username: Option<String>,
    pub jump_password: Option<String>,
}

pub struct SshChannel {
    pub id: String,
    session: SshSession,
    channel: Channel,
    _stream: TcpStream,
    alive: Arc<Mutex<bool>>,
    pub connection_params: ConnectionParams,
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

    /// Main connect method with full PTY support
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

        // Connect to SSH server (with or without jump host)
        let stream = if let Some(jhost) = jump_host {
            self.connect_via_jump(
                jhost,
                jump_port.unwrap_or(22),
                jump_username.unwrap_or(username),
                jump_password.or(password).unwrap_or(""),
                host,
                port,
            )?
        } else {
            TcpStream::connect(format!("{}:{}", host, port))
                .map_err(|e| SshError::ConnectionFailed(e.to_string()))?
        };

        stream
            .set_read_timeout(Some(Duration::from_millis(100)))
            .ok();

        let mut session = SshSession::new()?;
        session.set_tcp_stream(stream.try_clone()?);
        session.handshake()?;

        // Authentication based on method
        match auth_method {
            "key" => {
                let key_path = private_key_path
                    .ok_or_else(|| SshError::AuthFailed("Private key path required".to_string()))?;
                let expanded_path = shellexpand::tilde(key_path).to_string();
                session
                    .userauth_pubkey_file(
                        username,
                        None,
                        std::path::Path::new(&expanded_path),
                        private_key_passphrase,
                    )
                    .map_err(|e| SshError::AuthFailed(format!("Key auth failed: {}", e)))?;
            }
            _ => {
                // Password authentication
                let pwd = password.unwrap_or("");
                session
                    .userauth_password(username, pwd)
                    .map_err(|e| SshError::AuthFailed(format!("Password auth failed: {}", e)))?;
            }
        }

        // Open channel with PTY
        let mut channel = session.channel_session()?;
        channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))?;
        channel.shell()?;
        session.set_blocking(false);

        let channel_id = Uuid::new_v4().to_string();
        let alive = Arc::new(Mutex::new(true));

        // Store connection params for SFTP
        let connection_params = ConnectionParams {
            host: host.to_string(),
            port,
            username: username.to_string(),
            auth_method: auth_method.to_string(),
            password: password.map(|s| s.to_string()),
            private_key_path: private_key_path.map(|s| s.to_string()),
            private_key_passphrase: private_key_passphrase.map(|s| s.to_string()),
            jump_host: jump_host.map(|s| s.to_string()),
            jump_port,
            jump_username: jump_username.map(|s| s.to_string()),
            jump_password: jump_password.map(|s| s.to_string()),
        };

        let ssh_channel = SshChannel {
            id: channel_id.clone(),
            session,
            channel,
            _stream: stream,
            alive: alive.clone(),
            connection_params,
        };

        self.channels
            .lock()
            .unwrap()
            .insert(channel_id.clone(), ssh_channel);

        // Start output reader thread
        self.start_output_reader(app.clone(), channel_id.clone(), alive);

        Ok(channel_id)
    }

    /// Start background thread to emit close event when session dies
    fn start_output_reader(&self, app: AppHandle, channel_id: String, alive: Arc<Mutex<bool>>) {
        thread::spawn(move || loop {
            if !*alive.lock().unwrap() {
                let _ = app.emit("pty_closed", &channel_id);
                break;
            }
            thread::sleep(Duration::from_millis(100));
        });
    }

    /// Connect via jump host (bastion)
    fn connect_via_jump(
        &self,
        jump_host: &str,
        jump_port: u16,
        jump_username: &str,
        jump_password: &str,
        target_host: &str,
        target_port: u16,
    ) -> Result<TcpStream, SshError> {
        // Connect to jump host
        let jump_stream = TcpStream::connect(format!("{}:{}", jump_host, jump_port))
            .map_err(|e| SshError::ConnectionFailed(format!("Jump host connection: {}", e)))?;

        let mut jump_session = SshSession::new()?;
        jump_session.set_tcp_stream(jump_stream.try_clone()?);
        jump_session.handshake()?;
        jump_session
            .userauth_password(jump_username, jump_password)
            .map_err(|e| SshError::AuthFailed(format!("Jump auth: {}", e)))?;

        // Create tunnel to target
        let _channel = jump_session
            .channel_direct_tcpip(target_host, target_port, None)
            .map_err(|e| SshError::ChannelError(format!("Tunnel: {}", e)))?;

        // For now, return the jump stream (simplified)
        Ok(jump_stream)
    }

    /// Send data to the PTY
    pub fn send_command(&self, channel_id: &str, data: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        let ssh = channels
            .get_mut(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;
        ssh.channel.write_all(data.as_bytes())?;
        ssh.channel.flush()?;
        Ok(())
    }

    /// Read output from the PTY (non-blocking)
    pub fn read_output(&self, channel_id: &str) -> Result<Vec<u8>, SshError> {
        let mut channels = self.channels.lock().unwrap();
        let ssh = channels
            .get_mut(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut buf = vec![0u8; 16384];
        let mut output = Vec::new();

        // Read stdout
        loop {
            match ssh.channel.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => output.extend_from_slice(&buf[..n]),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(_) => break,
            }
        }

        // Read stderr
        loop {
            match ssh.channel.stderr().read(&mut buf) {
                Ok(0) => break,
                Ok(n) => output.extend_from_slice(&buf[..n]),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(_) => break,
            }
        }

        Ok(output)
    }

    /// Resize the PTY
    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        let ssh = channels
            .get_mut(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        // PTY resize request
        ssh.channel
            .request_pty_size(cols as u32, rows as u32, None, None)
            .map_err(|e| SshError::ChannelError(format!("Resize failed: {}", e)))?;

        Ok(())
    }

    /// Disconnect a session
    pub fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        if let Some(mut ssh) = channels.remove(channel_id) {
            *ssh.alive.lock().unwrap() = false;
            ssh.channel.send_eof().ok();
            ssh.channel.close().ok();
            ssh.channel.wait_close().ok();
        }
        Ok(())
    }

    /// Check if session is still alive
    pub fn is_alive(&self, channel_id: &str) -> bool {
        let channels = self.channels.lock().unwrap();
        if let Some(ssh) = channels.get(channel_id) {
            *ssh.alive.lock().unwrap() && !ssh.channel.eof()
        } else {
            false
        }
    }

    /// Get connection params for creating SFTP session
    pub fn get_connection_params(&self, channel_id: &str) -> Option<ConnectionParams> {
        let channels = self.channels.lock().unwrap();
        channels
            .get(channel_id)
            .map(|c| c.connection_params.clone())
    }

    /// Create a new SFTP session using stored connection params
    pub fn create_sftp_session(&self, channel_id: &str) -> Result<ssh2::Sftp, SshError> {
        let params = self
            .get_connection_params(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        // Create new connection for SFTP
        let stream = TcpStream::connect(format!("{}:{}", params.host, params.port))
            .map_err(|e| SshError::ConnectionFailed(e.to_string()))?;

        let mut session = SshSession::new()?;
        session.set_tcp_stream(stream);
        session.handshake()?;

        // Authenticate
        match params.auth_method.as_str() {
            "key" => {
                if let Some(key_path) = &params.private_key_path {
                    let expanded = shellexpand::tilde(key_path).to_string();
                    session.userauth_pubkey_file(
                        &params.username,
                        None,
                        std::path::Path::new(&expanded),
                        params.private_key_passphrase.as_deref(),
                    )?;
                }
            }
            _ => {
                session.userauth_password(
                    &params.username,
                    params.password.as_deref().unwrap_or(""),
                )?;
            }
        }

        session
            .sftp()
            .map_err(|e| SshError::ChannelError(e.to_string()))
    }
}
