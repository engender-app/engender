#!/usr/bin/env bash
set -euo pipefail

# Usage: deploy-web.sh <web bundle .tar.gz> <expected sha256>
# The expected digest is the one the package job computed over the bundle it
# built (needs.package.outputs.web_sha256). It is never read from a file that
# travels with the bundle, so replacing a release asset and its SHA256SUMS
# together gets nowhere.
bundle=${1:?usage: deploy-web.sh <bundle> <sha256>}
expected=${2:?usage: deploy-web.sh <bundle> <sha256>}
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo "Expected digest is not a SHA-256: $expected" >&2; exit 1; }
actual=$(sha256sum "$bundle" | cut -d' ' -f1)
if [[ "$actual" != "$expected" ]]; then
  echo "Bundle $actual does not match the digest the build job recorded ($expected)" >&2
  exit 1
fi

for name in RELEASE_TAG VPS_HOST VPS_PORT VPS_USER VPS_DEPLOY_KEY VPS_KNOWN_HOSTS; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing release configuration: $name" >&2
    exit 1
  fi
done
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$VPS_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.:-]*$ ]]
[[ "$VPS_PORT" =~ ^[0-9]+$ ]]
[[ "$VPS_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
install -m 600 /dev/null "$work/key"
printf '%s\n' "$VPS_DEPLOY_KEY" > "$work/key"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$work/known_hosts"
unset VPS_DEPLOY_KEY VPS_KNOWN_HOSTS

mkdir -p "$work/payload/build"
tar -xzf "$bundle" -C "$work/payload/build"
node --input-type=module - "$work/payload/build/release.json" "${RELEASE_TAG#v}" <<'NODE'
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
assert.equal(JSON.parse(readFileSync(process.argv[2], 'utf8')).version, process.argv[3]);
NODE
# The bundle itself goes up, so the receiver hashes the same bytes the build
# job did. The digest rides in the ssh command, which a forced command sees as
# SSH_ORIGINAL_COMMAND.
ssh -T -F /dev/null \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$work/known_hosts" -o GlobalKnownHostsFile=/dev/null \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -i "$work/key" -p "$VPS_PORT" -l "$VPS_USER" "$VPS_HOST" "sha256:$expected" < "$bundle"

curl --fail --silent --show-error --retry 3 --max-time 30 \
  -H 'Cache-Control: no-cache' \
  https://journal.engender.app/release.json -o "$work/live.json"
node --input-type=module - "$work/payload/build/release.json" "$work/live.json" <<'NODE'
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
assert.deepEqual(
  JSON.parse(readFileSync(process.argv[3], 'utf8')),
  JSON.parse(readFileSync(process.argv[2], 'utf8')),
  'Production release.json does not match the published release'
);
NODE

# Read back the files that decide what a browser runs, not only the metadata.
for file in index.html service-worker.js _app/version.json; do
  curl --fail --silent --show-error --retry 3 --max-time 30 \
    -H 'Cache-Control: no-cache' \
    "https://journal.engender.app/$file" -o "$work/live-file"
  if ! cmp -s "$work/live-file" "$work/payload/build/$file"; then
    echo "Production $file does not match the published release" >&2
    exit 1
  fi
done
echo "Deployed $RELEASE_TAG to https://journal.engender.app"
