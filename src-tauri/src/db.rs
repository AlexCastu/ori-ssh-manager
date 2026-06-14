//! Database module for ORI-SSHManager

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand_core::RngCore;
use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use zeroize::Zeroize;

// Field-level encryption to avoid storing cleartext credentials on disk.
// Key is generated once per device and stored alongside the database.
const KEY_FILENAME: &str = "key.bin";
const NONCE_SIZE: usize = 12; // AES-GCM standard nonce length

fn default_hop_port() -> i32 {
    22
}

fn default_auth_method() -> String {
    "password".to_string()
}

fn default_group_icon() -> String {
    "folder".to_string()
}

/// One hop of the jump chain. Secrets are stored encrypted inside the
/// serialized JSON chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHop {
    // Optional human label to identify the jump host in the session map
    #[serde(default)]
    pub name: Option<String>,
    // When set, this hop is a live reference to another saved session (one
    // flagged `usable_as_jump`): its connection fields/secrets are resolved
    // from that session at read time and the inline fields are left blank.
    #[serde(rename = "refSessionId", default)]
    pub ref_session_id: Option<String>,
    pub host: String,
    #[serde(default = "default_hop_port")]
    pub port: i32,
    #[serde(default)]
    pub username: String,
    #[serde(default = "default_auth_method")]
    pub auth_method: String, // "password" | "key" | "agent"
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub private_key_path: Option<String>,
    #[serde(default)]
    pub private_key_passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    #[serde(rename = "authMethod")]
    pub auth_method: String, // "password" | "key" | "agent"
    pub password: Option<String>,
    #[serde(rename = "privateKeyPath")]
    pub private_key_path: Option<String>,
    #[serde(rename = "privateKeyPassphrase")]
    pub private_key_passphrase: Option<String>,
    #[serde(rename = "jumpHops", default)]
    pub jump_hops: Vec<JumpHop>,
    // When true this session can be picked as a jump host by other sessions
    #[serde(rename = "usableAsJump", default)]
    pub usable_as_jump: bool,
    pub color: String,
    // Optional per-session icon name; None means "show the colored dot"
    #[serde(default)]
    pub icon: Option<String>,
    // Optional free-text notes/comments (plain text, not a secret)
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(rename = "groupId")]
    pub group_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionGroup {
    pub id: String,
    pub name: String,
    pub color: String,
    // Icon name (see frontend icon registry); "folder" by default
    #[serde(default = "default_group_icon")]
    pub icon: String,
    pub is_expanded: bool,
    #[serde(rename = "order")]
    pub sort_order: i32,
    // Parent group id for nested folders; None = top level
    #[serde(default)]
    pub parent_id: Option<String>,
    // Optional free-text notes/comments for the folder
    #[serde(default)]
    pub notes: Option<String>,
}

/// Shape written by the "export sessions" feature. Includes decrypted secrets
/// (the user explicitly opted in) and resolves the group id to its name so the
/// importer can recreate/link the folder. Empty/None fields are omitted.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportSession {
    name: String,
    host: String,
    port: i32,
    username: String,
    auth_method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    private_key_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    private_key_passphrase: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    jump_hops: Vec<JumpHop>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    usable_as_jump: bool,
    color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    group_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCommand {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub name: String,
    pub command: String,
    // Optional free-text notes/description for the command
    #[serde(default)]
    pub notes: Option<String>,
}

/// Audit log entry for a session. `kind` is "event" (connect/disconnect/error/
/// host-key) or "command" (a line launched in the terminal). Plain text, never
/// a secret: command capture is gated by a password-prompt guard in the
/// frontend. `ts` is an ISO-8601 timestamp generated by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLog {
    pub id: String,
    pub session_id: String,
    pub ts: String,
    pub kind: String,
    pub message: String,
}

pub struct Database {
    conn: Mutex<Connection>,
    key: [u8; 32],
    // Tras las migraciones de arranque ya no debe existir ningún secreto sin
    // prefijo "v1:": en modo estricto un valor en claro es un error (BD
    // manipulada o corrupta), no un passthrough silencioso
    strict_decrypt: bool,
}

impl Drop for Database {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

// Row tuples used by the startup migrations
type SecretRow = (String, Option<String>, Option<String>, Option<String>);
type LegacyJumpRow = (String, String, Option<i64>, Option<String>, Option<String>);

fn json_err<E: std::error::Error + Send + Sync + 'static>(e: E) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(e))
}

fn corrupt_secret_err() -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "Stored credential is corrupted (decryption failed). Re-enter it in the session editor.",
    )))
}

fn plaintext_secret_err() -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "Stored credential is not encrypted (unexpected plaintext). Re-enter it in the session editor.",
    )))
}

/// Encrypt a secret with AES-256-GCM, output format `v1:<nonce_b64>:<data_b64>`
fn encrypt_value(key: &[u8; 32], plaintext: &str) -> SqliteResult<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| json_err(std::io::Error::other(e.to_string())))?;

    Ok(format!(
        "v1:{}:{}",
        general_purpose::STANDARD_NO_PAD.encode(nonce_bytes),
        general_purpose::STANDARD_NO_PAD.encode(ciphertext)
    ))
}

/// Decrypt a `v1:` value. In lenient mode (during startup migrations) values
/// without the prefix are legacy plaintext and returned as-is; in strict mode
/// (normal operation, after migrations) they are an error. A value that has
/// the prefix but fails to decrypt is a hard error, not a silent None.
fn decrypt_value(
    key: &[u8; 32],
    ciphertext: &Option<String>,
    strict: bool,
) -> SqliteResult<Option<String>> {
    let Some(value) = ciphertext else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(Some(String::new()));
    }

    let Some(stripped) = value.strip_prefix("v1:") else {
        if strict {
            return Err(plaintext_secret_err());
        }
        return Ok(Some(value.clone()));
    };

    let mut parts = stripped.splitn(2, ':');
    let nonce_b64 = parts.next().unwrap_or("");
    let data_b64 = parts.next().unwrap_or("");

    let nonce_bytes = general_purpose::STANDARD_NO_PAD
        .decode(nonce_b64)
        .map_err(|_| corrupt_secret_err())?;
    let data_bytes = general_purpose::STANDARD_NO_PAD
        .decode(data_b64)
        .map_err(|_| corrupt_secret_err())?;
    if nonce_bytes.len() != NONCE_SIZE {
        return Err(corrupt_secret_err());
    }

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut plaintext = cipher
        .decrypt(nonce, data_bytes.as_ref())
        .map_err(|_| corrupt_secret_err())?;

    let result = String::from_utf8_lossy(&plaintext).into_owned();
    plaintext.zeroize();
    Ok(Some(result))
}

/// App data directory (database, known_hosts, legacy key file).
/// Windows: %LOCALAPPDATA%\SSHManager — the SQLite WAL database must NOT live
/// in the roaming profile (%APPDATA%), which corporate domains sync over the
/// network (slow logins, risk of WAL corruption). Existing data is migrated
/// once from the old roaming path. macOS/Linux keep using config_dir.
pub fn data_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        #[cfg(windows)]
        {
            let new_dir = dirs::data_local_dir()
                .map(|p| p.join("SSHManager"))
                .unwrap_or_else(|| PathBuf::from("."));
            if !new_dir.exists() {
                if let Some(old_dir) = dirs::config_dir().map(|p| p.join("SSHManager")) {
                    if old_dir.exists() {
                        if fs::rename(&old_dir, &new_dir).is_err() {
                            // Locked or cross-volume: keep using the old path
                            // (never risk losing the database)
                            return old_dir;
                        }
                        log::info!("Data dir migrated from roaming to local AppData");
                    }
                }
            }
            new_dir
        }
        #[cfg(not(windows))]
        {
            dirs::config_dir()
                .map(|p| p.join("SSHManager"))
                .unwrap_or_else(|| PathBuf::from("."))
        }
    })
}

impl Database {
    pub fn new() -> SqliteResult<Self> {
        let base_dir: PathBuf = data_dir().clone();
        let db_path = base_dir.join("data.db");
        let key_path = base_dir.join(KEY_FILENAME);

        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).ok();
            // Data dir holds the DB, known_hosts and (legacy) key file:
            // restrict it to the current user
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(parent, fs::Permissions::from_mode(0o700)).ok();
            }
        }

        let key = load_or_create_key(&key_path)?;
        let conn = Connection::open(&db_path)?;

        // WAL avoids reader/writer blocking; NORMAL sync is safe with WAL
        let _: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_method TEXT NOT NULL DEFAULT 'password',
                password TEXT,
                private_key_path TEXT,
                private_key_passphrase TEXT,
                jump_chain TEXT,
                color TEXT NOT NULL DEFAULT 'blue',
                group_id TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        let has_column = |conn: &Connection, name: &str| -> bool {
            conn.prepare(&format!(
                "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='{}'",
                name
            ))
            .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, i32>(0)))
            .map(|count| count > 0)
            .unwrap_or(false)
        };

        // Migration: add group_id if missing
        if !has_column(&conn, "group_id") {
            conn.execute("ALTER TABLE sessions ADD COLUMN group_id TEXT", [])?;
        }

        // Migration: add auth_method if missing
        if !has_column(&conn, "auth_method") {
            conn.execute(
                "ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'password'",
                [],
            )?;
            conn.execute("ALTER TABLE sessions ADD COLUMN private_key_path TEXT", [])?;
            conn.execute(
                "ALTER TABLE sessions ADD COLUMN private_key_passphrase TEXT",
                [],
            )?;
        }

        // Migration: add jump_chain (multi-hop tunnel) if missing
        if !has_column(&conn, "jump_chain") {
            conn.execute("ALTER TABLE sessions ADD COLUMN jump_chain TEXT", [])?;
        }

        // Migration: add per-session icon if missing
        if !has_column(&conn, "icon") {
            conn.execute("ALTER TABLE sessions ADD COLUMN icon TEXT", [])?;
        }

        // Migration: add per-session notes if missing
        if !has_column(&conn, "notes") {
            conn.execute("ALTER TABLE sessions ADD COLUMN notes TEXT", [])?;
        }

        // Migration: add "usable as jump host" flag if missing
        if !has_column(&conn, "usable_as_jump") {
            conn.execute(
                "ALTER TABLE sessions ADD COLUMN usable_as_jump INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }

        conn.execute(
            "CREATE TABLE IF NOT EXISTS commands (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                notes TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Migration: add per-command notes if missing
        let commands_has_notes: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('commands') WHERE name='notes'")?
            .query_row([], |row| row.get::<_, i32>(0))
            .map(|count| count > 0)
            .unwrap_or(false);
        if !commands_has_notes {
            conn.execute("ALTER TABLE commands ADD COLUMN notes TEXT", [])?;
        }

        // Per-session audit log (events + launched commands). Plain text.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS session_logs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                kind TEXT NOT NULL,
                message TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_session_logs_session
             ON session_logs(session_id, ts)",
            [],
        )?;

        // Groups live in SQLite next to the sessions that reference them
        // (they used to live only in localStorage, which could desync)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'blue',
                icon TEXT NOT NULL DEFAULT 'folder',
                is_expanded INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                parent_id TEXT,
                notes TEXT
            )",
            [],
        )?;

        // Migrations for groups created before icon / nesting existed
        let group_has_column = |conn: &Connection, name: &str| -> bool {
            conn.prepare(&format!(
                "SELECT COUNT(*) FROM pragma_table_info('groups') WHERE name='{}'",
                name
            ))
            .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, i32>(0)))
            .map(|count| count > 0)
            .unwrap_or(false)
        };
        if !group_has_column(&conn, "icon") {
            conn.execute(
                "ALTER TABLE groups ADD COLUMN icon TEXT NOT NULL DEFAULT 'folder'",
                [],
            )?;
        }
        if !group_has_column(&conn, "parent_id") {
            conn.execute("ALTER TABLE groups ADD COLUMN parent_id TEXT", [])?;
        }
        if !group_has_column(&conn, "notes") {
            conn.execute("ALTER TABLE groups ADD COLUMN notes TEXT", [])?;
        }

        let mut db = Database {
            conn: Mutex::new(conn),
            key,
            // Lenient while migrations may still find legacy plaintext
            strict_decrypt: false,
        };
        db.reencrypt_legacy_secrets()?;
        db.migrate_legacy_jump_columns()?;
        // From here on every stored secret carries the "v1:" prefix
        db.strict_decrypt = true;
        Ok(db)
    }

    /// One-time migration: secrets stored before field encryption existed
    /// (values without the "v1:" prefix) are re-encrypted in place so no
    /// plaintext credential remains on disk
    fn reencrypt_legacy_secrets(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        let has_jump_password: bool = conn
            .prepare(
                "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='jump_password'",
            )?
            .query_row([], |row| row.get::<_, i32>(0))
            .map(|count| count > 0)
            .unwrap_or(false);

        let select = if has_jump_password {
            "SELECT id, password, private_key_passphrase, jump_password FROM sessions"
        } else {
            "SELECT id, password, private_key_passphrase, NULL FROM sessions"
        };

        let rows: Vec<SecretRow> = {
            let mut stmt = conn.prepare(select)?;
            let mapped = stmt.query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?;
            mapped.collect::<SqliteResult<_>>()?
        };

        let is_plaintext = |v: &Option<String>| {
            v.as_deref()
                .map(|s| !s.is_empty() && !s.starts_with("v1:"))
                .unwrap_or(false)
        };

        for (id, password, passphrase, jump_password) in rows {
            if !is_plaintext(&password)
                && !is_plaintext(&passphrase)
                && !is_plaintext(&jump_password)
            {
                continue;
            }

            let encrypt_if_plaintext = |v: Option<String>| -> SqliteResult<Option<String>> {
                match v {
                    Some(s) if !s.is_empty() && !s.starts_with("v1:") => {
                        Ok(Some(self.encrypt(&s)?))
                    }
                    other => Ok(other),
                }
            };

            conn.execute(
                "UPDATE sessions SET password = ?2, private_key_passphrase = ?3 WHERE id = ?1",
                params![
                    id,
                    encrypt_if_plaintext(password.clone())?,
                    encrypt_if_plaintext(passphrase)?
                ],
            )?;
            if has_jump_password && is_plaintext(&jump_password) {
                conn.execute(
                    "UPDATE sessions SET jump_password = ?2 WHERE id = ?1",
                    params![id, encrypt_if_plaintext(jump_password)?],
                )?;
            }
            log::info!("Re-encrypted legacy plaintext secrets for session {}", id);
        }
        Ok(())
    }

    /// One-time migration: the old single jump host columns (jump_host,
    /// jump_port, jump_username, jump_password) become the first hop of the
    /// new jump_chain JSON. Legacy columns are cleared afterwards.
    fn migrate_legacy_jump_columns(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        let has_jump_host: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='jump_host'")?
            .query_row([], |row| row.get::<_, i32>(0))
            .map(|count| count > 0)
            .unwrap_or(false);
        if !has_jump_host {
            return Ok(());
        }

        let rows: Vec<LegacyJumpRow> = {
            let mut stmt = conn.prepare(
                "SELECT id, jump_host, jump_port, jump_username, jump_password FROM sessions
                 WHERE jump_host IS NOT NULL AND TRIM(jump_host) != ''
                   AND (jump_chain IS NULL OR jump_chain = '')",
            )?;
            let mapped = stmt.query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?;
            mapped.collect::<SqliteResult<_>>()?
        };

        for (id, host, port, username, password) in rows {
            let hop = JumpHop {
                name: None,
                ref_session_id: None,
                host,
                port: port.unwrap_or(22) as i32,
                username: username.unwrap_or_default(),
                auth_method: "password".to_string(),
                // already encrypted (v1:) by reencrypt_legacy_secrets
                password,
                private_key_path: None,
                private_key_passphrase: None,
            };
            let chain = serde_json::to_string(&[hop]).map_err(json_err)?;
            conn.execute(
                "UPDATE sessions SET jump_chain = ?2, jump_host = NULL, jump_port = NULL,
                 jump_username = NULL, jump_password = NULL WHERE id = ?1",
                params![id, chain],
            )?;
            log::info!("Migrated legacy jump host of session {} to jump_chain", id);
        }
        Ok(())
    }

    fn encrypt(&self, plaintext: &str) -> SqliteResult<String> {
        encrypt_value(&self.key, plaintext)
    }

    fn decrypt(&self, ciphertext: &Option<String>) -> SqliteResult<Option<String>> {
        decrypt_value(&self.key, ciphertext, self.strict_decrypt)
    }

    const SESSION_COLUMNS: &'static str =
        "id, name, host, port, username, auth_method, password, private_key_path,
         private_key_passphrase, jump_chain, color, group_id, created_at, icon, notes,
         usable_as_jump";

    fn session_from_row(
        &self,
        row: &rusqlite::Row,
        with_secrets: bool,
    ) -> rusqlite::Result<Session> {
        let enc_password: Option<String> = row.get(6)?;
        let enc_key_passphrase: Option<String> = row.get(8)?;
        let jump_chain: Option<String> = row.get(9)?;

        let mut jump_hops: Vec<JumpHop> = match jump_chain.as_deref() {
            Some(json) if !json.trim().is_empty() => {
                serde_json::from_str(json).map_err(json_err)?
            }
            _ => Vec::new(),
        };

        for hop in &mut jump_hops {
            if with_secrets {
                hop.password = self.decrypt(&hop.password)?;
                hop.private_key_passphrase = self.decrypt(&hop.private_key_passphrase)?;
            } else {
                hop.password = None;
                hop.private_key_passphrase = None;
            }
        }

        let mut session = Session {
            id: row.get(0)?,
            name: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            username: row.get(4)?,
            auth_method: row
                .get::<_, Option<String>>(5)?
                .unwrap_or_else(|| "password".to_string()),
            password: None,
            private_key_path: row.get(7)?,
            private_key_passphrase: None,
            jump_hops,
            usable_as_jump: row.get::<_, i32>(15)? != 0,
            color: row.get(10)?,
            icon: row.get(13)?,
            notes: row.get(14)?,
            group_id: row.get(11)?,
            created_at: row.get(12)?,
        };

        if with_secrets {
            session.password = self.decrypt(&enc_password)?;
            session.private_key_passphrase = self.decrypt(&enc_key_passphrase)?;
        }

        Ok(session)
    }

    /// List sessions WITHOUT decrypted credentials (secrets never leave the backend)
    pub fn get_sessions(&self) -> SqliteResult<Vec<Session>> {
        // Scope the connection lock so the jump-reference resolution below can
        // re-lock it without deadlocking.
        let mut sessions = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM sessions ORDER BY name",
                Self::SESSION_COLUMNS
            ))?;
            let rows = stmt.query_map([], |row| self.session_from_row(row, false))?;
            rows.collect::<SqliteResult<Vec<_>>>()?
        };
        self.apply_jump_refs(&mut sessions, false)?;
        Ok(sessions)
    }

    /// Fetch one session WITH decrypted credentials (backend-internal use only)
    pub fn get_session_secrets(&self, id: &str) -> SqliteResult<Session> {
        let mut session = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM sessions WHERE id = ?1",
                Self::SESSION_COLUMNS
            ))?;
            stmt.query_row(params![id], |row| self.session_from_row(row, true))?
        };
        self.apply_jump_refs(std::slice::from_mut(&mut session), true)?;
        Ok(session)
    }

    pub fn save_session(&self, session: &Session) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        // Frontend no longer holds credentials: an empty/missing secret on an
        // existing session means "keep the stored value"
        let existing: Option<(Option<String>, Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT password, private_key_passphrase, jump_chain FROM sessions WHERE id = ?1",
                params![session.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;

        let existing_hops: Vec<JumpHop> = existing
            .as_ref()
            .and_then(|e| e.2.as_deref())
            .filter(|json| !json.trim().is_empty())
            .map(serde_json::from_str)
            .transpose()
            .map_err(json_err)?
            .unwrap_or_default();

        let enc_password = match &session.password {
            Some(pwd) if !pwd.is_empty() => Some(self.encrypt(pwd)?),
            _ => existing.as_ref().and_then(|e| e.0.clone()),
        };
        let enc_key_passphrase = match &session.private_key_passphrase {
            Some(pwd) if !pwd.is_empty() => Some(self.encrypt(pwd)?),
            _ => existing.as_ref().and_then(|e| e.1.clone()),
        };

        // Per-hop secrets: empty means "keep the stored secret of the hop at
        // the same position" (matches the single-field behavior above)
        let mut enc_hops: Vec<JumpHop> = Vec::with_capacity(session.jump_hops.len());
        for (idx, hop) in session.jump_hops.iter().enumerate() {
            // A session reference stores only the id (+ optional label); its
            // connection fields/secrets live in the referenced session and are
            // resolved on read, so we blank them here to avoid stale copies.
            if let Some(rid) = hop.ref_session_id.as_ref().filter(|b| !b.is_empty()) {
                enc_hops.push(JumpHop {
                    name: hop.name.clone(),
                    ref_session_id: Some(rid.clone()),
                    host: String::new(),
                    port: 0,
                    username: String::new(),
                    auth_method: "password".to_string(),
                    password: None,
                    private_key_path: None,
                    private_key_passphrase: None,
                });
                continue;
            }

            let stored = existing_hops.get(idx);
            let password = match &hop.password {
                Some(pwd) if !pwd.is_empty() => Some(self.encrypt(pwd)?),
                _ => stored.and_then(|h| h.password.clone()),
            };
            let passphrase = match &hop.private_key_passphrase {
                Some(pwd) if !pwd.is_empty() => Some(self.encrypt(pwd)?),
                _ => stored.and_then(|h| h.private_key_passphrase.clone()),
            };
            enc_hops.push(JumpHop {
                name: hop.name.clone(),
                ref_session_id: None,
                host: hop.host.clone(),
                port: hop.port,
                username: hop.username.clone(),
                auth_method: hop.auth_method.clone(),
                password,
                private_key_path: hop.private_key_path.clone(),
                private_key_passphrase: passphrase,
            });
        }
        let jump_chain: Option<String> = if enc_hops.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&enc_hops).map_err(json_err)?)
        };

        conn.execute(
            "INSERT OR REPLACE INTO sessions
             (id, name, host, port, username, auth_method, password, private_key_path,
              private_key_passphrase, jump_chain, color, group_id, created_at, icon, notes,
              usable_as_jump)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                session.id,
                session.name,
                session.host,
                session.port,
                session.username,
                session.auth_method,
                enc_password,
                session.private_key_path,
                enc_key_passphrase,
                jump_chain,
                session.color,
                session.group_id,
                session.created_at,
                session.icon,
                session.notes,
                session.usable_as_jump as i32,
            ],
        )?;
        Ok(())
    }

    /// Build the JSON export of every session WITH decrypted secrets, resolving
    /// the group id to its name. Returns (json, count). Secrets go straight to
    /// the file written by the backend — they never cross IPC to the frontend.
    pub fn export_sessions_json(&self) -> SqliteResult<(String, usize)> {
        // Lock scope: read groups + sessions, then release so jump-reference
        // resolution can re-lock without deadlocking.
        let (group_names, mut sessions): (HashMap<String, String>, Vec<Session>) = {
            let conn = self.conn.lock().unwrap();

            let group_names: HashMap<String, String> = {
                let mut stmt = conn.prepare("SELECT id, name FROM groups")?;
                let rows = stmt.query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?;
                rows.collect::<SqliteResult<_>>()?
            };

            let sessions: Vec<Session> = {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {} FROM sessions ORDER BY name",
                    Self::SESSION_COLUMNS
                ))?;
                let rows = stmt.query_map([], |row| self.session_from_row(row, true))?;
                rows.collect::<SqliteResult<_>>()?
            };

            (group_names, sessions)
        };

        // Inline any session references so the exported file is self-contained.
        self.apply_jump_refs(&mut sessions, true)?;

        let exported: Vec<ExportSession> = sessions
            .into_iter()
            .map(|s| ExportSession {
                name: s.name,
                host: s.host,
                port: s.port,
                username: s.username,
                auth_method: s.auth_method,
                password: s.password,
                private_key_path: s.private_key_path,
                private_key_passphrase: s.private_key_passphrase,
                jump_hops: s
                    .jump_hops
                    .into_iter()
                    .map(|mut h| {
                        h.ref_session_id = None;
                        h
                    })
                    .collect(),
                usable_as_jump: s.usable_as_jump,
                color: s.color,
                icon: s.icon,
                notes: s.notes,
                group_name: s.group_id.and_then(|gid| group_names.get(&gid).cloned()),
            })
            .collect();

        let json = serde_json::to_string_pretty(&exported).map_err(json_err)?;
        Ok((json, exported.len()))
    }

    pub fn delete_session(&self, id: &str) -> SqliteResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM commands WHERE session_id = ?1", params![id])?;
        tx.execute(
            "DELETE FROM session_logs WHERE session_id = ?1",
            params![id],
        )?;
        tx.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        tx.commit()
    }

    // ==================== GROUPS ====================

    pub fn get_groups(&self) -> SqliteResult<Vec<SessionGroup>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, color, icon, is_expanded, sort_order, parent_id, notes
             FROM groups ORDER BY sort_order, name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SessionGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
                is_expanded: row.get::<_, i32>(4)? != 0,
                sort_order: row.get(5)?,
                parent_id: row.get(6)?,
                notes: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn save_group(&self, group: &SessionGroup) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO groups (id, name, color, icon, is_expanded, sort_order, parent_id, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                group.id,
                group.name,
                group.color,
                group.icon,
                group.is_expanded as i32,
                group.sort_order,
                group.parent_id,
                group.notes,
            ],
        )?;
        Ok(())
    }

    /// Delete a group and detach its sessions (group_id = NULL). Nested
    /// subgroups are reparented to the deleted group's parent (so they are
    /// not orphaned): a child of a deleted top-level folder becomes top level.
    pub fn delete_group(&self, id: &str) -> SqliteResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        // Grandparent the children up one level
        let parent: Option<String> = tx
            .query_row(
                "SELECT parent_id FROM groups WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        tx.execute(
            "UPDATE groups SET parent_id = ?2 WHERE parent_id = ?1",
            params![id, parent],
        )?;
        tx.execute(
            "UPDATE sessions SET group_id = NULL WHERE group_id = ?1",
            params![id],
        )?;
        tx.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        tx.commit()
    }

    // ==================== COMMANDS ====================

    pub fn get_commands(&self, session_id: Option<&str>) -> SqliteResult<Vec<SavedCommand>> {
        let conn = self.conn.lock().unwrap();
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<SavedCommand> {
            Ok(SavedCommand {
                id: row.get(0)?,
                session_id: row.get(1)?,
                name: row.get(2)?,
                command: row.get(3)?,
                notes: row.get(4)?,
            })
        };

        if let Some(sid) = session_id {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, name, command, notes FROM commands
                 WHERE session_id = ?1 OR session_id IS NULL ORDER BY name",
            )?;
            let rows = stmt.query_map(params![sid], map_row)?;
            rows.collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, name, command, notes FROM commands ORDER BY name",
            )?;
            let rows = stmt.query_map([], map_row)?;
            rows.collect()
        }
    }

    pub fn save_command(&self, cmd: &SavedCommand) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO commands (id, session_id, name, command, notes)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![cmd.id, cmd.session_id, cmd.name, cmd.command, cmd.notes],
        )?;
        Ok(())
    }

    pub fn delete_command(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM commands WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== SESSION LOGS (AUDIT) ====================

    pub fn add_session_log(&self, log: &SessionLog) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO session_logs (id, session_id, ts, kind, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![log.id, log.session_id, log.ts, log.kind, log.message],
        )?;
        Ok(())
    }

    /// Newest first. `limit` <= 0 (or None) means no cap.
    pub fn get_session_logs(
        &self,
        session_id: &str,
        limit: Option<i64>,
    ) -> SqliteResult<Vec<SessionLog>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, ts, kind, message FROM session_logs
             WHERE session_id = ?1 ORDER BY ts DESC, rowid DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![session_id, limit.unwrap_or(-1)], |row| {
            Ok(SessionLog {
                id: row.get(0)?,
                session_id: row.get(1)?,
                ts: row.get(2)?,
                kind: row.get(3)?,
                message: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn clear_session_logs(&self, session_id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM session_logs WHERE session_id = ?1",
            params![session_id],
        )?;
        Ok(())
    }

    /// Serialize a session's logs (oldest first, for a readable audit file).
    pub fn export_session_logs_json(&self, session_id: &str) -> SqliteResult<(String, usize)> {
        let mut logs = self.get_session_logs(session_id, None)?;
        logs.reverse();
        let count = logs.len();
        let json = serde_json::to_string_pretty(&logs).map_err(json_err)?;
        Ok((json, count))
    }

    // ==================== JUMP-HOST REFERENCES ====================

    /// Direct connection params of every session (its own hops ignored), keyed
    /// by id, used to resolve hops that reference another session as a jump
    /// host. Each entry is shaped as a JumpHop for convenient copying.
    fn session_conn_map(&self, with_secrets: bool) -> SqliteResult<HashMap<String, JumpHop>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, host, port, username, auth_method, password,
                    private_key_path, private_key_passphrase FROM sessions",
        )?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let enc_password: Option<String> = row.get(6)?;
            let enc_passphrase: Option<String> = row.get(8)?;
            let hop = JumpHop {
                name: Some(row.get::<_, String>(1)?),
                ref_session_id: None,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_method: row
                    .get::<_, Option<String>>(5)?
                    .unwrap_or_else(|| "password".to_string()),
                password: if with_secrets {
                    self.decrypt(&enc_password)?
                } else {
                    None
                },
                private_key_path: row.get(7)?,
                private_key_passphrase: if with_secrets {
                    self.decrypt(&enc_passphrase)?
                } else {
                    None
                },
            };
            Ok((id, hop))
        })?;
        let mut map = HashMap::new();
        for r in rows {
            let (id, hop) = r?;
            map.insert(id, hop);
        }
        Ok(map)
    }

    /// Resolve hops that reference another session as a jump host, in place.
    /// Non-secret fields always; secrets only when `with_secrets`. A dangling
    /// reference (deleted session) is left blank so connect fails clearly.
    /// The referenced session's OWN hops are intentionally ignored (we only
    /// borrow its direct connection params).
    fn apply_jump_refs(&self, sessions: &mut [Session], with_secrets: bool) -> SqliteResult<()> {
        let needs = sessions.iter().any(|s| {
            s.jump_hops
                .iter()
                .any(|h| h.ref_session_id.as_deref().is_some_and(|r| !r.is_empty()))
        });
        if !needs {
            return Ok(());
        }

        let map = self.session_conn_map(with_secrets)?;
        for s in sessions.iter_mut() {
            for hop in s.jump_hops.iter_mut() {
                let Some(rid) = hop.ref_session_id.as_deref().filter(|r| !r.is_empty()) else {
                    continue;
                };
                if let Some(src) = map.get(rid) {
                    hop.host = src.host.clone();
                    hop.port = src.port;
                    hop.username = src.username.clone();
                    hop.auth_method = src.auth_method.clone();
                    hop.private_key_path = src.private_key_path.clone();
                    if hop.name.is_none() {
                        hop.name = src.name.clone();
                    }
                    if with_secrets {
                        hop.password = src.password.clone();
                        hop.private_key_passphrase = src.private_key_passphrase.clone();
                    }
                }
            }
        }
        Ok(())
    }

    /// How many OTHER sessions reference this session as a jump host (for a safe
    /// delete warning in the UI).
    pub fn count_session_jump_refs(&self, session_id: &str) -> SqliteResult<usize> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id, jump_chain FROM sessions WHERE jump_chain IS NOT NULL")?;
        let rows: Vec<(String, Option<String>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<SqliteResult<_>>()?;
        let mut count = 0;
        for (id, chain) in rows {
            if id == session_id {
                continue;
            }
            let Some(chain) = chain.filter(|c| !c.trim().is_empty()) else {
                continue;
            };
            let hops: Vec<JumpHop> = serde_json::from_str(&chain).map_err(json_err)?;
            if hops
                .iter()
                .any(|h| h.ref_session_id.as_deref() == Some(session_id))
            {
                count += 1;
            }
        }
        Ok(count)
    }
}

const KEYRING_SERVICE: &str = "ORI-SSHManager";
const KEYRING_USER: &str = "db-encryption-key";

/// Load the database encryption key. Preference order:
/// 1. OS keychain (macOS Keychain / Windows Credential Manager)
/// 2. Legacy key.bin file (migrated to the keychain and deleted)
/// 3. key.bin fallback when no keychain backend is available
fn load_or_create_key(legacy_path: &PathBuf) -> SqliteResult<[u8; 32]> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        // Existing key in the OS keychain (zeroize every intermediate buffer)
        if let Ok(mut stored) = entry.get_password() {
            let decoded = general_purpose::STANDARD.decode(&stored);
            stored.zeroize();
            if let Ok(mut bytes) = decoded {
                if bytes.len() == 32 {
                    let mut key = [0u8; 32];
                    key.copy_from_slice(&bytes);
                    bytes.zeroize();
                    return Ok(key);
                }
                bytes.zeroize();
            }
        }

        // Migrate legacy key.bin into the keychain (delete file only on success)
        if let Ok(mut existing) = fs::read(legacy_path) {
            if existing.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&existing);
                existing.zeroize();
                if store_key_in_keyring(&entry, &key) {
                    fs::remove_file(legacy_path).ok();
                    log::info!("Encryption key migrated from key.bin to OS keychain");
                }
                return Ok(key);
            }
            existing.zeroize();
        }

        // First run: generate and store in the keychain
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        if store_key_in_keyring(&entry, &key) {
            return Ok(key);
        }
        // Keychain write failed: fall back to file with this key
        return write_key_file(legacy_path, key);
    }

    // No keychain backend at all: file-based behavior
    if let Ok(mut existing) = fs::read(legacy_path) {
        if existing.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&existing);
            existing.zeroize();
            return Ok(key);
        }
        existing.zeroize();
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    write_key_file(legacy_path, key)
}

fn store_key_in_keyring(entry: &keyring::Entry, key: &[u8; 32]) -> bool {
    let mut encoded = general_purpose::STANDARD.encode(key);
    let ok = entry.set_password(&encoded).is_ok();
    encoded.zeroize();
    ok
}

fn write_key_file(path: &PathBuf, key: [u8; 32]) -> SqliteResult<[u8; 32]> {
    fs::write(path, key).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // Restrict key file to the current user (Unix only; Windows relies on profile ACLs)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).ok();
    }

    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        for (i, b) in key.iter_mut().enumerate() {
            *b = i as u8;
        }
        key
    }

    fn test_database() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_method TEXT NOT NULL DEFAULT 'password',
                password TEXT,
                private_key_path TEXT,
                private_key_passphrase TEXT,
                jump_chain TEXT,
                color TEXT NOT NULL DEFAULT 'blue',
                group_id TEXT,
                created_at TEXT NOT NULL,
                icon TEXT,
                notes TEXT,
                usable_as_jump INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'blue',
                icon TEXT NOT NULL DEFAULT 'folder',
                is_expanded INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                parent_id TEXT,
                notes TEXT
             );
             CREATE TABLE commands (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                notes TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
             );
             CREATE TABLE session_logs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                kind TEXT NOT NULL,
                message TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
             );",
        )
        .unwrap();

        Database {
            conn: Mutex::new(conn),
            key: test_key(),
            strict_decrypt: true,
        }
    }

    fn test_session(id: &str) -> Session {
        Session {
            id: id.to_string(),
            name: "Test session".to_string(),
            host: "127.0.0.1".to_string(),
            port: 22,
            username: "tester".to_string(),
            auth_method: "password".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            jump_hops: Vec::new(),
            usable_as_jump: false,
            color: "blue".to_string(),
            icon: None,
            notes: None,
            group_id: None,
            created_at: "2026-06-11T00:00:00.000Z".to_string(),
        }
    }

    fn test_log(session_id: &str, ts: &str, kind: &str, message: &str) -> SessionLog {
        SessionLog {
            id: format!("{}-{}", session_id, ts),
            session_id: session_id.to_string(),
            ts: ts.to_string(),
            kind: kind.to_string(),
            message: message.to_string(),
        }
    }

    /// A session flagged as a jump host, with its own connection secret.
    fn test_jump_session(id: &str) -> Session {
        let mut s = test_session(id);
        s.name = "Salto central".to_string();
        s.host = "10.0.0.1".to_string();
        s.port = 2222;
        s.username = "ops".to_string();
        s.password = Some("jump-secret".to_string());
        s.usable_as_jump = true;
        s
    }

    #[test]
    fn usable_as_jump_flag_roundtrips() {
        let db = test_database();
        db.save_session(&test_jump_session("j1")).unwrap();
        let list = db.get_sessions().unwrap();
        let j = list.iter().find(|s| s.id == "j1").unwrap();
        assert!(j.usable_as_jump);

        // Plain session defaults to false
        db.save_session(&test_session("plain")).unwrap();
        let list = db.get_sessions().unwrap();
        assert!(
            !list
                .iter()
                .find(|s| s.id == "plain")
                .unwrap()
                .usable_as_jump
        );
    }

    #[test]
    fn session_hop_resolves_live_session_reference() {
        let db = test_database();
        // j1 is a session usable as a jump host
        db.save_session(&test_jump_session("j1")).unwrap();

        // s1 references j1 as its hop
        let mut session = test_session("s1");
        session.jump_hops = vec![JumpHop {
            name: None,
            ref_session_id: Some("j1".to_string()),
            host: String::new(),
            port: 0,
            username: String::new(),
            auth_method: "password".to_string(),
            password: None,
            private_key_path: None,
            private_key_passphrase: None,
        }];
        db.save_session(&session).unwrap();

        // count_session_jump_refs sees the reference (and ignores j1 itself)
        assert_eq!(db.count_session_jump_refs("j1").unwrap(), 1);

        // With secrets: hop resolved from j1 (host + decrypted secret)
        let resolved = db.get_session_secrets("s1").unwrap();
        assert_eq!(resolved.jump_hops.len(), 1);
        assert_eq!(resolved.jump_hops[0].host, "10.0.0.1");
        assert_eq!(resolved.jump_hops[0].port, 2222);
        assert_eq!(resolved.jump_hops[0].username, "ops");
        assert_eq!(
            resolved.jump_hops[0].password.as_deref(),
            Some("jump-secret")
        );
        // The reference id is preserved
        assert_eq!(resolved.jump_hops[0].ref_session_id.as_deref(), Some("j1"));

        // Masked list: host resolved for display, secret stays hidden
        let masked = db.get_sessions().unwrap();
        let s = masked.iter().find(|s| s.id == "s1").unwrap();
        assert_eq!(s.jump_hops[0].host, "10.0.0.1");
        assert_eq!(s.jump_hops[0].password, None);

        // Changing j1 propagates to s1 (live reference)
        let mut moved = test_jump_session("j1");
        moved.host = "10.9.9.9".to_string();
        moved.password = Some(String::new()); // keep secret
        db.save_session(&moved).unwrap();
        let again = db.get_session_secrets("s1").unwrap();
        assert_eq!(again.jump_hops[0].host, "10.9.9.9");
    }

    #[test]
    fn session_logs_roundtrip_newest_first_and_export_chronological() {
        let db = test_database();
        db.save_session(&test_session("s1")).unwrap();
        db.add_session_log(&test_log(
            "s1",
            "2026-06-14T10:00:00.000Z",
            "event",
            "connected",
        ))
        .unwrap();
        db.add_session_log(&test_log(
            "s1",
            "2026-06-14T10:01:00.000Z",
            "command",
            "ls -la",
        ))
        .unwrap();

        // get is newest-first
        let logs = db.get_session_logs("s1", None).unwrap();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].message, "ls -la");
        assert_eq!(logs[1].message, "connected");

        // limit caps the result
        let one = db.get_session_logs("s1", Some(1)).unwrap();
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].message, "ls -la");

        // export is chronological (oldest first)
        let (json, count) = db.export_session_logs_json("s1").unwrap();
        assert_eq!(count, 2);
        let connected_at = json.find("connected").unwrap();
        let ls_at = json.find("ls -la").unwrap();
        assert!(connected_at < ls_at);

        // clear empties the log
        db.clear_session_logs("s1").unwrap();
        assert!(db.get_session_logs("s1", None).unwrap().is_empty());
    }

    #[test]
    fn delete_session_cascades_logs() {
        let db = test_database();
        db.save_session(&test_session("s1")).unwrap();
        db.add_session_log(&test_log(
            "s1",
            "2026-06-14T10:00:00.000Z",
            "event",
            "connected",
        ))
        .unwrap();
        db.delete_session("s1").unwrap();
        assert!(db.get_session_logs("s1", None).unwrap().is_empty());
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = test_key();
        let encrypted = encrypt_value(&key, "s3cr3t-páss").unwrap();
        assert!(encrypted.starts_with("v1:"));
        let decrypted = decrypt_value(&key, &Some(encrypted), true).unwrap();
        assert_eq!(decrypted.as_deref(), Some("s3cr3t-páss"));
    }

    #[test]
    fn decrypt_legacy_plaintext_passthrough_lenient_only() {
        let key = test_key();
        let decrypted = decrypt_value(&key, &Some("plaintext".to_string()), false).unwrap();
        assert_eq!(decrypted.as_deref(), Some("plaintext"));
    }

    #[test]
    fn decrypt_strict_rejects_plaintext() {
        // After the startup migrations every secret carries "v1:"; a bare
        // value at runtime means the DB was tampered with or corrupted
        let key = test_key();
        let result = decrypt_value(&key, &Some("plaintext".to_string()), true);
        assert!(result.is_err());
    }

    #[test]
    fn decrypt_corrupted_value_is_error() {
        let key = test_key();
        let result = decrypt_value(&key, &Some("v1:AAAA:corrupted!!".to_string()), true);
        assert!(result.is_err());
    }

    #[test]
    fn decrypt_wrong_key_is_error() {
        let key = test_key();
        let encrypted = encrypt_value(&key, "secret").unwrap();
        let mut other_key = test_key();
        other_key[0] ^= 0xff;
        assert!(decrypt_value(&other_key, &Some(encrypted), true).is_err());
    }

    #[test]
    fn empty_values_stay_empty() {
        let key = test_key();
        assert_eq!(encrypt_value(&key, "").unwrap(), "");
        assert_eq!(
            decrypt_value(&key, &Some(String::new()), true)
                .unwrap()
                .as_deref(),
            Some("")
        );
        assert_eq!(decrypt_value(&key, &None, true).unwrap(), None);
    }

    #[test]
    fn jump_hop_json_roundtrip() {
        let hop = JumpHop {
            name: Some("Bastion DMZ".into()),
            ref_session_id: None,
            host: "bastion1".into(),
            port: 2222,
            username: "ops".into(),
            auth_method: "key".into(),
            password: None,
            private_key_path: Some("~/.ssh/id_ed25519".into()),
            private_key_passphrase: None,
        };
        let json = serde_json::to_string(&[hop]).unwrap();
        let parsed: Vec<JumpHop> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].host, "bastion1");
        assert_eq!(parsed[0].auth_method, "key");
        assert_eq!(parsed[0].name.as_deref(), Some("Bastion DMZ"));
    }

    #[test]
    fn jump_hop_defaults_apply() {
        // Old/minimal JSON without port or authMethod must still parse
        let parsed: Vec<JumpHop> =
            serde_json::from_str(r#"[{"host":"b1","username":"u"}]"#).unwrap();
        assert_eq!(parsed[0].port, 22);
        assert_eq!(parsed[0].auth_method, "password");
    }

    #[test]
    fn delete_session_removes_session_and_scoped_commands() {
        let db = test_database();
        let session = test_session("session-1");
        db.save_session(&session).unwrap();
        db.save_command(&SavedCommand {
            id: "command-session".to_string(),
            session_id: Some(session.id.clone()),
            name: "Session command".to_string(),
            command: "uptime".to_string(),
            notes: None,
        })
        .unwrap();
        db.save_command(&SavedCommand {
            id: "command-global".to_string(),
            session_id: None,
            name: "Global command".to_string(),
            command: "pwd".to_string(),
            notes: None,
        })
        .unwrap();

        db.delete_session(&session.id).unwrap();

        assert!(db.get_sessions().unwrap().is_empty());
        let commands = db.get_commands(None).unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].id, "command-global");
    }

    #[test]
    fn delete_group_detaches_sessions_and_removes_group() {
        let db = test_database();
        let group = SessionGroup {
            id: "group-1".to_string(),
            name: "Production".to_string(),
            color: "red".to_string(),
            icon: "folder".to_string(),
            is_expanded: true,
            sort_order: 0,
            parent_id: None,
            notes: None,
        };
        let mut session = test_session("session-1");
        session.group_id = Some(group.id.clone());

        db.save_group(&group).unwrap();
        db.save_session(&session).unwrap();
        db.delete_group(&group.id).unwrap();

        assert!(db.get_groups().unwrap().is_empty());
        let sessions = db.get_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].group_id, None);
    }

    #[test]
    fn notes_roundtrip_for_session_and_group() {
        let db = test_database();

        let mut session = test_session("session-notes");
        session.notes = Some("prod — no reiniciar".to_string());
        db.save_session(&session).unwrap();
        let loaded = db.get_sessions().unwrap();
        assert_eq!(loaded[0].notes.as_deref(), Some("prod — no reiniciar"));

        let group = SessionGroup {
            id: "group-notes".to_string(),
            name: "Bases de datos".to_string(),
            color: "blue".to_string(),
            icon: "database".to_string(),
            is_expanded: true,
            sort_order: 0,
            parent_id: None,
            notes: Some("puerto 5432".to_string()),
        };
        db.save_group(&group).unwrap();
        let groups = db.get_groups().unwrap();
        assert_eq!(groups[0].notes.as_deref(), Some("puerto 5432"));
    }

    #[test]
    fn export_includes_secrets_and_group_name() {
        let db = test_database();
        let group = SessionGroup {
            id: "g1".to_string(),
            name: "Producción".to_string(),
            color: "red".to_string(),
            icon: "folder".to_string(),
            is_expanded: true,
            sort_order: 0,
            parent_id: None,
            notes: None,
        };
        db.save_group(&group).unwrap();
        let mut session = test_session("s1");
        session.password = Some("S3cr3t!".to_string());
        session.group_id = Some("g1".to_string());
        db.save_session(&session).unwrap();

        let (json, count) = db.export_sessions_json().unwrap();
        assert_eq!(count, 1);
        // Decrypted secret present and group id resolved to its name
        assert!(json.contains("\"password\": \"S3cr3t!\""));
        assert!(json.contains("\"groupName\": \"Producción\""));
        // Internal-only fields are not part of the export shape
        assert!(!json.contains("\"groupId\""));
        assert!(!json.contains("\"createdAt\""));
    }

    #[test]
    fn delete_group_reparents_nested_children() {
        let db = test_database();
        let make_group = |id: &str, parent: Option<&str>| SessionGroup {
            id: id.to_string(),
            name: id.to_string(),
            color: "blue".to_string(),
            icon: "folder".to_string(),
            is_expanded: true,
            sort_order: 0,
            parent_id: parent.map(str::to_string),
            notes: None,
        };
        // root -> mid -> leaf
        db.save_group(&make_group("root", None)).unwrap();
        db.save_group(&make_group("mid", Some("root"))).unwrap();
        db.save_group(&make_group("leaf", Some("mid"))).unwrap();

        // Deleting "mid" must lift "leaf" up to "root" (its grandparent)
        db.delete_group("mid").unwrap();

        let groups = db.get_groups().unwrap();
        assert_eq!(groups.len(), 2);
        let leaf = groups.iter().find(|g| g.id == "leaf").unwrap();
        assert_eq!(leaf.parent_id.as_deref(), Some("root"));
    }
}
