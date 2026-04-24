# Installing NekoAI on Linux (Fedora)

Two distribution formats are available: an **AppImage** (runs on any distro) and an **RPM** (native Fedora package).

---

## System requirements

### Runtime dependencies

NekoAI uses WebKitGTK for rendering and libayatana-appindicator for the system tray.

**Fedora 40+:**

```bash
sudo dnf install webkit2gtk4.1 libayatana-appindicator-gtk3
```

On most Fedora installations these are already present. If NekoAI fails to launch, install them manually.

### GNOME system tray

Fedora with GNOME Shell does not display a system tray by default. Install the **AppIndicator and KStatusNotifierItem Support** extension to enable it:

```bash
# Via GNOME Extensions CLI
gnome-extensions install appindicatorsupport@rgcjonas.gmail.com

# Or install from https://extensions.gnome.org/extension/615/appindicator-support/
```

Without this extension NekoAI still works, but the tray icon will not be visible.

---

## Installing the AppImage

The AppImage runs without installation on any Linux distro (Fedora, Ubuntu, Arch, etc.):

```bash
# Download from releases page
chmod +x nekoai-vX.Y.Z-linux-x64.AppImage
./nekoai-vX.Y.Z-linux-x64.AppImage
```

To integrate it as a desktop app (launcher entry, file associations):

```bash
# Install AppImageLauncher for automatic integration
sudo dnf install appimagelauncher
# Then double-click the .AppImage — it will offer to integrate it
```

---

## Installing the RPM

```bash
sudo dnf install nekoai-vX.Y.Z-linux-x64.rpm
```

Launches as `nekoai` from the terminal or from the application launcher.

---

## Building from source on Fedora

### Build dependencies

```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  libayatana-appindicator-gtk3-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libxdo-devel
```

### Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Node.js

```bash
sudo dnf install nodejs npm
```

### Build

```bash
git clone https://github.com/nucket/nekoai.git
cd nekoai
npm install
npm run tauri build
```

Artifacts are placed in `src-tauri/target/release/bundle/`.

---

## X11 vs Wayland

NekoAI's window detection and idle time features use the X11 protocol.

| Session type               | Idle detection      | Active window detection |
| -------------------------- | ------------------- | ----------------------- |
| X11                        | Full                | Full                    |
| Wayland + XWayland         | Full (via XWayland) | Full (via XWayland)     |
| Pure Wayland (no XWayland) | Not available       | Not available           |

Fedora's default GNOME session runs Wayland with XWayland enabled, so all features
work normally. On a pure Wayland session (XWayland explicitly disabled), the mood engine
uses time-of-day only (no idle penalty), and desktop context awareness is disabled.

The pet, AI chat, settings, and all other features work on both X11 and Wayland.

---

## Data paths

| File                 | Path                              |
| -------------------- | --------------------------------- |
| Config               | `~/.config/nekoai/config.toml`    |
| Conversation history | `~/.local/share/nekoai/memory.db` |

These follow the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/).
