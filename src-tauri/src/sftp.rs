//! SFTP module for file browsing and transfer operations

use serde::Serialize;
use ssh2::Sftp;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use crate::ssh::{SshError, SshManager};

/// Represents a file or directory entry
#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub permissions: String,
    pub modified: Option<i64>,
}

/// Result of listing a directory
#[derive(Debug, Serialize)]
pub struct ListDirResult {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FileEntry>,
}

/// Convert Unix permission bits to string like "rwxr-xr-x"
fn format_permissions(perm: u32) -> String {
    let mut s = String::with_capacity(9);

    // Owner permissions
    s.push(if perm & 0o400 != 0 { 'r' } else { '-' });
    s.push(if perm & 0o200 != 0 { 'w' } else { '-' });
    s.push(if perm & 0o100 != 0 { 'x' } else { '-' });

    // Group permissions
    s.push(if perm & 0o040 != 0 { 'r' } else { '-' });
    s.push(if perm & 0o020 != 0 { 'w' } else { '-' });
    s.push(if perm & 0o010 != 0 { 'x' } else { '-' });

    // Other permissions
    s.push(if perm & 0o004 != 0 { 'r' } else { '-' });
    s.push(if perm & 0o002 != 0 { 'w' } else { '-' });
    s.push(if perm & 0o001 != 0 { 'x' } else { '-' });

    s
}

/// Get parent path from a given path
fn get_parent_path(path: &str) -> Option<String> {
    let path = path.trim_end_matches('/');
    if path.is_empty() || path == "/" {
        return None;
    }

    match path.rfind('/') {
        Some(0) => Some("/".to_string()),
        Some(idx) => Some(path[..idx].to_string()),
        None => Some("/".to_string()),
    }
}

impl SshManager {
    /// List contents of a directory via SFTP
    pub fn sftp_list_dir(&self, channel_id: &str, path: &str) -> Result<ListDirResult, SshError> {
        let sftp = self.get_sftp(channel_id)?;

        // Resolve ~ to home directory
        let resolved_path = if path == "~" || path.is_empty() {
            // Try to get home directory from environment or default
            match sftp.realpath(Path::new(".")) {
                Ok(p) => p.to_string_lossy().to_string(),
                Err(_) => "/".to_string(),
            }
        } else if path.starts_with("~/") {
            match sftp.realpath(Path::new(".")) {
                Ok(home) => {
                    let home_str = home.to_string_lossy();
                    format!("{}/{}", home_str.trim_end_matches('/'), &path[2..])
                }
                Err(_) => path.to_string(),
            }
        } else {
            path.to_string()
        };

        // Get canonical path
        let canonical_path = sftp.realpath(Path::new(&resolved_path))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| resolved_path.clone());

        // Read directory contents
        let dir_entries = sftp.readdir(Path::new(&canonical_path))
            .map_err(|e| SshError::ChannelError(format!("Failed to read directory: {}", e)))?;

        let mut entries: Vec<FileEntry> = dir_entries
            .into_iter()
            .filter_map(|(path_buf, stat)| {
                let name = path_buf.file_name()?.to_string_lossy().to_string();

                // Skip hidden files starting with . (optional - can be toggled)
                // For now, include all files

                let full_path = format!("{}/{}", canonical_path.trim_end_matches('/'), name);
                let is_dir = stat.is_dir();
                let is_symlink = stat.file_type().is_symlink();
                let size = stat.size.unwrap_or(0);
                let permissions = stat.perm
                    .map(|p| format_permissions(p))
                    .unwrap_or_else(|| "---------".to_string());
                let modified = stat.mtime.map(|t| t as i64);

                Some(FileEntry {
                    name,
                    path: full_path,
                    is_dir,
                    is_symlink,
                    size,
                    permissions,
                    modified,
                })
            })
            .collect();

        // Sort: directories first, then alphabetically
        entries.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(ListDirResult {
            current_path: canonical_path.clone(),
            parent_path: get_parent_path(&canonical_path),
            entries,
        })
    }

    /// Download a file from remote server
    pub fn sftp_download(&self, channel_id: &str, remote_path: &str, local_path: &str) -> Result<u64, SshError> {
        let sftp = self.get_sftp(channel_id)?;

        // Open remote file
        let mut remote_file = sftp.open(Path::new(remote_path))
            .map_err(|e| SshError::ChannelError(format!("Failed to open remote file: {}", e)))?;

        // Create local file
        let mut local_file = File::create(local_path)
            .map_err(|e| SshError::IoError(e))?;

        // Copy contents
        let mut buffer = vec![0u8; 32768]; // 32KB buffer
        let mut total_bytes = 0u64;

        loop {
            let bytes_read = remote_file.read(&mut buffer)
                .map_err(|e| SshError::IoError(e))?;

            if bytes_read == 0 {
                break;
            }

            local_file.write_all(&buffer[..bytes_read])
                .map_err(|e| SshError::IoError(e))?;

            total_bytes += bytes_read as u64;
        }

        Ok(total_bytes)
    }

    /// Upload a file to remote server
    pub fn sftp_upload(&self, channel_id: &str, local_path: &str, remote_path: &str) -> Result<u64, SshError> {
        let sftp = self.get_sftp(channel_id)?;

        // Open local file
        let mut local_file = File::open(local_path)
            .map_err(|e| SshError::IoError(e))?;

        // Create remote file
        let mut remote_file = sftp.create(Path::new(remote_path))
            .map_err(|e| SshError::ChannelError(format!("Failed to create remote file: {}", e)))?;

        // Copy contents
        let mut buffer = vec![0u8; 32768]; // 32KB buffer
        let mut total_bytes = 0u64;

        loop {
            let bytes_read = local_file.read(&mut buffer)
                .map_err(|e| SshError::IoError(e))?;

            if bytes_read == 0 {
                break;
            }

            remote_file.write_all(&buffer[..bytes_read])
                .map_err(|e| SshError::IoError(e))?;

            total_bytes += bytes_read as u64;
        }

        Ok(total_bytes)
    }

    /// Create a directory on remote server
    pub fn sftp_mkdir(&self, channel_id: &str, path: &str) -> Result<(), SshError> {
        let sftp = self.get_sftp(channel_id)?;

        sftp.mkdir(Path::new(path), 0o755)
            .map_err(|e| SshError::ChannelError(format!("Failed to create directory: {}", e)))
    }

    /// Delete a file or empty directory on remote server
    pub fn sftp_delete(&self, channel_id: &str, path: &str, is_dir: bool) -> Result<(), SshError> {
        let sftp = self.get_sftp(channel_id)?;

        if is_dir {
            sftp.rmdir(Path::new(path))
                .map_err(|e| SshError::ChannelError(format!("Failed to delete directory: {}", e)))
        } else {
            sftp.unlink(Path::new(path))
                .map_err(|e| SshError::ChannelError(format!("Failed to delete file: {}", e)))
        }
    }

    /// Rename a file or directory on remote server
    pub fn sftp_rename(&self, channel_id: &str, old_path: &str, new_path: &str) -> Result<(), SshError> {
        let sftp = self.get_sftp(channel_id)?;

        sftp.rename(Path::new(old_path), Path::new(new_path), None)
            .map_err(|e| SshError::ChannelError(format!("Failed to rename: {}", e)))
    }

    /// Get file/directory info
    pub fn sftp_stat(&self, channel_id: &str, path: &str) -> Result<FileEntry, SshError> {
        let sftp = self.get_sftp(channel_id)?;

        let stat = sftp.stat(Path::new(path))
            .map_err(|e| SshError::ChannelError(format!("Failed to stat: {}", e)))?;

        let name = Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        Ok(FileEntry {
            name,
            path: path.to_string(),
            is_dir: stat.is_dir(),
            is_symlink: stat.file_type().is_symlink(),
            size: stat.size.unwrap_or(0),
            permissions: stat.perm
                .map(|p| format_permissions(p))
                .unwrap_or_else(|| "---------".to_string()),
            modified: stat.mtime.map(|t| t as i64),
        })
    }

    /// Get SFTP subsystem from an existing channel
    pub fn get_sftp(&self, channel_id: &str) -> Result<Sftp, SshError> {
        let channels = self.channels.lock().unwrap();
        let ssh_channel = channels.get(channel_id)
            .ok_or_else(|| SshError::SessionNotFound(channel_id.to_string()))?;

        let inner = ssh_channel.inner.lock().unwrap();
        inner.session.sftp()
            .map_err(|e| SshError::ChannelError(format!("SFTP init failed: {}", e)))
    }
}
