use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Shared types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIConfig {
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet_mode: Option<String>,
}

impl Default for AIConfig {
    fn default() -> Self {
        AIConfig {
            provider: "anthropic".to_string(),
            api_key: None,
            model: "claude-haiku-4-5-20251001".to_string(),
            base_url: None,
            pet_mode: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StoredMessage {
    pub role: String,
    pub content: String,
}

// ─── Paths ────────────────────────────────────────────────────────────────────

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Returns true when a `portable` marker file sits next to the executable.
/// In portable mode all data is written to a `data/` folder beside the exe
/// instead of the user's home directory — safe to run from a USB drive.
pub fn is_portable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("portable").exists()))
        .unwrap_or(false)
}

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn config_path() -> PathBuf {
    if is_portable() {
        exe_dir().join("data").join("config.toml")
    } else {
        home_dir().join(".config").join("nekoai").join("config.toml")
    }
}

pub fn db_path() -> PathBuf {
    if is_portable() {
        exe_dir().join("data").join("memory.db")
    } else {
        home_dir()
            .join(".local")
            .join("share")
            .join("nekoai")
            .join("memory.db")
    }
}

// ─── Config (TOML) ────────────────────────────────────────────────────────────

pub fn read_config() -> AIConfig {
    let path = config_path();
    if !path.exists() {
        return AIConfig::default();
    }
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return AIConfig::default(),
    };
    toml::from_str(&text).unwrap_or_default()
}

pub fn write_config(config: &AIConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = toml::to_string(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

// ─── SQLite ───────────────────────────────────────────────────────────────────

fn open_db() -> Result<Connection, String> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    Ok(conn)
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS conversations (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            role      TEXT    NOT NULL,
            content   TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_facts (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())
}

// ─── Conversations ────────────────────────────────────────────────────────────

pub fn get_recent_messages(limit: u32) -> Result<Vec<StoredMessage>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT role, content FROM conversations
             ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(StoredMessage {
                role: row.get(0)?,
                content: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut messages: Vec<StoredMessage> = rows.filter_map(|r| r.ok()).collect();
    messages.reverse(); // return chronological order (oldest first)
    Ok(messages)
}

pub fn save_message(role: &str, content: &str) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "INSERT INTO conversations (role, content) VALUES (?1, ?2)",
        params![role, content],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── User facts ───────────────────────────────────────────────────────────────

pub fn get_user_fact(key: &str) -> Result<Option<String>, String> {
    let conn = open_db()?;
    match conn.query_row(
        "SELECT value FROM user_facts WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ) {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn set_user_fact(key: &str, value: &str) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "INSERT INTO user_facts (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all_user_facts() -> Result<std::collections::HashMap<String, String>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM user_facts")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for row in rows.filter_map(|r| r.ok()) {
        map.insert(row.0, row.1);
    }
    Ok(map)
}
