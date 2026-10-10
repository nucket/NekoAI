//! Where the provider API key lives.
//!
//! The key is kept in the OS credential store — Windows Credential Manager,
//! the macOS Keychain, or the Secret Service (GNOME Keyring / KWallet) on
//! Linux — instead of in config.toml, so it isn't sitting in a plain file
//! that backups, sync tools or other users can read. storage.rs decides when
//! to use it and falls back to the file when no store is available.

/// A single secret slot (the one API key NekoAI uses).
pub trait SecretStore: Sync {
    /// The stored value, `Ok(None)` when there is none, `Err` when the store
    /// itself is unavailable.
    fn get(&self) -> Result<Option<String>, String>;
    fn set(&self, value: &str) -> Result<(), String>;
    /// Removes the value; succeeds when there was nothing to remove.
    fn delete(&self) -> Result<(), String>;
}

/// Same identifier as `tauri.conf.json`, so the entry is recognisable in the
/// OS credential manager.
const SERVICE: &str = "com.nekoai.app";
const ACCOUNT: &str = "api-key";

struct OsKeychain;

impl OsKeychain {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
    }
}

impl SecretStore for OsKeychain {
    fn get(&self) -> Result<Option<String>, String> {
        match Self::entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn set(&self, value: &str) -> Result<(), String> {
        Self::entry()?
            .set_password(value)
            .map_err(|e| e.to_string())
    }

    fn delete(&self) -> Result<(), String> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

static OS_KEYCHAIN: OsKeychain = OsKeychain;

/// The credential store to use, or `None` in portable mode: there the key
/// stays in `data/config.toml` next to the executable, so the folder keeps
/// working when carried to another machine.
pub fn os_store() -> Option<&'static dyn SecretStore> {
    if crate::storage::is_portable() {
        None
    } else {
        Some(&OS_KEYCHAIN)
    }
}

/// In-memory store for tests; `unavailable` simulates a missing keyring.
#[cfg(test)]
pub struct MemoryStore {
    pub value: std::sync::Mutex<Option<String>>,
    pub unavailable: bool,
}

#[cfg(test)]
impl MemoryStore {
    pub fn new() -> Self {
        Self {
            value: std::sync::Mutex::new(None),
            unavailable: false,
        }
    }

    pub fn broken() -> Self {
        Self {
            value: std::sync::Mutex::new(None),
            unavailable: true,
        }
    }

    pub fn current(&self) -> Option<String> {
        self.value.lock().unwrap().clone()
    }
}

#[cfg(test)]
impl SecretStore for MemoryStore {
    fn get(&self) -> Result<Option<String>, String> {
        if self.unavailable {
            return Err("no keyring".into());
        }
        Ok(self.current())
    }

    fn set(&self, value: &str) -> Result<(), String> {
        if self.unavailable {
            return Err("no keyring".into());
        }
        *self.value.lock().unwrap() = Some(value.to_string());
        Ok(())
    }

    fn delete(&self) -> Result<(), String> {
        if self.unavailable {
            return Err("no keyring".into());
        }
        *self.value.lock().unwrap() = None;
        Ok(())
    }
}
