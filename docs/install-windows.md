# Installing NekoAI on Windows

Two distribution formats are available: an **installer** and a **portable ZIP**.

---

## Installer (recommended)

Download `nekoai-setup-windows-x64.exe` from the [releases page](https://github.com/nucket/nekoai/releases).

- Installs for the current user (no admin rights required)
- Creates a Start Menu shortcut
- Supports launch-at-login via the Settings panel
- Data is stored in `%USERPROFILE%\.config\nekoai\` and `%USERPROFILE%\.local\share\nekoai\`

### WebView2

NekoAI uses the [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) runtime for rendering.

| Windows version    | Status                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Windows 11         | Pre-installed — no action needed                                                                                       |
| Windows 10 (21H2+) | Usually pre-installed via Windows Update                                                                               |
| Windows 10 (older) | Download the [WebView2 Evergreen installer](https://go.microsoft.com/fwlink/p/?LinkId=2124703) (~2 MB) and run it once |

---

## Portable ZIP

Download `nekoai-vX.Y.Z-portable-windows-x64.zip` from the [releases page](https://github.com/nucket/nekoai/releases).

Extract the ZIP anywhere — a USB drive, a folder on your desktop, etc. The archive contains:

```
nekoai.exe   ← the application
portable     ← marker file that activates portable mode
```

Run `nekoai.exe` directly. No installation required.

### Where portable mode stores data

Because the `portable` marker file is present, NekoAI writes all data to a `data/` folder
next to the executable instead of your home directory:

```
nekoai.exe
portable
data/
  config.toml    ← AI provider settings
  memory.db      ← conversation history and pet memory
```

To carry your pet's memory to another machine, copy the entire folder including `data/`.

### Limitations of portable mode

- **Launch at login is disabled.** The autostart option in Settings will show an error in portable mode. To run NekoAI at login, use the installer version instead.
- **WebView2 is still required.** The portable ZIP does not bundle WebView2. See the table above for your Windows version.

---

## Building the portable ZIP locally

From the repo root (requires Rust toolchain + Node.js):

```powershell
pwsh -File scripts/build-portable-windows.ps1
```

Output: `nekoai-vX.Y.Z-portable-windows-x64.zip` in the repo root.
