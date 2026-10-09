#!/usr/bin/env bash
set -euo pipefail
umask 022

cd /home/journal
exec 9>.deploy.lock
flock -w 120 9
upload=$(mktemp -d .incoming-XXXXXXXX)
trap 'rm -rf "$upload"' EXIT
tar -xzf - --no-same-owner -C "$upload"

# A rerun after a failed HTTP check must not replace an immutable release.
if diff -qr "$upload/build" current >/dev/null 2>&1; then
  echo 'Release already active'
else
  node "$upload/scripts/journal-release.mjs" deploy "$upload/build"
fi
