#!/usr/bin/env bash
set -euo pipefail
umask 022

cd /home/journal
exec 9>.deploy.lock
flock -w 120 9
upload=$(mktemp -d .incoming-XXXXXXXX)
trap 'rm -rf "$upload"' EXIT
cat > "$upload/archive.tar.gz"

# The digest the build job recorded arrives with the upload (the CI side runs
# `ssh ... sha256:<digest>`; a forced command sees it as SSH_ORIGINAL_COMMAND).
# The archive is the web bundle itself, so this is the same hash.
if [[ ! "${SSH_ORIGINAL_COMMAND:-}" =~ ^sha256:([0-9a-f]{64})$ ]]; then
  echo 'Upload must name the expected sha256 digest' >&2
  exit 1
fi
expected=${BASH_REMATCH[1]}
actual=$(sha256sum "$upload/archive.tar.gz" | cut -d' ' -f1)
if [[ "$actual" != "$expected" ]]; then
  echo "Archive digest $actual is not the expected digest $expected" >&2
  exit 1
fi

mkdir "$upload/build"
python3 - "$upload" <<'PY'
from pathlib import Path, PurePosixPath
import sys
import tarfile

directory = Path(sys.argv[1])
# What a web build holds at its top level besides plain files. Anything else,
# scripts/ for one, is not part of the bundle and is refused. A new build
# directory has to be added here when the receiver is reinstalled.
BUNDLE_DIRECTORIES = {'_app', 'fonts', 'icons', 'pdf-fonts', 'tesseract'}
with tarfile.open(directory / 'archive.tar.gz') as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if not (member.isfile() or member.isdir()):
            raise ValueError('Deployment archive must contain only regular files and directories')
        if path.is_absolute() or '..' in path.parts:
            raise ValueError('Deployment archive must stay inside the release directory')
        parts = [part for part in path.parts if part != '.']
        if len(parts) > 1 and parts[0] not in BUNDLE_DIRECTORIES:
            raise ValueError('Deployment archive must contain only the web bundle')
    archive.extractall(directory / 'build', filter='data')
PY

# A rerun after a failed HTTP check must not replace an immutable release.
if diff -qr "$upload/build" current >/dev/null 2>&1; then
  echo 'Release already active'
else
  node /usr/local/lib/engender/journal-release.mjs deploy "$upload/build"
fi
