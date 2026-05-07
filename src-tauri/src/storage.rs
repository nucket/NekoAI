use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::Duration;

// ─── Pruning policy ───────────────────────────────────────────────────────────
// Conversations are pruned after every Nth `save_message` so the table cannot
// grow unbounded across months of use. The whichever-cuts-more rule keeps
// chatty users from blowing past the row cap and idle users from carrying
// stale rows forever.

const PRUNE_MAX_ROWS: u32 = 200;
const PRUNE_MAX_AGE_DAYS: i64 = 30;
const PRUNE_EVERY_N_INSERTS: u32 = 20;

static INSERTS_SINCE_PRUNE: AtomicU32 = AtomicU32::new(0);

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_pet_id: Option<String>,
}

impl Default for AIConfig {
    fn default() -> Self {
        AIConfig {
            provider: "anthropic".to_string(),
            api_key: None,
            model: "claude-haiku-4-5-20251001".to_string(),
            base_url: None,
            pet_mode: None,
            active_pet_id: Some("classic-neko".to_string()),
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
        return exe_dir().join("data").join("config.toml");
    }
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join(".config"));
    base.join("nekoai").join("config.toml")
}

pub fn db_path() -> PathBuf {
    if is_portable() {
        return exe_dir().join("data").join("memory.db");
    }
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join(".local").join("share"));
    base.join("nekoai").join("memory.db")
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
//
// NekoAI is a single-user desktop app, so a process-wide `Mutex<Connection>`
// is the right shape: it serialises concurrent writers (chat saves vs config
// writes) and avoids the SQLITE_BUSY errors that came from opening a fresh
// `rusqlite::Connection` per call. WAL + a 5s busy_timeout keep readers from
// blocking on a slow writer. A real connection pool (r2d2) would be overkill
// for this workload.

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

fn db() -> Result<MutexGuard<'static, Connection>, String> {
    let mutex = match DB.get() {
        Some(m) => m,
        None => {
            let conn = open_connection()?;
            // Two threads can race to set this; only the winner's Connection
            // is kept, the other is dropped harmlessly.
            DB.get_or_init(|| Mutex::new(conn))
        }
    };
    // A poisoned mutex means a previous holder panicked mid-statement; we
    // recover the guard rather than propagate the panic.
    Ok(mutex.lock().unwrap_or_else(|p| p.into_inner()))
}

fn open_connection() -> Result<Connection, String> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    // WAL keeps readers and a writer concurrent on a single DB file — the
    // common case here (chat reads context while saving the next message).
    let _: String = conn
        .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;
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
        CREATE INDEX IF NOT EXISTS idx_conversations_id_desc
            ON conversations(id DESC);
        CREATE INDEX IF NOT EXISTS idx_conversations_timestamp
            ON conversations(timestamp);
        CREATE TABLE IF NOT EXISTS user_facts (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())
}

// ─── Conversations ────────────────────────────────────────────────────────────

pub fn get_recent_messages(limit: u32) -> Result<Vec<StoredMessage>, String> {
    let conn = db()?;
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
    let conn = db()?;
    conn.execute(
        "INSERT INTO conversations (role, content) VALUES (?1, ?2)",
        params![role, content],
    )
    .map_err(|e| e.to_string())?;

    // Periodic pruning: amortise the cleanup so we are not running it on
    // every single insert.
    let count = INSERTS_SINCE_PRUNE.fetch_add(1, Ordering::Relaxed) + 1;
    if count >= PRUNE_EVERY_N_INSERTS {
        INSERTS_SINCE_PRUNE.store(0, Ordering::Relaxed);
        // Pruning failure must not break the user-visible save path.
        let _ = prune_with_conn(&conn, PRUNE_MAX_ROWS, PRUNE_MAX_AGE_DAYS);
    }

    Ok(())
}

/// Deletes conversation rows older than `max_age_days` and rows beyond the
/// most-recent `max_rows`, whichever cuts more. Returns the number of rows
/// removed.
pub fn prune_conversations(max_rows: u32, max_age_days: i64) -> Result<u32, String> {
    let conn = db()?;
    prune_with_conn(&conn, max_rows, max_age_days)
}

fn prune_with_conn(conn: &Connection, max_rows: u32, max_age_days: i64) -> Result<u32, String> {
    let cutoff_secs = max_age_days.saturating_mul(86_400);

    let aged = conn
        .execute(
            "DELETE FROM conversations
             WHERE timestamp < (strftime('%s', 'now') - ?1)",
            params![cutoff_secs],
        )
        .map_err(|e| e.to_string())?;

    let over_cap = conn
        .execute(
            "DELETE FROM conversations
             WHERE id NOT IN (
                 SELECT id FROM conversations
                 ORDER BY id DESC
                 LIMIT ?1
             )",
            params![max_rows],
        )
        .map_err(|e| e.to_string())?;

    Ok((aged + over_cap) as u32)
}

/// Deletes every conversation row. Used by the "Reset memory" action.
pub fn clear_conversations() -> Result<u32, String> {
    let conn = db()?;
    let removed = conn
        .execute("DELETE FROM conversations", [])
        .map_err(|e| e.to_string())?;
    Ok(removed as u32)
}

// ─── User facts ───────────────────────────────────────────────────────────────

pub fn get_user_fact(key: &str) -> Result<Option<String>, String> {
    let conn = db()?;
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
    let conn = db()?;
    conn.execute(
        "INSERT INTO user_facts (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all_user_facts() -> Result<std::collections::HashMap<String, String>, String> {
    let conn = db()?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM user_facts")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for row in rows.filter_map(|r| r.ok()) {
        map.insert(row.0, row.1);
    }
    Ok(map)
}
