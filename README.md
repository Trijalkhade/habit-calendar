# Habit Calendar

A local habit-accountability calendar app built with Tauri.

## Installation

### 🍎 macOS (Recommended — Homebrew)

The easiest way to install on macOS. Homebrew automatically handles downloading, installing, and bypassing Gatekeeper security warnings:

```bash
brew install --cask trijalkhade/tap/habit-calendar
```

**Or use the install script:**
```bash
curl -sSL https://raw.githubusercontent.com/Trijalkhade/habit-calendar/main/install.sh | bash
```

### 🪟 Windows

Open **PowerShell** and run:
```powershell
iwr -useb https://raw.githubusercontent.com/Trijalkhade/habit-calendar/main/install.ps1 | iex
```

### 🐧 Linux

Download the `.deb` or `.AppImage` from the [Releases](https://github.com/Trijalkhade/habit-calendar/releases) page.

---

### Manual Installation

If you prefer to download the installer manually from the [Releases](https://github.com/Trijalkhade/habit-calendar/releases) page, you may see a security warning because the app is not yet code-signed.

- **macOS:** Right-click the app → select **Open** → click **Open** again. Or run: `xattr -cr "/Applications/Habit Calendar.app"`
- **Windows:** Click **More info** → **Run anyway**.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
