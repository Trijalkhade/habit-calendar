#!/bin/bash
set -e

REPO="Trijalkhade/habit-calendar"
APP_NAME="Habit Calendar"
APP_DIR="/Applications/$APP_NAME.app"

echo "======================================"
echo " Installing $APP_NAME for macOS "
echo "======================================"

echo "Fetching latest release info..."
DOWNLOAD_URL=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep "browser_download_url.*\.dmg" | cut -d '"' -f 4 | head -n 1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "Error: Could not find a .dmg file in the latest release."
    echo "Please check the GitHub releases page manually."
    exit 1
fi

echo "Downloading from: $DOWNLOAD_URL"
curl -L -# -o "/tmp/HabitCalendar.dmg" "$DOWNLOAD_URL"

echo "Mounting disk image..."
# Use grep to safely extract just the mount point path
MOUNT_DIR=$(hdiutil attach "/tmp/HabitCalendar.dmg" -nobrowse | grep -o "/Volumes/.*")

if [ -d "$APP_DIR" ]; then
    echo "Removing older version..."
    rm -rf "$APP_DIR"
fi

echo "Installing to Applications folder..."
cp -R "$MOUNT_DIR/$APP_NAME.app" "/Applications/"

echo "Removing quarantine attributes (bypassing Gatekeeper)..."
xattr -cr "$APP_DIR"

echo "Cleaning up..."
hdiutil detach "$MOUNT_DIR" -quiet
rm "/tmp/HabitCalendar.dmg"

echo ""
echo "✅ Installation complete!"
echo "Starting $APP_NAME..."
open -a "$APP_NAME"
