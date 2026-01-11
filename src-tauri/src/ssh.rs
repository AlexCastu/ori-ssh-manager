//! SSH Connection module for SSH Manager using PTY with Tauri events

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
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

pub struct SshChannel {
    pub id: String,
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
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
        log::info!("Attempting SSH connection to {}@{}:{} ({}x{})", username, host, port, initial_cols, initial_rows);

        // Create PTY system
        let pty_system = native_pty_system();

        // Create PTY pair with initial size from frontend
        let pair = pty_system.openpty(PtySize {
            rows: initial_rows,
            cols: initial_cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| SshError::PtyError(e.to_string()))?;

        // Build SSH command - use sshpass with SSH
        // The local PTY (portable-pty) provides the terminal interface
        // SSH -tt forces PTY on remote server
        let mut cmd = CommandBuilder::new("sshpass");
        cmd.arg("-p");
        cmd.arg(password);
        cmd.arg("ssh");
        cmd.arg("-t"); // Request PTY on server (single -t, server handles echo)
        cmd.arg("-o");
        cmd.arg("StrictHostKeyChecking=no");
        cmd.arg("-o");
        cmd.arg("UserKnownHostsFile=/dev/null");
        cmd.arg("-o");
        cmd.arg("LogLevel=ERROR");
        cmd.arg("-o");
        cmd.arg("ServerAliveInterval=30");
        cmd.arg("-o");
        cmd.arg("ServerAliveCountMax=3");
        cmd.arg("-p");
        cmd.arg(port.to_string());

        // Add jump host if specified
        if let Some(jhost) = jump_host {
            let jport = jump_port.unwrap_or(22);
            let juser = jump_username.unwrap_or(username);
            let jpass = jump_password.unwrap_or(password);

            let proxy_cmd = format!(
                "sshpass -p '{}' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -W %h:%p -p {} {}@{}",
                jpass, jport, juser, jhost
            );
            cmd.arg("-o");
            cmd.arg(format!("ProxyCommand={}", proxy_cmd));
        }

        cmd.arg(format!("{}@{}", username, host));

        // Set environment
        cmd.env("TERM", "xterm-256color");
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");

        log::info!("Starting SSH process with PTY");

        // Spawn the command in the PTY slave
        let _child = pair.slave.spawn_command(cmd)
            .map_err(|e| {
                log::error!("Failed to spawn SSH process: {}", e);
                if e.to_string().contains("No such file") {
                    SshError::ConnectionFailed("sshpass not found. Please install it with: brew install hudochenkov/sshpass/sshpass".to_string())
                } else {
                    SshError::ConnectionFailed(format!("Failed to start SSH: {}", e))
                }
            })?;

        // Drop the slave - we only use the master
        drop(pair.slave);

        log::info!("SSH process started with PTY");

        // Get the master PTY for reading/writing
        let mut reader = pair.master.try_clone_reader()
            .map_err(|e| SshError::PtyError(format!("Failed to clone reader: {}", e)))?;
        let writer = pair.master.take_writer()
            .map_err(|e| SshError::PtyError(format!("Failed to take writer: {}", e)))?;

        let channel_id = Uuid::new_v4().to_string();
        let is_connected = Arc::new(Mutex::new(true));
        let writer = Arc::new(Mutex::new(writer));

        // Spawn a reader thread that emits events to frontend
        let connected_clone = is_connected.clone();
        let channel_id_clone = channel_id.clone();
        let app_handle_clone = app_handle.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            log::info!("Reader thread started for channel {}", channel_id_clone);

            loop {
                // Check if still connected
                if !*connected_clone.lock().unwrap() {
                    log::info!("Reader thread: channel {} marked as disconnected", channel_id_clone);
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - process ended
                        log::info!("PTY reader EOF for channel {}", channel_id_clone);
                        *connected_clone.lock().unwrap() = false;

                        // Emit disconnection event
                        let _ = app_handle_clone.emit("pty_closed", &channel_id_clone);
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[0..n]).to_string();

                        // Emit data to frontend via Tauri event
                        let payload = serde_json::json!({
                            "channelId": channel_id_clone,
                            "data": data
                        });

                        if let Err(e) = app_handle_clone.emit("pty_output", &payload) {
                            log::warn!("Failed to emit pty_output: {}", e);
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // No data available, continue
                        thread::sleep(std::time::Duration::from_millis(10));
                        continue;
                    }
                    Err(e) => {
                        log::warn!("PTY read error: {}", e);
                        *connected_clone.lock().unwrap() = false;
                        let _ = app_handle_clone.emit("pty_closed", &channel_id_clone);
                        break;
                    }
                }
            }
            log::info!("Reader thread ended for channel {}", channel_id_clone);
        });

        let ssh_channel = SshChannel {
            id: channel_id.clone(),
            master: pair.master,
            writer,
            is_connected,
        };

        self.channels.lock().unwrap().insert(channel_id.clone(), ssh_channel);

        Ok(channel_id)
    }

    pub fn send_command(&self, channel_id: &str, data: &str) -> Result<(), SshError> {
        log::debug!("send_command called: channel={}, data={:?}", channel_id, data);

        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let mut writer = ssh.writer.lock().unwrap();
        writer.write_all(data.as_bytes())?;
        writer.flush()?;

        log::debug!("send_command success: {} bytes sent", data.len());
        Ok(())
    }

    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        ssh.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| SshError::PtyError(format!("Resize failed: {}", e)))?;

        log::debug!("Resized PTY {} to {}x{}", channel_id, cols, rows);
        Ok(())
    }

    pub fn disconnect(&self, channel_id: &str) -> Result<(), SshError> {
        let mut channels = self.channels.lock().unwrap();
        if let Some(ssh) = channels.remove(channel_id) {
            // Mark as disconnected to stop reader thread
            *ssh.is_connected.lock().unwrap() = false;
            // Send exit command
            let mut writer = ssh.writer.lock().unwrap();
            let _ = writer.write_all(b"exit\n");
            let _ = writer.flush();
            log::info!("SSH session {} disconnected", channel_id);
        }
        Ok(())
    }
}
