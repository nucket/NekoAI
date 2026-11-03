//! In-app updates through tauri-plugin-updater.
//!
//! The release workflow publishes `latest.json` plus a minisign signature for
//! each installer; the plugin checks it against the public key in
//! tauri.conf.json, so only builds signed with the project's updater key are
//! ever installed. This is independent of OS code signing (Authenticode /
//! notarization).
//!
//! The WebView never talks to the plugin directly (no updater permissions in
//! the capabilities): it asks `check_for_update`, shows the pet's notice, and
//! calls `install_update` when the user agrees.

use serde::Serialize;
use std::sync::Mutex;
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update found by the last check, kept until the user installs it.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    /// False when this copy can't replace itself: portable mode, or a Linux
    /// install from .deb / .rpm (only the AppImage updates in place). The UI
    /// links to the download page instead.
    pub can_install: bool,
}

pub fn can_install_in_place(portable: bool, linux_appimage: bool) -> bool {
    if portable {
        return false;
    }
    if cfg!(target_os = "linux") {
        return linux_appimage;
    }
    true
}

fn this_copy_can_install() -> bool {
    can_install_in_place(
        crate::storage::is_portable(),
        std::env::var_os("APPIMAGE").is_some(),
    )
}

#[tauri::command]
pub async fn check_for_update(
    app: tauri::AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        can_install: this_copy_can_install(),
    });
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
}

/// Downloads, verifies and installs the pending update, then restarts. On
/// Windows the installer closes the app itself.
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
    if !this_copy_can_install() {
        return Err("this copy of NekoAI can't update itself".into());
    }
    let update = pending
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("no update to install")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::can_install_in_place;

    #[test]
    fn portable_copies_never_update_in_place() {
        assert!(!can_install_in_place(true, true));
        assert!(!can_install_in_place(true, false));
    }

    #[test]
    fn linux_only_updates_the_appimage() {
        let installed = can_install_in_place(false, false);
        if cfg!(target_os = "linux") {
            assert!(!installed);
            assert!(can_install_in_place(false, true));
        } else {
            assert!(installed);
        }
    }
}
