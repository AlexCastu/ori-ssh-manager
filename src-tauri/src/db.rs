//! Database module for ORI-SSHManager

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand_core::RngCore;
use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

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

/// One hop of the jump chain (bastion). Secrets are stored encrypted
/// inside the serialized JSON chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHop {
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
    pub color: String,
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
    pub is_expanded: bool,
    #[serde(rename = "order")]
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCommand {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub name: String,
    pub command: String,
}

pub struct Database {
    conn: Mutex<Connection>,
    key: [u8; 32],
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

/// Decrypt a `v1:` value. Values without the prefix are legacy plaintext and
/// returned as-is (the startup migration re-encrypts them). A value that has
/// the prefix but fails to decrypt is a hard error, not a silent None.
fn decrypt_value(key: &[u8; 32], ciphertext: &Option<String>) -> SqliteResult<Option<String>> {
    let Some(value) = ciphertext else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(Some(String::new()));
    }

    let Some(stripped) = value.strip_prefix("v1:") else {
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
    let plaintext = cipher
        .decrypt(nonce, data_bytes.as_ref())
        .map_err(|_| corrupt_secret_err())?;

    Ok(Some(String::from_utf8_lossy(&plaintext).into_owned()))
}

impl Database {
    pub fn new() -> SqliteResult<Self> {
        let base_dir: PathBuf = dirs::config_dir()
            .map(|p| p.join("SSHManager"))
            .unwrap_or_else(|| PathBuf::from("."));
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
        conn.execute_batch("PRAGMA synchronous=NORMAL;")?;

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

        conn.execute(
            "CREATE TABLE IF NOT EXISTS commands (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Groups live in SQLite next to the sessions that reference them
        // (they used to live only in localStorage, which could desync)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'blue',
                is_expanded INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )?;

        let db = Database {
            conn: Mutex::new(conn),
            key,
        };
        db.reencrypt_legacy_secrets()?;
        db.migrate_legacy_jump_columns()?;
        Ok(db)
    }

    /// One-time migration: secrets stored before field encryption existed
    /// (values without the "v1:" prefix) are re-encrypted in place so no
    /// plaintext credential remains on disk
    fn reencrypt_legacy_secrets(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        let has_jump_password: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='jump_password'")?
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
            if !is_plaintext(&password) && !is_plaintext(&passphrase) && !is_plaintext(&jump_password)
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
                params![id, encrypt_if_plaintext(password.clone())?, encrypt_if_plaintext(passphrase)?],
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
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
            })?;
            mapped.collect::<SqliteResult<_>>()?
        };

        for (id, host, port, username, password) in rows {
            let hop = JumpHop {
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
        decrypt_value(&self.key, ciphertext)
    }

    const SESSION_COLUMNS: &'static str =
        "id, name, host, port, username, auth_method, password, private_key_path,
         private_key_passphrase, jump_chain, color, group_id, created_at";

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
            color: row.get(10)?,
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
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM sessions ORDER BY name",
            Self::SESSION_COLUMNS
        ))?;

        let rows = stmt.query_map([], |row| self.session_from_row(row, false))?;
        rows.collect()
    }

    /// Fetch one session WITH decrypted credentials (backend-internal use only)
    pub fn get_session_secrets(&self, id: &str) -> SqliteResult<Session> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM sessions WHERE id = ?1",
            Self::SESSION_COLUMNS
        ))?;
        stmt.query_row(params![id], |row| self.session_from_row(row, true))
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
              private_key_passphrase, jump_chain, color, group_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
            ],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== GROUPS ====================

    pub fn get_groups(&self) -> SqliteResult<Vec<SessionGroup>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, color, is_expanded, sort_order FROM groups ORDER BY sort_order, name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SessionGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                is_expanded: row.get::<_, i32>(3)? != 0,
                sort_order: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn save_group(&self, group: &SessionGroup) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO groups (id, name, color, is_expanded, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                group.id,
                group.name,
                group.color,
                group.is_expanded as i32,
                group.sort_order,
            ],
        )?;
        Ok(())
    }

    /// Delete a group and detach its sessions (group_id = NULL)
    pub fn delete_group(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET group_id = NULL WHERE group_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        Ok(())
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
            })
        };

        if let Some(sid) = session_id {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, name, command FROM commands
                 WHERE session_id = ?1 OR session_id IS NULL ORDER BY name",
            )?;
            let rows = stmt.query_map(params![sid], map_row)?;
            rows.collect()
        } else {
            let mut stmt =
                conn.prepare("SELECT id, session_id, name, command FROM commands ORDER BY name")?;
            let rows = stmt.query_map([], map_row)?;
            rows.collect()
        }
    }

    pub fn save_command(&self, cmd: &SavedCommand) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO commands (id, session_id, name, command)
             VALUES (?1, ?2, ?3, ?4)",
            params![cmd.id, cmd.session_id, cmd.name, cmd.command],
        )?;
        Ok(())
    }

    pub fn delete_command(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM commands WHERE id = ?1", params![id])?;
        Ok(())
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
        // Existing key in the OS keychain
        if let Ok(stored) = entry.get_password() {
            if let Ok(bytes) = general_purpose::STANDARD.decode(&stored) {
                if bytes.len() == 32 {
                    let mut key = [0u8; 32];
                    key.copy_from_slice(&bytes);
                    return Ok(key);
                }
            }
        }

        // Migrate legacy key.bin into the keychain (delete file only on success)
        if let Ok(existing) = fs::read(legacy_path) {
            if existing.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&existing);
                if entry
                    .set_password(&general_purpose::STANDARD.encode(key))
                    .is_ok()
                {
                    fs::remove_file(legacy_path).ok();
                    log::info!("Encryption key migrated from key.bin to OS keychain");
                }
                return Ok(key);
            }
        }

        // First run: generate and store in the keychain
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        if entry
            .set_password(&general_purpose::STANDARD.encode(key))
            .is_ok()
        {
            return Ok(key);
        }
        // Keychain write failed: fall back to file with this key
        return write_key_file(legacy_path, key);
    }

    // No keychain backend at all: file-based behavior
    if let Ok(existing) = fs::read(legacy_path) {
        if existing.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&existing);
            return Ok(key);
        }
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    write_key_file(legacy_path, key)
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

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = test_key();
        let encrypted = encrypt_value(&key, "s3cr3t-páss").unwrap();
        assert!(encrypted.starts_with("v1:"));
        let decrypted = decrypt_value(&key, &Some(encrypted)).unwrap();
        assert_eq!(decrypted.as_deref(), Some("s3cr3t-páss"));
    }

    #[test]
    fn decrypt_legacy_plaintext_passthrough() {
        let key = test_key();
        let decrypted = decrypt_value(&key, &Some("plaintext".to_string())).unwrap();
        assert_eq!(decrypted.as_deref(), Some("plaintext"));
    }

    #[test]
    fn decrypt_corrupted_value_is_error() {
        let key = test_key();
        let result = decrypt_value(&key, &Some("v1:AAAA:corrupted!!".to_string()));
        assert!(result.is_err());
    }

    #[test]
    fn decrypt_wrong_key_is_error() {
        let key = test_key();
        let encrypted = encrypt_value(&key, "secret").unwrap();
        let mut other_key = test_key();
        other_key[0] ^= 0xff;
        assert!(decrypt_value(&other_key, &Some(encrypted)).is_err());
    }

    #[test]
    fn empty_values_stay_empty() {
        let key = test_key();
        assert_eq!(encrypt_value(&key, "").unwrap(), "");
        assert_eq!(
            decrypt_value(&key, &Some(String::new())).unwrap().as_deref(),
            Some("")
        );
        assert_eq!(decrypt_value(&key, &None).unwrap(), None);
    }

    #[test]
    fn jump_hop_json_roundtrip() {
        let hop = JumpHop {
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
    }

    #[test]
    fn jump_hop_defaults_apply() {
        // Old/minimal JSON without port or authMethod must still parse
        let parsed: Vec<JumpHop> =
            serde_json::from_str(r#"[{"host":"b1","username":"u"}]"#).unwrap();
        assert_eq!(parsed[0].port, 22);
        assert_eq!(parsed[0].auth_method, "password");
    }
}
