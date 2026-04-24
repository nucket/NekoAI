# Installing NekoAI on Linux

Three distribution formats are available:

| Format       | Best for                              |
| ------------ | ------------------------------------- |
| **AppImage** | Any distro — no installation required |
| **DEB**      | Ubuntu, Debian, Linux Mint, Pop!\_OS  |
| **RPM**      | Fedora, RHEL, openSUSE                |

---

## Runtime dependencies

NekoAI requires **WebKitGTK 4.1** and **libayatana-appindicator** at runtime.
On most desktop installations these are already present.

**Ubuntu / Debian / Mint (22.04+ / Bookworm+):**

```bash
sudo apt install libwebkit2gtk-4.1-0 libayatana-appindicator3-1
```

> Ubuntu 20.04 ships WebKitGTK 4.0, which is not supported. Minimum: Ubuntu 22.04 LTS.

**Fedora / RHEL / Rocky / Alma:**

```bash
sudo dnf install webkit2gtk4.1 libayatana-appindicator-gtk3
```

**Arch Linux / Manjaro:**

```bash
sudo pacman -S webkit2gtk-4.1 libayatana-appindicator
```

**openSUSE Tumbleweed:**

```bash
sudo zypper install libwebkit2gtk3-soup2-devel libayatana-appindicator3
```

---

## Installing the AppImage (recommended — any distro)

The AppImage runs without installation on any Linux distribution:

```bash
chmod +x nekoai-vX.Y.Z-linux-x64.AppImage
./nekoai-vX.Y.Z-linux-x64.AppImage
```

For automatic desktop integration (launcher entry, app icon):

```bash
# Fedora
sudo dnf install appimagelauncher

# Ubuntu / Debian
sudo apt install appimagelauncher

# Arch
yay -S appimagelauncher
```

Then double-click the `.AppImage` — AppImageLauncher will offer to integrate it.

---

## Installing the DEB (Ubuntu / Debian)

```bash
sudo apt install ./nekoai-vX.Y.Z-linux-x64.deb
```

Launches as `nekoai` from the terminal or application launcher.

To remove:

```bash
sudo apt remove nekoai
```

---

## Installing the RPM (Fedora / RHEL)

```bash
sudo dnf install ./nekoai-vX.Y.Z-linux-x64.rpm
```

Launches as `nekoai` from the terminal or application launcher.

To remove:

```bash
sudo dnf remove nekoai
```

---

## System tray (GNOME)

GNOME Shell (used by Fedora, Ubuntu GNOME, and others) does not display a
system tray by default. Install the **AppIndicator and KStatusNotifierItem
Support** extension:

```bash
# If gnome-shell-extension-manager is available
gnome-extensions install appindicatorsupport@rgcjonas.gmail.com
```

Or install it from the browser at
[extensions.gnome.org/extension/615](https://extensions.gnome.org/extension/615/appindicator-support/).

Without this extension NekoAI still works — the pet, chat, and settings are
fully functional — but the tray icon will not be visible.

KDE Plasma and other desktop environments support app indicators natively;
no extra steps required.

---

## X11 vs Wayland

NekoAI's idle detection and active window features use the X11 protocol.

| Session type               | Idle detection      | Active window detection |
| -------------------------- | ------------------- | ----------------------- |
| X11                        | Full                | Full                    |
| Wayland + XWayland         | Full (via XWayland) | Full (via XWayland)     |
| Pure Wayland (no XWayland) | Not available       | Not available           |

**Fedora 40+ with GNOME** and **Ubuntu 22.04+ with GNOME** both run Wayland
with XWayland enabled by default, so all features work normally out of the box.

On a pure Wayland session (XWayland explicitly disabled), the mood engine
falls back to time-of-day only and desktop context awareness is disabled.
The pet, AI chat, and all other features are unaffected.

---

## Building from source

### Build dependencies

**Ubuntu / Debian (22.04+ / Bookworm+):**

```bash
sudo apt install \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  libssl-dev \
  libxdo-dev \
  libgtk-3-dev \
  build-essential \
  curl \
  wget \
  file
```

**Fedora / RHEL:**

```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  libayatana-appindicator-gtk3-devel \
  openssl-devel \
  libxdo-devel \
  gcc \
  curl \
  wget \
  file
```

**Arch Linux / Manjaro:**

```bash
sudo pacman -S webkit2gtk-4.1 libayatana-appindicator openssl base-devel
```

### Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Node.js (18+)

**Ubuntu / Debian:**

```bash
sudo apt install nodejs npm
```

**Fedora:**

```bash
sudo dnf install nodejs npm
```

**Arch:**

```bash
sudo pacman -S nodejs npm
```

### Clone and build

```bash
git clone https://github.com/nucket/nekoai.git
cd nekoai
npm install
npm run tauri build
```

Artifacts are placed in `src-tauri/target/release/bundle/`.

---

## Data paths

NekoAI follows the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/):

| File                 | Default path                      |
| -------------------- | --------------------------------- |
| Config               | `~/.config/nekoai/config.toml`    |
| Conversation history | `~/.local/share/nekoai/memory.db` |

These paths respect `$XDG_CONFIG_HOME` and `$XDG_DATA_HOME` if set.
