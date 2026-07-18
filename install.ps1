# ============================================================================
#  Habit Calendar — Windows Installer (PowerShell)
#  Downloads, unblocks SmartScreen, installs silently, and launches the app.
# ============================================================================

$ErrorActionPreference = "Stop"

$repo = "Trijalkhade/habit-calendar"
$appName = "Habit Calendar"

# --- Helper Functions ---
function Write-Step { param($msg); Write-Host "`n▸ $msg" -ForegroundColor Cyan }
function Write-Ok { param($msg); Write-Host "  ✔ $msg" -ForegroundColor Green }
function Write-Warn { param($msg); Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg); Write-Host "`n  ✖ $msg" -ForegroundColor Red; exit 1 }

# --- Header ---
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor White
Write-Host "║      Habit Calendar — Installer          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor White
Write-Host ""

# --- Pre-flight Checks ---
Write-Step "Running pre-flight checks..."

try {
    $null = Invoke-WebRequest -Uri "https://github.com" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Ok "Internet connection OK"
} catch {
    Write-Fail "No internet connection. Please check your network and try again."
}

# Check PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Fail "PowerShell 5.0 or later is required. You have version $($PSVersionTable.PSVersion)."
}
Write-Ok "PowerShell $($PSVersionTable.PSVersion) detected"

# --- Fetch Latest Release ---
Write-Step "Fetching latest release from GitHub..."

try {
    $releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -UseBasicParsing
} catch {
    Write-Fail "Could not reach GitHub API. Check: https://github.com/$repo/releases"
}

$version = $releaseInfo.tag_name

# Try to find .exe first (NSIS), then .msi
$asset = $releaseInfo.assets | Where-Object { $_.name -match "setup\.exe$" } | Select-Object -First 1
if (-not $asset) {
    $asset = $releaseInfo.assets | Where-Object { $_.name -match "\.msi$" } | Select-Object -First 1
}
if (-not $asset) {
    $asset = $releaseInfo.assets | Where-Object { $_.name -match "\.exe$" } | Select-Object -First 1
}
if (-not $asset) {
    Write-Fail "Could not find an installer (.exe or .msi) in the latest release."
}

$downloadUrl = $asset.browser_download_url
$installerName = $asset.name
$installerPath = Join-Path $env:TEMP $installerName

Write-Ok "Found version: $version"
Write-Host "  $downloadUrl" -ForegroundColor DarkGray

# --- Download ---
Write-Step "Downloading $appName $version..."

try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    $ProgressPreference = 'Continue'
    Write-Ok "Download complete ($([math]::Round((Get-Item $installerPath).Length / 1MB, 1)) MB)"
} catch {
    Write-Fail "Download failed: $_"
}

# --- Unblock File (Bypass SmartScreen) ---
Write-Step "Removing SmartScreen restrictions..."
try {
    Unblock-File -Path $installerPath
    Write-Ok "SmartScreen block removed — no security warnings!"
} catch {
    Write-Warn "Could not unblock file (may require Administrator). Continuing anyway..."
}

# --- Install ---
Write-Step "Installing $appName..."

if ($installerName -match "\.msi$") {
    Write-Host "  Running MSI installer (silent mode)..." -ForegroundColor DarkGray
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /qb /norestart" -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        Write-Warn "Installer exited with code $($process.ExitCode)"
    } else {
        Write-Ok "MSI installation complete"
    }
} else {
    Write-Host "  Running NSIS installer (silent mode)..." -ForegroundColor DarkGray
    $process = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        Write-Warn "Installer exited with code $($process.ExitCode)"
    } else {
        Write-Ok "Installation complete"
    }
}

# --- Cleanup ---
Write-Step "Cleaning up..."
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
Write-Ok "Temporary files cleaned up"

# --- Browser Extension Setup ---
Write-Step "Setting up Browser Extension..."
$extDir = Join-Path $env:USERPROFILE "Documents\HabitCalendar-Extension"
if (-not (Test-Path $extDir)) {
    New-Item -ItemType Directory -Path $extDir | Out-Null
}

$extZip = Join-Path $env:TEMP "habit-repo.zip"
try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri "https://github.com/Trijalkhade/habit-calendar/archive/refs/heads/main.zip" -OutFile $extZip -UseBasicParsing
    
    $extractPath = Join-Path $env:TEMP "habit-calendar-extract"
    if (Test-Path $extractPath) { Remove-Item -Path $extractPath -Recurse -Force }
    Expand-Archive -Path $extZip -DestinationPath $extractPath -Force
    
    $sourceExt = Join-Path $extractPath "habit-calendar-main\extension"
    Copy-Item -Path "$sourceExt\*" -Destination $extDir -Recurse -Force
    
    Remove-Item -Path $extZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    $ProgressPreference = 'Continue'
    Write-Ok "Extension files saved to: $extDir"
} catch {
    Write-Warn "Could not automatically download the extension: $_"
}

# --- Launch ---
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor White
Write-Host "║   ✅  Installation Complete!              ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor White
Write-Host ""

# Try to find and launch the app
$possiblePaths = @(
    "$env:LOCALAPPDATA\Programs\$appName\$appName.exe",
    "$env:LOCALAPPDATA\$appName\$appName.exe",
    "$env:ProgramFiles\$appName\$appName.exe",
    "${env:ProgramFiles(x86)}\$appName\$appName.exe"
)

$exePath = $possiblePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($exePath) {
    Write-Host "  $appName $version installed successfully!" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  ACTION REQUIRED: Browser Extension" -ForegroundColor Yellow
    Write-Host "  To automatically track LeetCode and TakeUForward:" -ForegroundColor White
    Write-Host "  1. A browser window will open shortly." -ForegroundColor White
    Write-Host "  2. Turn on Developer Mode (left sidebar or top right)." -ForegroundColor White
    Write-Host "  3. Click Load Unpacked and select this folder:" -ForegroundColor White
    Write-Host "     👉 $extDir" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Launching app and browser..." -ForegroundColor DarkGray
    Write-Host ""
    
    # Try opening Edge or Chrome to extensions
    Start-Process "microsoft-edge:edge://extensions" -ErrorAction SilentlyContinue
    
    Start-Process -FilePath $exePath
} else {
    Write-Host "  $appName $version installed successfully!" -ForegroundColor White
    Write-Host "  You can now launch it from your Start menu." -ForegroundColor DarkGray
    Write-Host ""
}
