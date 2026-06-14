//! ORI-SSHManager - Tauri Application Entry Point

use serde::{Deserialize, Serialize};
use std::sync::Arc;

mod db;
mod ssh;

use db::{Database, SavedCommand, Session, SessionGroup, SessionLog};
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

/// Export every session (WITH decrypted secrets, by explicit user choice) as a
/// JSON file at `path`. The credentials are written by the backend directly and
/// never travel over IPC. Returns the number of sessions written.
#[tauri::command]
async fn export_sessions_to_path(
    state: tauri::State<'_, Arc<AppState>>,
    path: String,
) -> Result<usize, String> {
    let (json, count) = state.db.export_sessions_json().map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
    Ok(count)
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

// ==================== TAURI COMMANDS: SESSION LOGS (AUDIT) ====================

#[tauri::command]
async fn add_session_log(
    state: tauri::State<'_, Arc<AppState>>,
    log: SessionLog,
) -> Result<(), String> {
    state.db.add_session_log(&log).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_session_logs(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    limit: Option<i64>,
) -> Result<Vec<SessionLog>, String> {
    state
        .db
        .get_session_logs(&session_id, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_session_logs(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    state
        .db
        .clear_session_logs(&session_id)
        .map_err(|e| e.to_string())
}

/// Export a session's audit log as a JSON file at `path` (written by the
/// backend, never crosses IPC). Returns the number of entries written.
#[tauri::command]
async fn export_session_logs_to_path(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    path: String,
) -> Result<usize, String> {
    let (json, count) = state
        .db
        .export_session_logs_json(&session_id)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
    Ok(count)
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
    // Only the DB read is blocking (rusqlite); the SSH stack is async (russh)
    let db_state = state.inner().clone();
    let session_id = params.session_id.clone();
    let session = tauri::async_runtime::spawn_blocking(move || {
        db_state
            .db
            .get_session_secrets(&session_id)
            .map_err(|e| ssh::SshError::SessionNotFound(format!("{}: {}", session_id, e)))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    log::info!(
        "SSH Connect attempt: {}@{}:{} ({} hops, {}x{})",
        session.username,
        session.host,
        session.port,
        session.jump_hops.len(),
        params.cols.unwrap_or(80),
        params.rows.unwrap_or(24)
    );

    match state
        .ssh
        .connect(
            &app,
            &session,
            params.progress_id.as_deref(),
            params.cols,
            params.rows,
        )
        .await
    {
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
    state
        .ssh
        .send_command(&channel_id, &data)
        .await
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
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ssh_disconnect(
    state: tauri::State<'_, Arc<AppState>>,
    channel_id: String,
) -> Result<(), String> {
    state
        .ssh
        .disconnect(&channel_id)
        .await
        .map_err(|e| e.to_string())
}

/// Release resources of channels whose reader task already detected
/// EOF/error. The frontend calls this on every `pty_closed` event so dead
/// sessions don't linger until the next connect.
#[tauri::command]
async fn ssh_cleanup_dead(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    state.ssh.cleanup_dead_channels();
    Ok(())
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
        // Native save dialog for exporting sessions
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
            export_sessions_to_path,
            get_groups,
            save_group,
            delete_group,
            get_commands,
            save_command,
            delete_command,
            // Session audit logs
            add_session_log,
            get_session_logs,
            clear_session_logs,
            export_session_logs_to_path,
            // SSH commands
            ssh_connect,
            ssh_send,
            ssh_resize,
            ssh_disconnect,
            ssh_cleanup_dead,
            forget_host_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
