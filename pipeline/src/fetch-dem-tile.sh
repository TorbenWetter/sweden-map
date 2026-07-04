#!/usr/bin/env bash
# Fetch one Copernicus DEM tile ($1 = URL); sea tiles 404 and are skipped silently.
set -u
f="$DEM_DIR/$(basename "$1")"
[ -s "$f" ] && exit 0
if curl -sf -o "$f.tmp" "$1"; then
  mv "$f.tmp" "$f"
else
  rm -f "$f.tmp"
fi
exit 0
