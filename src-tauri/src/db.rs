//! Database module for SSH Manager

use aes_gcm::{aead::{Aead, KeyInit, OsRng}, Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose, Engine as _};
use rand_core::RngCore;
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

// Field-level encryption to avoid storing cleartext credentials on disk.
// Key is generated once per device and stored alongside the database.
const KEY_FILENAME: &str = "key.bin";
const NONCE_SIZE: usize = 12; // AES-GCM standard nonce length

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: Option<String>,
    #[serde(rename = "jumpHost")]
    pub jump_host: Option<String>,
    #[serde(rename = "jumpPort")]
    pub jump_port: Option<i32>,
    #[serde(rename = "jumpUsername")]
    pub jump_username: Option<String>,
    #[serde(rename = "jumpPassword")]
    pub jump_password: Option<String>,
    pub color: String,
    #[serde(rename = "groupId")]
    pub group_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
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

impl Database {
    pub fn new() -> SqliteResult<Self> {
        let base_dir: PathBuf = dirs::config_dir()
            .map(|p| p.join("SSHManager"))
            .unwrap_or_else(|| PathBuf::from("."));
        let db_path = base_dir.join("data.db");
        let key_path = base_dir.join(KEY_FILENAME);

        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).ok();
        }

        let key = load_or_create_key(&key_path)?;
        let conn = Connection::open(&db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                password TEXT,
                jump_host TEXT,
                jump_port INTEGER,
                jump_username TEXT,
                jump_password TEXT,
                color TEXT NOT NULL DEFAULT 'blue',
                group_id TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        let has_group_id: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='group_id'")?
            .query_row([], |row| row.get::<_, i32>(0))
            .map(|count| count > 0)
            .unwrap_or(false);
        if !has_group_id {
            conn.execute("ALTER TABLE sessions ADD COLUMN group_id TEXT", [])?;
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

        Ok(Database { conn: Mutex::new(conn), key })
    }

    fn encrypt(&self, plaintext: &str) -> SqliteResult<String> {
        if plaintext.is_empty() {
            return Ok(String::new());
        }

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let encoded = format!(
            "v1:{}:{}",
            general_purpose::STANDARD_NO_PAD.encode(nonce_bytes),
            general_purpose::STANDARD_NO_PAD.encode(ciphertext)
        );
        Ok(encoded)
    }

    fn decrypt(&self, ciphertext: &Option<String>) -> SqliteResult<Option<String>> {
        if let Some(value) = ciphertext {
            if value.is_empty() {
                return Ok(Some(String::new()));
            }

            if let Some(stripped) = value.strip_prefix("v1:") {
                let mut parts = stripped.splitn(2, ':');
                let nonce_b64 = parts.next().unwrap_or("");
                let data_b64 = parts.next().unwrap_or("");

                let nonce_bytes = general_purpose::STANDARD_NO_PAD
                    .decode(nonce_b64)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                let data_bytes = general_purpose::STANDARD_NO_PAD
                    .decode(data_b64)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

                let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
                let nonce = Nonce::from_slice(&nonce_bytes);
                let plaintext = cipher
                    .decrypt(nonce, data_bytes.as_ref())
                    .map_err(|_| rusqlite::Error::InvalidQuery)
                    .ok();

                return Ok(plaintext.map(|bytes| String::from_utf8_lossy(&bytes).into_owned()));
            }
            return Ok(Some(value.clone()));
        }
        Ok(None)
    }

    pub fn get_sessions(&self) -> SqliteResult<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, host, port, username, password, jump_host, jump_port,
             jump_username, jump_password, color, group_id, created_at FROM sessions ORDER BY name"
        )?;

        let rows = stmt.query_map([], |row| {
            let enc_password: Option<String> = row.get(5)?;
            let enc_jump_password: Option<String> = row.get(9)?;

            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                password: None,
                jump_host: row.get(6)?,
                jump_port: row.get(7)?,
                jump_username: row.get(8)?,
                jump_password: None,
                color: row.get(10)?,
                group_id: row.get(11)?,
                created_at: row.get(12)?,
            }).map(|mut session| {
                session.password = self.decrypt(&enc_password).unwrap_or(None);
                session.jump_password = self.decrypt(&enc_jump_password).unwrap_or(None);
                session
            })
        })?;

        rows.collect()
    }

    pub fn save_session(&self, session: &Session) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let enc_password = match &session.password {
            Some(pwd) => Some(self.encrypt(pwd)?),
            None => None,
        };
        let enc_jump_password = match &session.jump_password {
            Some(pwd) => Some(self.encrypt(pwd)?),
            None => None,
        };
        conn.execute(
            "INSERT OR REPLACE INTO sessions
             (id, name, host, port, username, password, jump_host, jump_port,
              jump_username, jump_password, color, group_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                session.id,
                session.name,
                session.host,
                session.port,
                session.username,
                enc_password,
                session.jump_host,
                session.jump_port,
                session.jump_username,
                enc_jump_password,
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

    pub fn get_commands(&self, session_id: Option<&str>) -> SqliteResult<Vec<SavedCommand>> {
        let conn = self.conn.lock().unwrap();
        let mut results = Vec::new();

        if let Some(sid) = session_id {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, name, command FROM commands
                 WHERE session_id = ?1 OR session_id IS NULL ORDER BY name"
            )?;
            let rows = stmt.query_map(params![sid], |row| {
                Ok(SavedCommand {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    name: row.get(2)?,
                    command: row.get(3)?,
                })
            })?;
            for row in rows {
                results.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, name, command FROM commands ORDER BY name"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(SavedCommand {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    name: row.get(2)?,
                    command: row.get(3)?,
                })
            })?;
            for row in rows {
                results.push(row?);
            }
        }

        Ok(results)
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

fn load_or_create_key(path: &PathBuf) -> SqliteResult<[u8; 32]> {
    if let Ok(existing) = fs::read(path) {
        if existing.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&existing);
            return Ok(key);
        }
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    fs::write(path, &key).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    Ok(key)
}
