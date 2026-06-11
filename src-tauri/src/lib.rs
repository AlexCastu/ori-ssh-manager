//! ORI-SSHManager - Tauri Application Entry Point

use serde::{Deserialize, Serialize};
use std::sync::Arc;

mod db;
mod ssh;

use db::{Database, SavedCommand, Session, SessionGroup};
use ssh::SshManager;

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
async fn get_groups(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<SessionGroup>, String> {
    state.db.get_groups().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_group(
    state: tauri::State<'_, Arc<AppState>>,
    group: SessionGroup,
) -> Result<(), String> {
    state.db.save_group(&group).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_group(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.db.delete_group(&id).map_err(|e| e.to_string())
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

/// The frontend only sends the session id: credentials are loaded and
/// decrypted inside the backend and never cross the IPC boundary.
/// `progress_id` is an opaque frontend id (tab id) echoed back on the
/// `ssh_progress` event during multi-hop connections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectParams {
    pub session_id: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    #[serde(default)]
    pub progress_id: Option<String>,
}

#[tauri::command]
async fn ssh_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    params: ConnectParams,
) -> Result<String, String> {
    // Blocking I/O (DB + TCP + handshake) runs on a dedicated thread, not the async runtime
    let state = state.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let session = state
            .db
            .get_session_secrets(&params.session_id)
            .map_err(|e| ssh::SshError::SessionNotFound(format!("{}: {}", params.session_id, e)))?;

        log::info!(
            "SSH Connect attempt: {}@{}:{} ({} hops, {}x{})",
            session.username,
            session.host,
            session.port,
            session.jump_hops.len(),
            params.cols.unwrap_or(80),
            params.rows.unwrap_or(24)
        );

        state.ssh.connect(
            &app,
            &session,
            params.progress_id.as_deref(),
            params.cols,
            params.rows,
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
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
    // Never log the data itself: it includes everything typed in the terminal
    log::trace!("ssh_send: channel={}, {} bytes", channel_id, data.len());
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.ssh.send_command(&channel_id, &data))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_resize(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    // Resize temporarily switches the session to blocking mode (up to the SSH
    // timeout), so it must not run on the async runtime
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.ssh.resize(&channel_id, cols, rows))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_disconnect(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
) -> Result<(), String> {
    // wait_close() can block until the server acknowledges: keep it off the runtime
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.ssh.disconnect(&channel_id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Remove a stored host key after a HostKeyMismatch (e.g. the server was
/// legitimately reinstalled). Returns true if an entry was removed.
#[tauri::command]
async fn forget_host_key(host: String, port: u16) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || ssh::forget_host_key(&host, port))
        .await
        .map_err(|e| e.to_string())?
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
        .manage(state)
        // Persist and restore window size/position across launches
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
            get_groups,
            save_group,
            delete_group,
            get_commands,
            save_command,
            delete_command,
            // SSH commands
            ssh_connect,
            ssh_send,
            ssh_resize,
            ssh_disconnect,
            forget_host_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
