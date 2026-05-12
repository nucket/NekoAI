// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Both env vars must be set before GTK/WebKit initialise inside lib::run().
    // Safety for set_var: no threads have been spawned yet at this point.
    #[cfg(target_os = "linux")]
    {
        // Under Wayland, GTK windows cannot be positioned programmatically and
        // the X11-based mouse_position crate always returns (0,0), leaving the
        // pet frozen at the centre of the screen. Force the X11 (XWayland)
        // backend so setPosition() and cursor tracking work as expected.
        // Only applied when an X display is available; pure-Wayland-only systems
        // (no XWayland) are left untouched so the app at least starts.
        // Users can override by setting GDK_BACKEND themselves.
        #[allow(unused_unsafe)]
        if std::env::var_os("GDK_BACKEND").is_none()
            && std::env::var_os("DISPLAY").is_some()
        {
            unsafe { std::env::set_var("GDK_BACKEND", "x11") };
        }

        // WebKitGTK's DMA-BUF renderer aborts with EGL_BAD_ALLOC on systems
        // without full GPU/EGL support (VMs, missing drivers, root sessions).
        // Disabling it makes WebKit fall back to software rendering instead.
        #[allow(unused_unsafe)]
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }

        // WebKitGTK's multi-threaded compositing layer calls into Xlib from
        // worker threads without XInitThreads(), triggering the
        // `xcb_xlib_threads_sequence_lost` assertion crash on Ubuntu/Fedora.
        // Disabling compositing mode forces single-threaded rendering and also
        // prevents ghost-frame artifacts on transparent windows.
        #[allow(unused_unsafe)]
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            unsafe { std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1") };
        }
    }

    nekoai_lib::run()
}
