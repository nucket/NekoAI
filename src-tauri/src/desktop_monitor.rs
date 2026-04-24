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
    use std::ptr::null_mut;
    use windows::Win32::Foundation::{CloseHandle, BOOL, HMODULE, HWND, LPARAM, RECT};
    use windows::Win32::System::ProcessStatus::K32GetModuleBaseNameW;
    use windows::Win32::System::SystemInformation::GetTickCount64;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextW,
        GetWindowThreadProcessId, IsWindowVisible,
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

    pub fn get_all_windows() -> Vec<WindowInfo> {
        let mut result: Vec<WindowInfo> = Vec::new();
        unsafe {
            let _ = EnumWindows(
                Some(enum_callback),
                LPARAM(&mut result as *mut Vec<WindowInfo> as isize),
            );
        }
        result
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

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);
        if let Some(info) = window_info_from_hwnd(hwnd) {
            if !info.title.is_empty() {
                windows.push(info);
            }
        }
        BOOL(1) // continue enumeration
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
            let len = K32GetModuleBaseNameW(handle, HMODULE(null_mut()), &mut name_buf);
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

    // Returns true when an X11 display is reachable.
    // On a pure Wayland session (no XWayland) DISPLAY is unset.
    fn has_display() -> bool {
        std::env::var("DISPLAY").is_ok()
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
        use x11rb::connection::Connection as _;
        use x11rb::protocol::screensaver::ConnectionExt as _;
        use x11rb::rust_connection::RustConnection;

        let (conn, screen_num) = RustConnection::connect(None)?;
        let root = conn.setup().roots[screen_num].root;
        let info = conn.screensaver_query_info(root)?.reply()?;
        Ok(info.ms_since_user_input as u64)
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
        use x11rb::connection::Connection as _;
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};
        use x11rb::rust_connection::RustConnection;

        let (conn, screen_num) = RustConnection::connect(None)?;
        let root = conn.setup().roots[screen_num].root;

        let net_active_window = conn.intern_atom(false, b"_NET_ACTIVE_WINDOW")?.reply()?.atom;
        let prop = conn
            .get_property(false, root, net_active_window, AtomEnum::WINDOW, 0, 1)?
            .reply()?;

        let win_id = match prop.value32().and_then(|mut it| it.next()) {
            Some(id) if id != 0 => id,
            _ => return Ok(None),
        };

        let title = window_title(&conn, win_id).unwrap_or_default();
        let process_name = window_process_name(&conn, win_id).unwrap_or_default();
        let rect = window_rect(&conn, win_id)
            .unwrap_or(Rect { x: 0, y: 0, width: 0, height: 0 });

        Ok(Some(WindowInfo { title, process_name, rect }))
    }

    // ── All visible windows via _NET_CLIENT_LIST (EWMH / X11) ────────────────

    pub fn get_all_windows() -> Vec<WindowInfo> {
        if !has_display() {
            return vec![];
        }
        all_windows_x11().unwrap_or_default()
    }

    fn all_windows_x11() -> Result<Vec<WindowInfo>, Box<dyn Error>> {
        use x11rb::connection::Connection as _;
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};
        use x11rb::rust_connection::RustConnection;

        let (conn, screen_num) = RustConnection::connect(None)?;
        let root = conn.setup().roots[screen_num].root;

        let net_client_list = conn.intern_atom(false, b"_NET_CLIENT_LIST")?.reply()?.atom;
        let prop = conn
            .get_property(false, root, net_client_list, AtomEnum::WINDOW, 0, 2048)?
            .reply()?;

        let mut windows = Vec::new();
        for win_id in prop.value32().into_iter().flatten() {
            if win_id == 0 {
                continue;
            }
            let title = window_title(&conn, win_id).unwrap_or_default();
            if title.is_empty() {
                continue;
            }
            let process_name = window_process_name(&conn, win_id).unwrap_or_default();
            let rect = window_rect(&conn, win_id)
                .unwrap_or(Rect { x: 0, y: 0, width: 0, height: 0 });
            windows.push(WindowInfo { title, process_name, rect });
        }
        Ok(windows)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn window_title(
        conn: &x11rb::rust_connection::RustConnection,
        win: u32,
    ) -> Result<String, Box<dyn Error>> {
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

        let net_wm_name = conn.intern_atom(false, b"_NET_WM_NAME")?.reply()?.atom;
        let utf8 = conn.intern_atom(false, b"UTF8_STRING")?.reply()?.atom;

        let prop = conn.get_property(false, win, net_wm_name, utf8, 0, 1024)?.reply()?;
        if !prop.value.is_empty() {
            return Ok(String::from_utf8_lossy(&prop.value).to_string());
        }
        // WM_NAME fallback for windows that don't set _NET_WM_NAME
        let prop = conn
            .get_property(false, win, AtomEnum::WM_NAME, AtomEnum::STRING, 0, 1024)?
            .reply()?;
        Ok(String::from_utf8_lossy(&prop.value).to_string())
    }

    fn window_process_name(
        conn: &x11rb::rust_connection::RustConnection,
        win: u32,
    ) -> Result<String, Box<dyn Error>> {
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

        let net_wm_pid = conn.intern_atom(false, b"_NET_WM_PID")?.reply()?.atom;
        let prop = conn
            .get_property(false, win, net_wm_pid, AtomEnum::CARDINAL, 0, 1)?
            .reply()?;
        let pid = prop.value32().and_then(|mut it| it.next()).unwrap_or(0);
        if pid == 0 {
            return Ok(String::new());
        }
        Ok(std::fs::read_to_string(format!("/proc/{pid}/comm"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default())
    }

    fn window_rect(
        conn: &x11rb::rust_connection::RustConnection,
        win: u32,
    ) -> Result<Rect, Box<dyn Error>> {
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

pub fn get_all_windows() -> Vec<WindowInfo> {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_all_windows()
    }
    #[cfg(target_os = "linux")]
    {
        linux_impl::get_all_windows()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        vec![]
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
