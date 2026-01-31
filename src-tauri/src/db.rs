//! Database module for SSH Manager

use rusqlite::{Connection, Result as SqliteResult, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

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
}

impl Database {
    pub fn new() -> SqliteResult<Self> {
        let db_path = dirs::config_dir()
            .map(|p| p.join("SSHManager").join("data.db"))
            .unwrap_or_else(|| std::path::PathBuf::from("data.db"));

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

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

        // Migration: add group_id column if it doesn't exist
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

        Ok(Database { conn: Mutex::new(conn) })
    }

    pub fn get_sessions(&self) -> SqliteResult<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, host, port, username, password, jump_host, jump_port,
             jump_username, jump_password, color, group_id, created_at FROM sessions ORDER BY name"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                password: row.get(5)?,
                jump_host: row.get(6)?,
                jump_port: row.get(7)?,
                jump_username: row.get(8)?,
                jump_password: row.get(9)?,
                color: row.get(10)?,
                group_id: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;

        rows.collect()
    }

    pub fn save_session(&self, session: &Session) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
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
                session.password,
                session.jump_host,
                session.jump_port,
                session.jump_username,
                session.jump_password,
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
