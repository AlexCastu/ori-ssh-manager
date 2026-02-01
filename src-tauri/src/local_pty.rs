//! Local PTY module for ORI-SSHManager

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const MAX_LOCAL_BUFFER: usize = 200 * 1024;

pub struct LocalPtySession {
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
    pub buffer: Arc<Mutex<String>>,
}

pub struct LocalPtyManager {
    sessions: Arc<Mutex<HashMap<String, LocalPtySession>>>,
}

impl LocalPtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(&self, app: &AppHandle, cols: u16, rows: u16) -> Result<String, String> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let shell = if cfg!(windows) {
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        };

        let shell_lower = shell.to_lowercase();
        let mut cmd = CommandBuilder::new(shell);
        if cfg!(windows) {
            if shell_lower.contains("powershell") {
                cmd.arg("-NoLogo");
            }
        } else {
            if shell_lower.contains("zsh") {
                cmd.arg("-l");
            } else if shell_lower.contains("bash") {
                cmd.arg("-l");
            } else if shell_lower.contains("fish") {
                cmd.arg("-l");
            }
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| e.to_string())?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let master = pair.master;

        let channel_id = Uuid::new_v4().to_string();

        let buffer = Arc::new(Mutex::new(String::new()));

        let session = LocalPtySession {
            master,
            writer,
            child,
            buffer: buffer.clone(),
        };

        self.sessions
            .lock()
            .unwrap()
            .insert(channel_id.clone(), session);

        let app_handle = app.clone();
        let sessions = self.sessions.clone();
        let channel_id_for_thread = channel_id.clone();
        let buffer_for_thread = buffer.clone();

        thread::spawn(move || {
            let mut buf = vec![0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buf[0..n]).to_string();
                        {
                            let mut buffer_guard = buffer_for_thread.lock().unwrap();
                            buffer_guard.push_str(&output);
                            if buffer_guard.len() > MAX_LOCAL_BUFFER {
                                let keep_from = buffer_guard.len() - (MAX_LOCAL_BUFFER / 2);
                                buffer_guard.drain(..keep_from);
                            }
                        }
                        let _ = app_handle.emit(&format!("local-output-{}", channel_id_for_thread), output);
                    }
                    Err(_) => break,
                }
            }

            let _ = app_handle.emit("pty_closed", channel_id_for_thread.clone());
            let mut sessions_guard = sessions.lock().unwrap();
            if let Some(mut session) = sessions_guard.remove(&channel_id_for_thread) {
                let _ = session.child.kill();
            }
        });

        Ok(channel_id)
    }

    pub fn write(&self, channel_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(channel_id)
            .ok_or_else(|| "Local PTY not found".to_string())?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn resize(&self, channel_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(channel_id)
            .ok_or_else(|| "Local PTY not found".to_string())?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn read_buffer(&self, channel_id: &str) -> Result<String, String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(channel_id)
            .ok_or_else(|| "Local PTY not found".to_string())?;
        let mut buffer_guard = session.buffer.lock().unwrap();
        if buffer_guard.is_empty() {
            return Ok(String::new());
        }
        let output = buffer_guard.clone();
        buffer_guard.clear();
        Ok(output)
    }

    pub fn kill(&self, channel_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(channel_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }
}
