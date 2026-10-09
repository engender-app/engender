#!/usr/bin/env bash
set -euo pipefail

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

bundle="engender-web-${RELEASE_TAG#v}.tar.gz"
gh release download "$RELEASE_TAG" --pattern "$bundle" --pattern SHA256SUMS --dir "$work"
(cd "$work" && sha256sum --check --strict --ignore-missing SHA256SUMS)
mkdir -p "$work/payload/build" "$work/payload/scripts"
tar -xzf "$work/$bundle" -C "$work/payload/build"
node --input-type=module - "$work/payload/build/release.json" "${RELEASE_TAG#v}" <<'NODE'
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
assert.equal(JSON.parse(readFileSync(process.argv[2], 'utf8')).version, process.argv[3]);
NODE
cp scripts/journal-release.mjs scripts/app-version.mjs "$work/payload/scripts/"

tar -czf - -C "$work/payload" . | ssh -T -F /dev/null \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$work/known_hosts" -o GlobalKnownHostsFile=/dev/null \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -i "$work/key" -p "$VPS_PORT" -l "$VPS_USER" "$VPS_HOST"

curl --fail --silent --show-error --retry 3 --max-time 30 \
  -H 'Cache-Control: no-cache' \
  https://app.engender.barankiewicz.dev/release.json -o "$work/live.json"
node --input-type=module - "$work/payload/build/release.json" "$work/live.json" <<'NODE'
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
assert.deepEqual(
  JSON.parse(readFileSync(process.argv[3], 'utf8')),
  JSON.parse(readFileSync(process.argv[2], 'utf8')),
  'Production release.json does not match the published release'
);
NODE
echo "Deployed $RELEASE_TAG to https://app.engender.barankiewicz.dev"
