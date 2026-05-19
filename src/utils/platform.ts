// Platform detection for the chroma-key workaround.
//
// Background: WebKitGTK on Linux has an additive-compositing bug for ARGB
// transparent windows (see CHANGELOG v0.3.4). The workaround makes the
// pet/house windows technically opaque with a magenta fill and cuts the
// non-sprite pixels via GTK shape masks. That hack must NOT run on Windows
// (WebView2) or macOS (WKWebView) — both have working native transparency,
// and the magenta fill would just be visible as a solid pink box.
//
// We detect via navigator.userAgent because it's synchronous and available
// at module-init time (the @tauri-apps/plugin-os APIs are async). Tauri v2
// WebViews report the host OS in the UA on all three platforms.
export const IS_LINUX = /linux/i.test(navigator.userAgent) && !/android/i.test(navigator.userAgent)
