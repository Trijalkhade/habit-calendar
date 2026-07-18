# Tauri + Vanilla

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Installation

The easiest way to install Habit Calendar without dealing with security warnings (Gatekeeper on macOS or SmartScreen on Windows) is to use the automated install scripts. These scripts will automatically download the latest version, bypass the warnings, and open the app for you.

### macOS
Open your **Terminal** and run the following command:
```bash
curl -sSL https://raw.githubusercontent.com/Trijalkhade/habit-calendar/main/install.sh | bash
```

### Windows
Open **PowerShell** as Administrator and run the following command:
```powershell
iwr -useb https://raw.githubusercontent.com/Trijalkhade/habit-calendar/main/install.ps1 | iex
```

---

### Manual Installation & Troubleshooting

If you prefer to download the app manually from the [Releases](https://github.com/Trijalkhade/habit-calendar/releases) page, you may see security warnings because the app is currently unsigned.

*   **macOS:** Right-click the app in Finder and select **Open**, then click Open again. Alternatively, run `xattr -cr "/Applications/Habit Calendar.app"` in your terminal.
*   **Windows:** Click **More info**, then **Run anyway**.
