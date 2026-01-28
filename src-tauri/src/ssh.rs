//! SSH Connection module for SSH Manager

use ssh2::{Session as SshSession, Channel};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use thiserror::Error;
use uuid::Uuid;
use tauri::Emitter;

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

pub(crate) struct SshChannelInner {
    pub(crate) session: SshSession,
    pub(crate) channel: Channel,
    pub(crate) _stream: TcpStream,
}

pub struct SshChannel {
    #[allow(dead_code)]
    pub id: String,
    pub(crate) inner: Arc<Mutex<SshChannelInner>>,
    running: Arc<Mutex<bool>>,
}

pub struct SshManager {
    pub(crate) channels: Mutex<HashMap<String, SshChannel>>,
    dead_channels: Mutex<Vec<String>>,
}

impl SshManager {
    pub fn new() -> Self {
        SshManager {
            channels: Mutex::new(HashMap::new()),
            dead_channels: Mutex::new(Vec::new()),
        }
    }

    /// Mark a channel as dead (to be cleaned up)
    fn mark_dead(&self, channel_id: &str) {
        if let Ok(mut dead) = self.dead_channels.lock() {
            if !dead.contains(&channel_id.to_string()) {
                dead.push(channel_id.to_string());
            }
        }
    }

    /// Clean up dead channels - call periodically or before operations
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
                // Signal thread to stop
                if let Ok(mut running) = ssh.running.lock() {
                    *running = false;
                }
                // Try to close channel
                if let Ok(mut inner) = ssh.inner.lock() {
                    inner.channel.send_eof().ok();
                    inner.channel.close().ok();
                }
                log::info!("Cleaned up dead channel: {}", id);
            }
        }
    }

    pub fn connect(
        &self,
        app: &tauri::AppHandle,
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
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<String, SshError> {
        // Clean up any dead channels first
        self.cleanup_dead_channels();

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

        stream.set_read_timeout(Some(Duration::from_millis(100))).ok();
        stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

        let mut session = SshSession::new()?;
        session.set_tcp_stream(stream.try_clone()?);
        session.handshake()?;

        // Authenticate based on method
        match auth_method {
            "key" => {
                let key_path = private_key_path
                    .ok_or_else(|| SshError::AuthFailed("No private key path provided".to_string()))?;
                let key_path = std::path::Path::new(key_path);

                if !key_path.exists() {
                    return Err(SshError::AuthFailed(format!("Key file not found: {}", key_path.display())));
                }

                session.userauth_pubkey_file(
                    username,
                    None, // public key (auto-derived)
                    key_path,
                    private_key_passphrase,
                ).map_err(|e| SshError::AuthFailed(format!("Key auth failed: {}", e)))?;
            }
            _ => {
                // Default to password auth
                let pwd = password.unwrap_or("");
                session.userauth_password(username, pwd)
                    .map_err(|e| SshError::AuthFailed(e.to_string()))?;
            }
        }

        let mut channel = session.channel_session()?;

        let term_cols = cols.unwrap_or(80) as u32;
        let term_rows = rows.unwrap_or(24) as u32;

        channel.request_pty("xterm-256color", None, Some((term_cols, term_rows, 0, 0)))?;
        channel.shell()?;

        session.set_blocking(false);

        let channel_id = Uuid::new_v4().to_string();

        let inner = Arc::new(Mutex::new(SshChannelInner {
            session,
            channel,
            _stream: stream,
        }));

        let running = Arc::new(Mutex::new(true));

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

        thread::spawn(move || {
            let mut buf = vec![0u8; 8192];

            loop {
                // Check if we should stop
                {
                    let is_running = running_clone.lock().unwrap();
                    if !*is_running {
                        break;
                    }
                }

                // Try to read from channel
                let read_result = {
                    let mut inner_guard = match inner_clone.lock() {
                        Ok(guard) => guard,
                        Err(_) => break,
                    };

                    inner_guard.channel.read(&mut buf)
                };

                match read_result {
                    Ok(n) if n > 0 => {
                        let data = String::from_utf8_lossy(&buf[0..n]).to_string();
                        let _ = app_handle.emit("pty_output", serde_json::json!({
                            "channelId": channel_id_clone,
                            "data": data
                        }));
                    }
                    Ok(_) => {
                        // No data, check if channel is closed
                        let is_eof = {
                            let inner_guard = match inner_clone.lock() {
                                Ok(guard) => guard,
                                Err(_) => break,
                            };
                            inner_guard.channel.eof()
                        };

                        if is_eof {
                            let _ = app_handle.emit("pty_closed", &channel_id_clone);
                            break;
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // No data available, sleep briefly
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => {
                        // Error reading, channel probably closed
                        let _ = app_handle.emit("pty_closed", &channel_id_clone);
                        break;
                    }
                }
            }

            log::info!("Reader thread for {} exited", channel_id_clone);
        });

        self.channels.lock().unwrap().insert(channel_id.clone(), ssh_channel);
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
        jump_session.userauth_password(jump_username, jump_password)
            .map_err(|e| SshError::AuthFailed(format!("Jump auth: {}", e)))?;

        let _channel = jump_session.channel_direct_tcpip(target_host, target_port, None)
            .map_err(|e| SshError::ChannelError(e.to_string()))?;

        Ok(jump_stream)
    }

    pub fn send_command(&self, channel_id: &str, cmd: &str) -> Result<(), SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut inner = ssh.inner.lock().unwrap();
        inner.channel.write_all(cmd.as_bytes())?;
        inner.channel.flush()?;
        Ok(())
    }

    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut inner = ssh.inner.lock().unwrap();

        // Temporarily set blocking to true for resize operation
        inner.session.set_blocking(true);
        let result = inner.channel.request_pty_size(cols as u32, rows as u32, None, None);
        inner.session.set_blocking(false);

        result.map_err(|e| SshError::ChannelError(format!("Resize failed: {}", e)))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn read_output(&self, channel_id: &str) -> Result<String, SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut inner = ssh.inner.lock().unwrap();

        let mut buf = vec![0u8; 4096];
        match inner.channel.read(&mut buf) {
            Ok(n) if n > 0 => Ok(String::from_utf8_lossy(&buf[0..n]).to_string()),
            Ok(_) => Ok(String::new()),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(String::new()),
            Err(e) => Err(SshError::IoError(e)),
        }
    }

    pub fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        if let Some(ssh) = channels.remove(channel_id) {
            // Signal the reader thread to stop
            {
                let mut running = ssh.running.lock().unwrap();
                *running = false;
            }

            // Close the channel
            if let Ok(mut inner) = ssh.inner.lock() {
                inner.channel.send_eof().ok();
                inner.channel.close().ok();
                inner.channel.wait_close().ok();
            }
        }
        Ok(())
    }
}
