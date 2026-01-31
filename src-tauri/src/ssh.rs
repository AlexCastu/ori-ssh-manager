//! SSH Connection module for SSH Manager

use ssh2::{Channel, Session as SshSession};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
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
    session: SshSession,
    channel: Channel,
    _stream: TcpStream,
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
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        jump_host: Option<&str>,
        jump_port: Option<u16>,
        jump_username: Option<&str>,
        jump_password: Option<&str>,
    ) -> Result<String, SshError> {
        let stream = if let Some(jhost) = jump_host {
            self.connect_via_jump(
                jhost,
                jump_port.unwrap_or(22),
                jump_username.unwrap_or(username),
                jump_password.unwrap_or(password),
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
        session
            .userauth_password(username, password)
            .map_err(|e| SshError::AuthFailed(e.to_string()))?;

        let mut channel = session.channel_session()?;
        channel.request_pty("vt100", None, Some((80, 24, 0, 0)))?;
        channel.shell()?;
        session.set_blocking(false);

        let channel_id = Uuid::new_v4().to_string();
        let ssh_channel = SshChannel {
            id: channel_id.clone(),
            session,
            channel,
            _stream: stream,
        };

        self.channels
            .lock()
            .unwrap()
            .insert(channel_id.clone(), ssh_channel);
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
}
