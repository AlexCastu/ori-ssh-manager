//! SSH Manager - Tauri Application Entry Point

use serde::{Deserialize, Serialize};
use std::sync::Arc;

mod db;
mod ssh;

use db::{Database, Session, SavedCommand};
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
async fn delete_session(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    state.db.delete_session(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_commands(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: Option<String>,
) -> Result<Vec<SavedCommand>, String> {
    state.db.get_commands(session_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_command(
    state: tauri::State<'_, Arc<AppState>>,
    command: SavedCommand,
) -> Result<(), String> {
    state.db.save_command(&command).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_command(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    state.db.delete_command(&id).map_err(|e| e.to_string())
}

// ==================== TAURI COMMANDS: SSH ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub jump_host: Option<String>,
    pub jump_port: Option<u16>,
    pub jump_username: Option<String>,
    pub jump_password: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[tauri::command]
async fn ssh_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    params: ConnectParams,
) -> Result<String, String> {
    log::info!("SSH Connect attempt: {}@{}:{} ({}x{})",
        params.username, params.host, params.port,
        params.cols.unwrap_or(80), params.rows.unwrap_or(24));

    match state.ssh.connect(
        &app,
        &params.host,
        params.port,
        &params.username,
        &params.password,
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
    state.ssh.send_command(&channel_id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_resize(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.ssh.resize(&channel_id, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_disconnect(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
) -> Result<(), String> {
    state.ssh.disconnect(&channel_id).map_err(|e| e.to_string())
}

// Logging commands removed (no external log control)

// ==================== APP ENTRY POINT ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    let db = Database::new().expect("Failed to initialize database");
    let ssh = SshManager::new();

    let state = Arc::new(AppState { db, ssh });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
