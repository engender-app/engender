#!/usr/bin/env bash
set -euo pipefail
umask 022

cd /home/journal
exec 9>.deploy.lock
flock -w 120 9
upload=$(mktemp -d .incoming-XXXXXXXX)
trap 'rm -rf "$upload"' EXIT
cat > "$upload/archive.tar.gz"
python3 - "$upload" <<'PY'
from pathlib import Path, PurePosixPath
import sys
import tarfile

directory = Path(sys.argv[1])
with tarfile.open(directory / 'archive.tar.gz') as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if not (member.isfile() or member.isdir()):
            raise ValueError('Deployment archive must contain only regular files and directories')
        if path.is_absolute() or '..' in path.parts or (path.parts and path.parts[0] != 'build'):
            raise ValueError('Deployment archive must contain only build/')
    archive.extractall(directory, filter='data')
PY

# A rerun after a failed HTTP check must not replace an immutable release.
if diff -qr "$upload/build" current >/dev/null 2>&1; then
  echo 'Release already active'
else
  node /usr/local/lib/engender/journal-release.mjs deploy "$upload/build"
fi
