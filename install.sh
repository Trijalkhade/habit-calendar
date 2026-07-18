#!/bin/bash
set -e

# ============================================================================
#  Habit Calendar — macOS Installer
#  Downloads, installs, removes Gatekeeper quarantine, and launches the app.
# ============================================================================

REPO="Trijalkhade/habit-calendar"
APP_NAME="Habit Calendar"
APP_DIR="/Applications/$APP_NAME.app"
TMP_DMG="/tmp/HabitCalendar_install.dmg"

# --- Colors & Formatting ---
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

step() { echo -e "\n${CYAN}${BOLD}▸ $1${RESET}"; }
success() { echo -e "  ${GREEN}✔ $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
fail() { echo -e "\n  ${RED}✖ $1${RESET}"; exit 1; }

# --- Header ---
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║      ${CYAN}Habit Calendar — Installer${RESET}${BOLD}          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""

# --- Pre-flight Checks ---
step "Running pre-flight checks..."

# Check internet connectivity
if ! curl -s --head --max-time 5 https://github.com > /dev/null 2>&1; then
    fail "No internet connection. Please check your network and try again."
fi
success "Internet connection OK"

# Check if curl is available
if ! command -v curl &> /dev/null; then
    fail "'curl' is not installed. Please install it and try again."
fi
success "Required tools found"

# --- Detect Architecture ---
step "Detecting system architecture..."
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    success "Apple Silicon (arm64) detected"
elif [ "$ARCH" = "x86_64" ]; then
    success "Intel (x86_64) detected"
else
    warn "Unknown architecture: $ARCH — will try universal build"
fi

# --- Fetch Latest Release ---
step "Fetching latest release from GitHub..."
RELEASE_JSON=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")

DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep "browser_download_url.*\.dmg" | head -n 1 | cut -d '"' -f 4)
VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -n 1 | cut -d '"' -f 4)

if [ -z "$DOWNLOAD_URL" ]; then
    fail "Could not find a .dmg file in the latest release. Check: https://github.com/$REPO/releases"
fi
success "Found version: ${BOLD}$VERSION${RESET}"
echo -e "  ${DIM}$DOWNLOAD_URL${RESET}"

# --- Download ---
step "Downloading $APP_NAME $VERSION..."
curl -L --progress-bar -o "$TMP_DMG" "$DOWNLOAD_URL"
success "Download complete"

# --- Check for Existing Installation ---
if [ -d "$APP_DIR" ]; then
    step "Removing previous installation..."
    rm -rf "$APP_DIR"
    success "Old version removed"
fi

# --- Mount & Install ---
step "Installing to /Applications..."
MOUNT_OUTPUT=$(hdiutil attach "$TMP_DMG" -nobrowse 2>&1)
MOUNT_DIR=$(echo "$MOUNT_OUTPUT" | grep -o "/Volumes/.*" | head -n 1)

if [ -z "$MOUNT_DIR" ] || [ ! -d "$MOUNT_DIR" ]; then
    fail "Failed to mount the disk image. The download may be corrupted — please try again."
fi

cp -R "$MOUNT_DIR/$APP_NAME.app" "/Applications/"
success "Installed to /Applications"

# --- Remove Quarantine (Bypass Gatekeeper) ---
step "Removing macOS Gatekeeper quarantine..."
xattr -cr "$APP_DIR"
success "Quarantine attributes removed — no security warnings!"

# --- Cleanup ---
step "Cleaning up..."
hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
rm -f "$TMP_DMG"
success "Temporary files cleaned up"

# --- Done ---
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   ✅  Installation Complete!              ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}$APP_NAME $VERSION${RESET} has been installed to ${DIM}/Applications${RESET}"
echo -e "  Launching now..."
echo ""

open -a "$APP_NAME"
