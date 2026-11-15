#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_MODE="${1:-release}"
case "$BUILD_MODE" in release|debug) ;; *) echo 'Uso: bash native/scripts/build.sh [release|debug]' >&2; exit 2 ;; esac
# Override autocrlf only for package-manager subprocesses; do not alter user Git config.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false
swift package --package-path "$NATIVE_DIR" --cache-path "$NATIVE_DIR/.cache" resolve
TERMINFO="$NATIVE_DIR/.build/checkouts/SwiftTerm/swifterm-terminfo"
if test -f "$TERMINFO" && LC_ALL=C /usr/bin/grep -q $'\r' "$TERMINFO"; then
    chmod u+w "$TERMINFO"
    /usr/bin/perl -pi -e 's/\r$//' "$TERMINFO"
fi
swift build --package-path "$NATIVE_DIR" --cache-path "$NATIVE_DIR/.cache" -c "$BUILD_MODE" --product ORI
BIN_DIR="$(swift build --package-path "$NATIVE_DIR" -c "$BUILD_MODE" --show-bin-path)"
APP_DIR="$NATIVE_DIR/build/ORI.app"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
# Rename the new executable so a running instance retains its original inode.
cp "$BIN_DIR/ORI" "$APP_DIR/Contents/MacOS/ORI.next"
mv -f "$APP_DIR/Contents/MacOS/ORI.next" "$APP_DIR/Contents/MacOS/ORI"
cp "$NATIVE_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$NATIVE_DIR/icon.icns" "$APP_DIR/Contents/Resources/icon.icns"
# GRDB's privacy manifest is carried by its resource bundle.
for resource in "$BIN_DIR"/*.bundle; do
    if test -d "$resource"; then cp -R "$resource" "$APP_DIR/Contents/Resources/"; fi
done
codesign --force --sign "${ORI_SIGN_IDENTITY:--}" --options runtime "$APP_DIR"
echo "Aplicación: $APP_DIR"
