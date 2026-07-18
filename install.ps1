$ErrorActionPreference = "Stop"

$repo = "Trijalkhade/habit-calendar"
$appName = "Habit Calendar"
$installPath = "$env:LOCALAPPDATA\Programs\$appName"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " Installing $appName for Windows " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

Write-Host "Fetching latest release info..."
$releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest"
$asset = $releaseInfo.assets | Where-Object { $_.name -match "\.msi$|\.exe$" } | Select-Object -First 1

if (-not $asset) {
    Write-Host "Error: Could not find an installer (.exe or .msi) in the latest release." -ForegroundColor Red
    exit 1
}

$downloadUrl = $asset.browser_download_url
$installerPath = "$env:TEMP\$($asset.name)"

Write-Host "Downloading from: $downloadUrl"
Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath

Write-Host "Unblocking the installer (bypassing SmartScreen)..."
Unblock-File -Path $installerPath

Write-Host "Running installer..."
if ($installerPath.EndsWith(".msi")) {
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /qb" -Wait -NoNewWindow
} else {
    Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -NoNewWindow
}

Write-Host "Cleaning up..."
Remove-Item -Path $installerPath

Write-Host "`n✅ Installation complete!" -ForegroundColor Green

$exePath = "$installPath\$appName.exe"
if (Test-Path $exePath) {
    Write-Host "Starting $appName..."
    Start-Process -FilePath $exePath
} else {
    Write-Host "You can now launch $appName from your Start menu."
}
