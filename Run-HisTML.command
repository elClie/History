#!/bin/bash
# HisTML macOS launcher — double-click in Finder
# First time only:  chmod +x Run-HisTML.command
set -euo pipefail
cd "$(dirname "$0")"

echo "========================================"
echo "  HisTML"
echo "========================================"
echo

have_cmd() { command -v "$1" >/dev/null 2>&1; }

ensure_node() {
  if have_cmd node && have_cmd npm; then
    echo "Node $(node -v) / npm $(npm -v)"
    return 0
  fi

  echo "Node.js not found — setting up environment..."
  echo

  if have_cmd brew; then
    echo "Installing Node.js via Homebrew (one-time)..."
    brew install node
    if [[ -x /opt/homebrew/bin/node ]]; then
      export PATH="/opt/homebrew/bin:$PATH"
    elif [[ -x /usr/local/bin/node ]]; then
      export PATH="/usr/local/bin:$PATH"
    fi
  else
    echo "Homebrew not found."
    echo
    echo "Install Node.js (LTS), then double-click this file again:"
    echo "  https://nodejs.org/"
    echo
    if have_cmd open; then
      open "https://nodejs.org/" || true
    fi
    echo "Press Enter to close..."
    read -r _
    exit 1
  fi

  if ! have_cmd node || ! have_cmd npm; then
    echo "Node still not on PATH. Open a new Terminal and run:"
    echo "  cd \"$(pwd)\" && ./Run-HisTML.command"
    echo "Press Enter to close..."
    read -r _
    exit 1
  fi
  echo "Node $(node -v) ready."
}

ensure_deps() {
  local electron_app="node_modules/electron/dist/Electron.app"
  local electron_bin="node_modules/electron/dist/electron"
  local win_leftover="node_modules/electron/dist/electron.exe"

  # Copied Windows node_modules? Wipe and reinstall for Mac.
  if [[ -f "$win_leftover" ]]; then
    echo "Windows Electron leftover detected — reinstalling for macOS..."
    rm -rf node_modules
  fi

  if [[ ! -d "$electron_app" && ! -x "$electron_bin" ]]; then
    echo "Installing project dependencies (Electron)..."
    echo "(First run may take a few minutes.)"
    npm install
  fi

  if [[ ! -d "$electron_app" && ! -x "$electron_bin" ]]; then
    echo "Electron binary missing after install."
    echo "Trying: npm install electron@33.2.0 --save-dev"
    npm install electron@33.2.0 --save-dev
  fi

  if [[ ! -d "$electron_app" && ! -x "$electron_bin" ]]; then
    echo "Failed to install Electron."
    echo "Press Enter to close..."
    read -r _
    exit 1
  fi
}

ensure_node
ensure_deps

echo
echo "Starting HisTML (high-perf GPU / no background throttle)..."
echo "If macOS blocks Electron:"
echo "  System Settings -> Privacy & Security -> Open Anyway"
echo

set +e
npm start
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo
  echo "App exited with code $status."
  echo "Press Enter to close..."
  read -r _
fi
exit "$status"
