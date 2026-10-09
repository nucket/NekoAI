use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Serialize, Clone, Debug)]
pub struct WindowInfo {
    pub title: String,
    pub process_name: String,
    pub rect: Rect,
}

// ─── Windows implementation ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod win_impl {
    use super::{Rect, WindowInfo};
    use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
    use windows::Win32::System::ProcessStatus::K32GetModuleBaseNameW;
    use windows::Win32::System::SystemInformation::GetTickCount64;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    };

    pub fn get_active_window() -> Option<WindowInfo> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            window_info_from_hwnd(hwnd)
        }
    }

    pub fn get_idle_millis() -> u64 {
        unsafe {
            let mut info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if GetLastInputInfo(&mut info).as_bool() {
                GetTickCount64().saturating_sub(info.dwTime as u64)
            } else {
                0
            }
        }
    }

    unsafe fn window_info_from_hwnd(hwnd: HWND) -> Option<WindowInfo> {
        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len as usize]).to_string();

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let process_name = get_process_name(pid).unwrap_or_default();

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);

        Some(WindowInfo {
            title,
            process_name,
            rect: Rect {
                x: rect.left,
                y: rect.top,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
            },
        })
    }

    fn get_process_name(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut name_buf = [0u16; 260];
            let len = K32GetModuleBaseNameW(handle, None, &mut name_buf);
            let _ = CloseHandle(handle);
            if len == 0 {
                return None;
            }
            Some(String::from_utf16_lossy(&name_buf[..len as usize]).to_string())
        }
    }
}

// ─── Linux implementation ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
mod linux_impl {
    use super::{Rect, WindowInfo};
    use std::error::Error;
    use std::sync::Mutex;
    use x11rb::rust_connection::RustConnection;

    // Returns true when an X11 display is reachable.
    // On a pure Wayland session (no XWayland) DISPLAY is unset.
    fn has_display() -> bool {
        std::env::var("DISPLAY").is_ok()
    }

    // ── Shared connection ─────────────────────────────────────────────────────
    //
    // The notification thread polls every 500 ms and useDesktopContext every
    // 2 s; opening a fresh X11 connection (and re-interning atoms) on every
    // call was the dominant idle cost on Linux. One connection and the atoms
    // we query are cached for the life of the process.

    struct X11 {
        conn: RustConnection,
        root: u32,
        net_active_window: u32,
        net_wm_name: u32,
        utf8_string: u32,
        net_wm_pid: u32,
    }

    static X11_CONN: Mutex<Option<X11>> = Mutex::new(None);

    impl X11 {
        fn connect() -> Result<Self, Box<dyn Error>> {
            use x11rb::connection::Connection as _;
            use x11rb::protocol::xproto::ConnectionExt as _;

            let (conn, screen_num) = RustConnection::connect(None)?;
            let root = conn.setup().roots[screen_num].root;
            let atom = |name: &[u8]| -> Result<u32, Box<dyn Error>> {
                Ok(conn.intern_atom(false, name)?.reply()?.atom)
            };
            let net_active_window = atom(b"_NET_ACTIVE_WINDOW")?;
            let net_wm_name = atom(b"_NET_WM_NAME")?;
            let utf8_string = atom(b"UTF8_STRING")?;
            let net_wm_pid = atom(b"_NET_WM_PID")?;
            Ok(Self {
                conn,
                root,
                net_active_window,
                net_wm_name,
                utf8_string,
                net_wm_pid,
            })
        }
    }

    /// Runs `f` on the shared connection, connecting on first use. An error
    /// drops the connection so the next call reconnects (X server restart,
    /// changed DISPLAY).
    fn with_x11<T>(f: impl FnOnce(&X11) -> Result<T, Box<dyn Error>>) -> Result<T, Box<dyn Error>> {
        let mut guard = X11_CONN.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            *guard = Some(X11::connect()?);
        }
        let result = match guard.as_ref() {
            Some(x11) => f(x11),
            None => return Err("X11 connection unavailable".into()),
        };
        if result.is_err() {
            *guard = None;
        }
        result
    }

    // ── Idle time via XScreenSaver extension ──────────────────────────────────
    //
    // Works on X11 and on XWayland (the common case on Fedora/GNOME).
    // Returns 0 on pure Wayland sessions (no X display available).

    pub fn get_idle_millis() -> u64 {
        if !has_display() {
            return 0;
        }
        idle_millis_x11().unwrap_or(0)
    }

    fn idle_millis_x11() -> Result<u64, Box<dyn Error>> {
        use x11rb::protocol::screensaver::ConnectionExt as _;

        with_x11(|x11| {
            let info = x11.conn.screensaver_query_info(x11.root)?.reply()?;
            Ok(info.ms_since_user_input as u64)
        })
    }

    // ── Active window via _NET_ACTIVE_WINDOW (EWMH / X11) ────────────────────
    //
    // Works on X11 and XWayland.
    // Returns None on pure Wayland — the compositor does not expose the focused
    // window to other clients (security policy; no reliable cross-process API).

    pub fn get_active_window() -> Option<WindowInfo> {
        if !has_display() {
            return None;
        }
        active_window_x11().unwrap_or(None)
    }

    fn active_window_x11() -> Result<Option<WindowInfo>, Box<dyn Error>> {
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

        with_x11(|x11| {
            let prop = x11
                .conn
                .get_property(
                    false,
                    x11.root,
                    x11.net_active_window,
                    AtomEnum::WINDOW,
                    0,
                    1,
                )?
                .reply()?;

            let win_id = match prop.value32().and_then(|mut it| it.next()) {
                Some(id) if id != 0 => id,
                _ => return Ok(None),
            };

            let title = window_title(x11, win_id).unwrap_or_default();
            let process_name = window_process_name(x11, win_id).unwrap_or_default();
            let rect = window_rect(&x11.conn, win_id).unwrap_or(Rect {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            });

            Ok(Some(WindowInfo {
                title,
                process_name,
                rect,
            }))
        })
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn window_title(x11: &X11, win: u32) -> Result<String, Box<dyn Error>> {
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

        let prop = x11
            .conn
            .get_property(false, win, x11.net_wm_name, x11.utf8_string, 0, 1024)?
            .reply()?;
        if !prop.value.is_empty() {
            return Ok(String::from_utf8_lossy(&prop.value).to_string());
        }
        // WM_NAME fallback for windows that don't set _NET_WM_NAME
        let prop = x11
            .conn
            .get_property(false, win, AtomEnum::WM_NAME, AtomEnum::STRING, 0, 1024)?
            .reply()?;
        Ok(String::from_utf8_lossy(&prop.value).to_string())
    }

    fn window_process_name(x11: &X11, win: u32) -> Result<String, Box<dyn Error>> {
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

        let prop = x11
            .conn
            .get_property(false, win, x11.net_wm_pid, AtomEnum::CARDINAL, 0, 1)?
            .reply()?;
        let pid = prop.value32().and_then(|mut it| it.next()).unwrap_or(0);
        if pid == 0 {
            return Ok(String::new());
        }
        Ok(std::fs::read_to_string(format!("/proc/{pid}/comm"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default())
    }

    fn window_rect(conn: &RustConnection, win: u32) -> Result<Rect, Box<dyn Error>> {
        use x11rb::protocol::xproto::ConnectionExt as _;

        let g = conn.get_geometry(win)?.reply()?;
        Ok(Rect {
            x: g.x as i32,
            y: g.y as i32,
            width: g.width as i32,
            height: g.height as i32,
        })
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

pub fn get_active_window() -> Option<WindowInfo> {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_active_window()
    }
    #[cfg(target_os = "linux")]
    {
        linux_impl::get_active_window()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

pub fn get_idle_millis() -> u64 {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_idle_millis()
    }
    #[cfg(target_os = "linux")]
    {
        linux_impl::get_idle_millis()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        0
    }
}

// ─── Session type ─────────────────────────────────────────────────────────────

/// True when the process is running under a Wayland session.
///
/// Under Wayland NekoAI runs as an XWayland client, and X11 `XQueryPointer`
/// only reports a live cursor position while the pointer is over one of our own
/// input surfaces. `cursor_tracker.rs` uses this to decide whether the evdev
/// fallback is needed.
#[cfg(target_os = "linux")]
pub fn is_wayland_session() -> bool {
    std::env::var("WAYLAND_DISPLAY")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
        || std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
}
