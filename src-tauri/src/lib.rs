//! ORI-SSHManager - Tauri Application Entry Point

use serde::{Deserialize, Serialize};
use std::sync::Arc;

mod db;
mod sftp;
mod ssh;

use db::{Database, SavedCommand, Session};
use sftp::{FileEntry, ListDirResult};
use ssh::SshManager;
use tauri_plugin_log;

// ==================== GLOBAL STATE ====================

struct AppState {
    db: Database,
    ssh: SshManager,
}

// ==================== TAURI COMMANDS: DATABASE ====================

#[tauri::command]
async fn get_sessions(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<Session>, String> {
    state.db.get_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_session(
    state: tauri::State<'_, Arc<AppState>>,
    session: Session,
) -> Result<(), String> {
    state.db.save_session(&session).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_session(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.db.delete_session(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_commands(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: Option<String>,
) -> Result<Vec<SavedCommand>, String> {
    state
        .db
        .get_commands(session_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_command(
    state: tauri::State<'_, Arc<AppState>>,
    command: SavedCommand,
) -> Result<(), String> {
    state.db.save_command(&command).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_command(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.db.delete_command(&id).map_err(|e| e.to_string())
}

// ==================== TAURI COMMANDS: SSH ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String, // "password" or "key"
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub jump_host: Option<String>,
    pub jump_port: Option<u16>,
    pub jump_username: Option<String>,
    pub jump_password: Option<String>,
    pub cols: Option<u32>,
    pub rows: Option<u32>,
}

#[tauri::command]
async fn ssh_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    params: ConnectParams,
) -> Result<String, String> {
    log::info!(
        "SSH Connect attempt: {}@{}:{} ({}x{})",
        params.username,
        params.host,
        params.port,
        params.cols.unwrap_or(80),
        params.rows.unwrap_or(24)
    );

    match state.ssh.connect(
        &app,
        &params.host,
        params.port,
        &params.username,
        &params.auth_method,
        params.password.as_deref(),
        params.private_key_path.as_deref(),
        params.private_key_passphrase.as_deref(),
        params.jump_host.as_deref(),
        params.jump_port,
        params.jump_username.as_deref(),
        params.jump_password.as_deref(),
        params.cols,
        params.rows,
    ) {
        Ok(channel_id) => {
            log::info!("SSH Connected successfully: {}", channel_id);
            Ok(channel_id)
        }
        Err(e) => {
            log::error!("SSH Connection failed: {:?}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn ssh_send(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    data: String,
) -> Result<(), String> {
    log::debug!("ssh_send: channel={}, data={:?}", channel_id, data);
    state
        .ssh
        .send_command(&channel_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_resize(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .ssh
        .resize(&channel_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_disconnect(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
) -> Result<(), String> {
    state.ssh.disconnect(&channel_id).map_err(|e| e.to_string())
}

// Logging commands removed (no external log control)

// ==================== TAURI COMMANDS: SFTP ====================

#[tauri::command]
async fn sftp_list_dir(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    path: String,
) -> Result<ListDirResult, String> {
    state
        .ssh
        .sftp_list_dir(&channel_id, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_download(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    remote_path: String,
    local_path: String,
) -> Result<u64, String> {
    state
        .ssh
        .sftp_download(&channel_id, &remote_path, &local_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_upload(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    local_path: String,
    remote_path: String,
) -> Result<u64, String> {
    state
        .ssh
        .sftp_upload(&channel_id, &local_path, &remote_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_mkdir(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_mkdir(&channel_id, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_delete(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    state
        .ssh
        .sftp_delete(&channel_id, &path, is_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_rename(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_rename(&channel_id, &old_path, &new_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_touch(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    path: String,
) -> Result<(), String> {
    state
        .ssh
        .sftp_touch(&channel_id, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_stat(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    path: String,
) -> Result<FileEntry, String> {
    state
        .ssh
        .sftp_stat(&channel_id, &path)
        .map_err(|e| e.to_string())
}

// ==================== APP ENTRY POINT ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    let db = Database::new().expect("Failed to initialize database");
    let ssh = SshManager::new();

    let state = Arc::new(AppState { db, ssh });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database commands
            get_sessions,
            save_session,
            delete_session,
            get_commands,
            save_command,
            delete_command,
            // SSH commands
            ssh_connect,
            ssh_send,
            ssh_resize,
            ssh_disconnect,
            // SFTP commands
            sftp_list_dir,
            sftp_download,
            sftp_upload,
            sftp_mkdir,
            sftp_delete,
            sftp_rename,
            sftp_touch,
            sftp_stat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
