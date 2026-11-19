#!/usr/bin/env bash
# Patch + re-sign the eufy splits. BYO splits (this repo ships none).
#
# Layout expected:
#   <in_dir>/split_config.arm64_v8a.apk  + the other 10 splits
# Produces re-signed splits in <out_dir>/ (arm64 one is byte-patched).
#
# Usage: tools/build.sh <in_dir_of_orig_splits> <out_dir> [keystore] [storepass]
set -euo pipefail
IN="${1:?in_dir}"; OUT="${2:?out_dir}"; KS="${3:-keystore/test.keystore}"; PW="${4:-eufytest}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BT="${ANDROID_BUILD_TOOLS:?set ANDROID_BUILD_TOOLS to an SDK build-tools dir (e.g. .../build-tools/36.0.0)}"

ENTRY="lib/arm64-v8a/libmega_media_sdk.so"
OFF="0x34a0a0"; FROM="fd7bb2a9fd030091"; TO="00008052c0035fd6"

mkdir -p "$OUT"
for f in "$IN"/*.apk; do
  b="$(basename "$f")"
  if [ "$b" = "split_config.arm64_v8a.apk" ]; then
    echo ">> patching $b"
    bun "$HERE/tools/patch_apk2.ts" "$f" "$OUT/$b" "$ENTRY" "$OFF" "$FROM" "$TO"
  else
    cp -f "$f" "$OUT/$b"
  fi
  echo ">> signing $b"
  "$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$PW" --key-pass "pass:$PW" "$OUT/$b"
done
echo "done -> $OUT"
