use crate::secrets::{self, SecretStore};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
// Fields missing from the TOML take their value from `AIConfig::default()`, so
// a hand-edited or older file without e.g. `model` still loads.
#[serde(default)]
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
    // Onboarding flags. `None` means "not decided yet" so the first launch
    // after upgrading from a pre-onboarding TOML still triggers the flow.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub onboarding_completed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ollama_auto_detected: Option<bool>,
    // Token budget for each AI reply. `None` falls back to `DEFAULT_MAX_TOKENS`
    // in lib.rs / src/ai/types.ts. Surfaced as Short/Medium/Long in Settings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    // Sprite size in logical px (32 / 64 / 96 / 128). `None` lets the frontend
    // fall back to 32. Every field of `AIConfig` in src/ai/types.ts needs a
    // twin here: serde silently drops unknown keys, which is how this one used
    // to be lost on every save.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet_size: Option<u32>,
}

impl Default for AIConfig {
    fn default() -> Self {
        // Gemini is the default provider because aistudio.google.com offers a
        // free tier with no credit card — minimal onboarding friction. The TS
        // default in src/store/configStore.ts must mirror this.
        AIConfig {
            provider: "gemini".to_string(),
            api_key: None,
            model: "gemini-2.5-flash".to_string(),
            base_url: None,
            pet_mode: None,
            active_pet_id: Some("classic-neko".to_string()),
            onboarding_completed: None,
            ollama_auto_detected: None,
            max_tokens: None,
            pet_size: None,
        }
    }
}

/// The config as the WebViews see it: the API key is never sent to them,
/// only whether one is stored. Provider calls read the key on the Rust side.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    #[serde(flatten)]
    pub config: AIConfig,
    pub has_api_key: bool,
}

impl From<AIConfig> for PublicConfig {
    fn from(mut config: AIConfig) -> Self {
        let has_api_key = config
            .api_key
            .as_deref()
            .is_some_and(|k| !k.trim().is_empty());
        config.api_key = None;
        PublicConfig {
            config,
            has_api_key,
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

const APP_DIR: &str = "nekoai";
const CONFIG_FILE: &str = "config.toml";
const DB_FILE: &str = "memory.db";

/// Platform-standard directory for config.toml:
/// `$XDG_CONFIG_HOME` or `~/.config` on Linux, `%APPDATA%` (roaming) on
/// Windows, `~/Library/Application Support` on macOS.
fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| home_dir().join(".config"))
        .join(APP_DIR)
}

/// Platform-standard directory for memory.db: `$XDG_DATA_HOME` or
/// `~/.local/share` on Linux, `%LOCALAPPDATA%` on Windows (a SQLite file
/// shouldn't roam with the profile), `~/Library/Application Support` on macOS.
fn data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| home_dir().join(".local").join("share"))
        .join(APP_DIR)
}

/// Where versions up to 0.3.x kept config.toml on every OS.
fn legacy_config_dir() -> PathBuf {
    std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join(".config"))
        .join(APP_DIR)
}

/// Where versions up to 0.3.x kept memory.db on every OS.
fn legacy_data_dir() -> PathBuf {
    std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join(".local").join("share"))
        .join(APP_DIR)
}

pub fn config_path() -> PathBuf {
    if is_portable() {
        return exe_dir().join("data").join(CONFIG_FILE);
    }
    config_dir().join(CONFIG_FILE)
}

pub fn db_path() -> PathBuf {
    if is_portable() {
        return exe_dir().join("data").join(DB_FILE);
    }
    data_dir().join(DB_FILE)
}

/// One-time move of config.toml and memory.db from the pre-0.4 locations
/// (`~/.config/nekoai`, `~/.local/share/nekoai` on every OS) to the platform
/// directories. Must run before anything opens the database or reads the
/// config. A no-op in portable mode, on Linux (the paths are the same), and
/// whenever the new location already has the file.
pub fn migrate_legacy_paths() {
    if is_portable() {
        return;
    }
    let moves: [(PathBuf, PathBuf, &[&str]); 2] = [
        (legacy_config_dir(), config_dir(), &[CONFIG_FILE]),
        // The WAL / shared-memory files belong to the database; moving the
        // .db without them could drop the last transactions.
        (
            legacy_data_dir(),
            data_dir(),
            &[DB_FILE, "memory.db-wal", "memory.db-shm"],
        ),
    ];
    for (from, to, names) in moves {
        match migrate_files(&from, &to, names) {
            Ok(0) => {}
            Ok(n) => eprintln!(
                "[storage] moved {n} file(s) from {} to {}",
                from.display(),
                to.display()
            ),
            Err(e) => eprintln!(
                "[storage] could not move {} to {}: {e}",
                from.display(),
                to.display()
            ),
        }
    }
}

/// Moves `names` from `from` to `to` when the first name (the primary file)
/// exists in `from` but not in `to`. Never overwrites, and removes `from`
/// afterwards if it is left empty. Returns how many files were moved.
fn migrate_files(from: &Path, to: &Path, names: &[&str]) -> std::io::Result<usize> {
    let Some(primary) = names.first() else {
        return Ok(0);
    };
    if from == to || !from.join(primary).exists() || to.join(primary).exists() {
        return Ok(0);
    }
    std::fs::create_dir_all(to)?;
    let mut moved = 0;
    for name in names {
        let src = from.join(name);
        if !src.exists() {
            continue;
        }
        let dst = to.join(name);
        // rename fails across volumes (e.g. a redirected profile folder);
        // fall back to copy + delete.
        if std::fs::rename(&src, &dst).is_err() {
            std::fs::copy(&src, &dst)?;
            std::fs::remove_file(&src)?;
        }
        moved += 1;
    }
    let _ = std::fs::remove_dir(from); // only succeeds when empty
    Ok(moved)
}

// ─── Config (TOML) ────────────────────────────────────────────────────────────

/// The full config, API key included (from the OS credential store, or from
/// the file when no store is available). Never send this to a WebView; use
/// `PublicConfig`.
pub fn load_config() -> AIConfig {
    load_config_with(&config_path(), secrets::os_store())
}

/// Saves the config, putting the API key in the OS credential store rather
/// than in config.toml when one is available. `api_key: None` removes it.
pub fn save_config(config: &AIConfig) -> Result<(), String> {
    save_config_with(&config_path(), secrets::os_store(), config)
}

fn non_empty(key: Option<&str>) -> Option<&str> {
    key.map(str::trim).filter(|k| !k.is_empty())
}

fn load_config_with(path: &Path, store: Option<&dyn SecretStore>) -> AIConfig {
    let mut config = read_config_from(path);
    let Some(store) = store else {
        return config;
    };

    if let Some(key) = non_empty(config.api_key.as_deref()).map(str::to_string) {
        // A key still in the file: written by a version before the credential
        // store, or by the file fallback. Move it into the store and strip it
        // from the file; if the store is unavailable, keep using the file.
        if store.set(&key).is_ok() {
            let mut on_disk = config.clone();
            on_disk.api_key = None;
            if let Err(e) = write_config_to(path, &on_disk) {
                eprintln!(
                    "[storage] API key moved to the keychain, but config.toml kept a copy: {e}"
                );
            }
        }
        config.api_key = Some(key);
        return config;
    }

    match store.get() {
        Ok(key) => config.api_key = key,
        Err(e) => eprintln!("[storage] credential store unavailable: {e}"),
    }
    config
}

fn save_config_with(
    path: &Path,
    store: Option<&dyn SecretStore>,
    config: &AIConfig,
) -> Result<(), String> {
    let mut on_disk = config.clone();
    if let Some(store) = store {
        match non_empty(config.api_key.as_deref()) {
            Some(key) => match store.set(key) {
                Ok(()) => on_disk.api_key = None,
                // No usable credential store (e.g. no Secret Service running):
                // keep the key in config.toml, which is owner-only on Unix.
                Err(e) => eprintln!(
                    "[storage] credential store unavailable, keeping the key in config.toml: {e}"
                ),
            },
            None => {
                on_disk.api_key = None;
                if let Err(e) = store.delete() {
                    eprintln!("[storage] could not remove the stored API key: {e}");
                }
            }
        }
    }
    write_config_to(path, &on_disk)
}

/// A missing file yields the defaults. A file that exists but can't be read or
/// parsed is renamed to `config.toml.bak-<unix-secs>` before falling back:
/// otherwise the next `save_config` (almost any UI action) would overwrite it
/// and silently wipe the user's provider, model and API key.
fn read_config_from(path: &Path) -> AIConfig {
    let parsed: Result<AIConfig, String> = match std::fs::read_to_string(path) {
        Ok(text) => toml::from_str(&text).map_err(|e| e.to_string()),
        Err(e) if e.kind() == ErrorKind::NotFound => return AIConfig::default(),
        Err(e) => Err(e.to_string()),
    };
    match parsed {
        Ok(config) => config,
        Err(reason) => {
            let backup = backup_path(path);
            match std::fs::rename(path, &backup) {
                Ok(()) => eprintln!(
                    "[nekoai] invalid config ({reason}); moved it to {}",
                    backup.display()
                ),
                Err(e) => eprintln!("[nekoai] invalid config ({reason}); backup failed: {e}"),
            }
            AIConfig::default()
        }
    }
}

fn backup_path(path: &Path) -> PathBuf {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".bak-{secs}"));
    path.with_file_name(name)
}

/// Writes atomically — serialise to a sibling `.tmp`, fsync, then rename over
/// the real file — so a crash mid-write can't leave a truncated config.toml
/// behind (which `read_config` would then have to treat as corrupt).
fn write_config_to(path: &Path, config: &AIConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = toml::to_string(config).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("toml.tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    // Owner-only on Unix: the file can hold an API key when no credential
    // store is available (and always in portable mode).
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

// Serialises read-modify-write cycles so two windows patching the config at
// the same time can't interleave and lose one of the updates.
static CONFIG_LOCK: Mutex<()> = Mutex::new(());

/// Merges a partial config (see `merge_config`) into the stored one, writes
/// it and returns the result. Each window sends only the fields it changed,
/// so a stale copy of the config in one window can't overwrite another
/// window's edits.
pub fn patch_config(patch: &serde_json::Value) -> Result<AIConfig, String> {
    let _guard = CONFIG_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let config = merge_config(&load_config(), patch)?;
    save_config(&config)?;
    Ok(config)
}

/// Applies a partial camelCase JSON object to `current`. A `null` value clears
/// an optional field (required ones fall back to their default). Keys that
/// `AIConfig` doesn't know are rejected rather than silently dropped.
fn merge_config(current: &AIConfig, patch: &serde_json::Value) -> Result<AIConfig, String> {
    let fields = patch.as_object().ok_or("patch must be an object")?;
    let mut merged = serde_json::to_value(current).map_err(|e| e.to_string())?;
    let target = merged.as_object_mut().ok_or("config is not an object")?;
    for (key, value) in fields {
        // Read-only view field from PublicConfig, not part of the stored config.
        if key == "hasApiKey" {
            continue;
        }
        if value.is_null() {
            target.remove(key);
        } else {
            target.insert(key.clone(), value.clone());
        }
    }
    let config: AIConfig = serde_json::from_value(merged).map_err(|e| e.to_string())?;
    // serde drops unknown keys on deserialize; spot them by re-serializing.
    let known = serde_json::to_value(&config).map_err(|e| e.to_string())?;
    for (key, value) in fields {
        if key != "hasApiKey" && !value.is_null() && known.get(key).is_none() {
            return Err(format!("unknown config field: {key}"));
        }
    }
    Ok(config)
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
    .map_err(|e| e.to_string())?;

    // Settings used to store the user's name under `userName` while chat
    // extraction wrote `name`, so both ended up in the prompt. Fold the old
    // key into `name` (the value typed in Settings wins). Idempotent: once
    // `userName` is gone both statements are no-ops.
    conn.execute_batch(
        "INSERT INTO user_facts (key, value)
            SELECT 'name', value FROM user_facts WHERE key = 'userName'
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        DELETE FROM user_facts WHERE key = 'userName';",
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

/// Forgets one learned fact. Used by Settings → Memory.
pub fn delete_user_fact(key: &str) -> Result<(), String> {
    let conn = db()?;
    conn.execute("DELETE FROM user_facts WHERE key = ?1", params![key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Forgets every learned fact. Used by Settings → Memory → "Forget everything".
pub fn clear_user_facts() -> Result<u32, String> {
    let conn = db()?;
    let removed = conn
        .execute("DELETE FROM user_facts", [])
        .map_err(|e| e.to_string())?;
    Ok(removed as u32)
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty directory per test so parallel tests never collide.
    fn temp_config(test: &str) -> PathBuf {
        let name = format!("nekoai-{test}-{}", std::process::id());
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("config.toml")
    }

    fn temp_dir(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nekoai-{test}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const DB_NAMES: &[&str] = &["memory.db", "memory.db-wal", "memory.db-shm"];

    #[test]
    fn migration_moves_the_database_with_its_wal_files() {
        let root = temp_dir("migrate-move");
        let (from, to) = (root.join("old"), root.join("new"));
        std::fs::create_dir_all(&from).unwrap();
        std::fs::write(from.join("memory.db"), b"db").unwrap();
        std::fs::write(from.join("memory.db-wal"), b"wal").unwrap();

        assert_eq!(migrate_files(&from, &to, DB_NAMES).unwrap(), 2);
        assert_eq!(std::fs::read(to.join("memory.db")).unwrap(), b"db");
        assert_eq!(std::fs::read(to.join("memory.db-wal")).unwrap(), b"wal");
        assert!(!to.join("memory.db-shm").exists());
        // The emptied legacy directory is removed.
        assert!(!from.exists());
    }

    #[test]
    fn migration_never_overwrites_existing_data() {
        let root = temp_dir("migrate-keep");
        let (from, to) = (root.join("old"), root.join("new"));
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        std::fs::write(from.join("config.toml"), b"old").unwrap();
        std::fs::write(to.join("config.toml"), b"new").unwrap();

        assert_eq!(migrate_files(&from, &to, &["config.toml"]).unwrap(), 0);
        assert_eq!(std::fs::read(to.join("config.toml")).unwrap(), b"new");
        assert_eq!(std::fs::read(from.join("config.toml")).unwrap(), b"old");
    }

    #[test]
    fn migration_is_a_no_op_without_legacy_data_or_when_paths_match() {
        let root = temp_dir("migrate-noop");
        let (from, to) = (root.join("old"), root.join("new"));
        assert_eq!(migrate_files(&from, &to, DB_NAMES).unwrap(), 0);
        assert!(!to.exists());

        std::fs::create_dir_all(&from).unwrap();
        std::fs::write(from.join("memory.db"), b"db").unwrap();
        assert_eq!(migrate_files(&from, &from, DB_NAMES).unwrap(), 0);
        assert!(from.join("memory.db").exists());
    }

    fn find_backups(path: &Path) -> Vec<PathBuf> {
        let dir = path.parent().unwrap();
        let mut found = Vec::new();
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("config.toml.bak-") {
                found.push(entry.path());
            }
        }
        found
    }

    #[test]
    fn patch_merges_only_the_given_fields() {
        let current = AIConfig {
            api_key: Some("sk-keep".to_string()),
            max_tokens: Some(256),
            ..AIConfig::default()
        };
        let patch = serde_json::json!({ "petSize": 96, "maxTokens": null });
        let merged = merge_config(&current, &patch).unwrap();
        assert_eq!(merged.api_key.as_deref(), Some("sk-keep"));
        assert_eq!(merged.pet_size, Some(96));
        assert_eq!(merged.max_tokens, None);
    }

    #[test]
    fn patch_rejects_unknown_fields() {
        let patch = serde_json::json!({ "petSzie": 64 });
        let err = merge_config(&AIConfig::default(), &patch).unwrap_err();
        assert!(err.contains("petSzie"));
    }

    #[test]
    fn patch_must_be_an_object() {
        let patch = serde_json::json!(["provider"]);
        assert!(merge_config(&AIConfig::default(), &patch).is_err());
    }

    #[test]
    fn missing_config_yields_defaults() {
        let path = temp_config("missing");
        assert_eq!(read_config_from(&path).provider, "gemini");
        assert!(find_backups(&path).is_empty());
    }

    #[test]
    fn config_round_trips_through_atomic_write() {
        let path = temp_config("roundtrip");
        let config = AIConfig {
            provider: "anthropic".to_string(),
            api_key: Some("sk-test".to_string()),
            ..AIConfig::default()
        };
        write_config_to(&path, &config).unwrap();
        let read = read_config_from(&path);
        assert_eq!(read.provider, "anthropic");
        assert_eq!(read.api_key.as_deref(), Some("sk-test"));
        assert!(!path.with_extension("toml.tmp").exists());
    }

    fn keyed_config() -> AIConfig {
        AIConfig {
            provider: "openai".into(),
            api_key: Some("sk-secret".into()),
            ..AIConfig::default()
        }
    }

    fn file_has_key(path: &Path) -> bool {
        std::fs::read_to_string(path).unwrap().contains("sk-secret")
    }

    #[test]
    fn a_plaintext_key_moves_to_the_credential_store() {
        let path = temp_config("keychain-migrate");
        write_config_to(&path, &keyed_config()).unwrap();
        let store = secrets::MemoryStore::new();

        let loaded = load_config_with(&path, Some(&store));
        assert_eq!(loaded.api_key.as_deref(), Some("sk-secret"));
        assert_eq!(store.current().as_deref(), Some("sk-secret"));
        assert!(!file_has_key(&path));
        // The file keeps everything else.
        assert_eq!(read_config_from(&path).provider, "openai");
    }

    #[test]
    fn saving_keeps_the_key_out_of_the_file_and_none_removes_it() {
        let path = temp_config("keychain-save");
        let store = secrets::MemoryStore::new();

        save_config_with(&path, Some(&store), &keyed_config()).unwrap();
        assert!(!file_has_key(&path));
        assert_eq!(
            load_config_with(&path, Some(&store)).api_key.as_deref(),
            Some("sk-secret")
        );

        let cleared = AIConfig {
            api_key: None,
            ..keyed_config()
        };
        save_config_with(&path, Some(&store), &cleared).unwrap();
        assert_eq!(store.current(), None);
        assert_eq!(load_config_with(&path, Some(&store)).api_key, None);
    }

    #[test]
    fn without_a_usable_store_the_key_stays_in_the_file() {
        let path = temp_config("keychain-fallback");
        let broken = secrets::MemoryStore::broken();
        save_config_with(&path, Some(&broken), &keyed_config()).unwrap();
        assert!(file_has_key(&path));
        assert_eq!(
            load_config_with(&path, Some(&broken)).api_key.as_deref(),
            Some("sk-secret")
        );

        // Portable mode: no store at all.
        let path = temp_config("keychain-portable");
        save_config_with(&path, None, &keyed_config()).unwrap();
        assert!(file_has_key(&path));
        assert_eq!(
            load_config_with(&path, None).api_key.as_deref(),
            Some("sk-secret")
        );
    }

    #[test]
    fn public_config_never_carries_the_key() {
        let public = PublicConfig::from(keyed_config());
        assert!(public.has_api_key);
        let json = serde_json::to_value(&public).unwrap();
        assert!(json.get("apiKey").is_none());
        assert_eq!(json["hasApiKey"], true);
        assert_eq!(json["provider"], "openai");
        assert!(!PublicConfig::from(AIConfig::default()).has_api_key);
    }

    #[test]
    fn patches_may_echo_has_api_key() {
        let patch = serde_json::json!({ "hasApiKey": true, "model": "gpt-4o" });
        let merged = merge_config(&keyed_config(), &patch).unwrap();
        assert_eq!(merged.model, "gpt-4o");
        assert_eq!(merged.api_key.as_deref(), Some("sk-secret"));
    }

    #[cfg(unix)]
    #[test]
    fn config_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let path = temp_config("perms");
        write_config_to(&path, &keyed_config()).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn corrupt_config_is_backed_up_not_destroyed() {
        let path = temp_config("corrupt");
        let corrupt = "provider = \"anthropic\"\napiKey = [oops";
        std::fs::write(&path, corrupt).unwrap();

        let config = read_config_from(&path);
        assert_eq!(config.provider, "gemini");
        assert!(!path.exists(), "corrupt file should be moved aside");

        let backups = find_backups(&path);
        assert_eq!(backups.len(), 1);
        let saved = std::fs::read_to_string(&backups[0]).unwrap();
        assert_eq!(saved, corrupt);
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let path = temp_config("partial");
        std::fs::write(&path, "apiKey = \"sk-test\"\n").unwrap();
        let config = read_config_from(&path);
        assert_eq!(config.model, "gemini-2.5-flash");
        assert_eq!(config.api_key.as_deref(), Some("sk-test"));
        assert!(find_backups(&path).is_empty());
    }

    #[test]
    fn every_frontend_config_field_survives_a_save() {
        // Mirrors `AIConfig` in src/ai/types.ts. A key with no Rust twin is
        // silently dropped by serde (that is how `petSize` used to be lost),
        // so add new frontend fields here too.
        let frontend = serde_json::json!({
            "provider": "ollama",
            "apiKey": "sk-test",
            "model": "llama3",
            "baseUrl": "http://localhost:11434",
            "petSize": 128,
            "petMode": "wanderer",
            "activePetId": "tabby",
            "onboardingCompleted": true,
            "ollamaAutoDetected": true,
            "maxTokens": 1024
        });
        let config: AIConfig = serde_json::from_value(frontend.clone()).unwrap();
        let path = temp_config("frontend-fields");
        write_config_to(&path, &config).unwrap();
        let saved = serde_json::to_value(read_config_from(&path)).unwrap();
        assert_eq!(saved, frontend);
    }
}
