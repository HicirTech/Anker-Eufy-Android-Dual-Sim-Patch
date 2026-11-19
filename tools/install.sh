#!/usr/bin/env bash
# Install the re-signed splits, keeping login (same key as a prior install).
# First-ever install with the custom key needs an uninstall first (wipes data) — do:
#   adb uninstall com.oceanwing.battery.cam   # then run this without -r the first time
#
# Usage: tools/install.sh <dir_of_resigned_splits>
set -euo pipefail
DIR="${1:?dir of re-signed splits}"
PKG=com.oceanwing.battery.cam
export MSYS_NO_PATHCONV=1   # Git-Bash: keep /data/... paths intact

adb install-multiple -r "$DIR"/*.apk
adb shell am force-stop "$PKG"       # force reload of the patched .so
echo ">> installed; launch the app and verify with tools/attrib_cap.sh"
