import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function replay({ checksum = true, upload = true, live = '1.2.3', configured = true, swap = false, liveIndex = 'release document', digestArg = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'engender-web-deploy-'));
  roots.push(root);
  for (const dir of ['bin', 'fixture', 'build', 'received', 'live']) mkdirSync(join(root, dir));
  mkdirSync(join(root, 'build/_app'));
  const metadata = { version: '1.2.3', buildId: 'release-1.2.3', schemaMax: 3 };
  writeFileSync(join(root, 'build/release.json'), JSON.stringify(metadata));
  writeFileSync(join(root, 'build/index.html'), 'release document');
  writeFileSync(join(root, 'build/service-worker.js'), '// release worker');
  writeFileSync(join(root, 'build/_app/version.json'), '{"version":"release-1.2.3"}');
  writeFileSync(join(root, 'live.json'), JSON.stringify({ ...metadata, version: live }));
  const bundle = join(root, 'fixture/engender-web-1.2.3.tar.gz');
  execFileSync('tar', ['-czf', bundle, '-C', join(root, 'build'), '.']);
  const digest = createHash('sha256').update(readFileSync(bundle)).digest('hex');
  if (swap) {
    // Someone who can edit the release replaces the bundle and rewrites SHA256SUMS to match.
    writeFileSync(join(root, 'build/index.html'), 'attacker document');
    execFileSync('tar', ['-czf', bundle, '-C', join(root, 'build'), '.']);
  }
  const published = createHash('sha256').update(readFileSync(bundle)).digest('hex');
  writeFileSync(join(root, 'fixture/SHA256SUMS'), `${checksum ? published : '0'.repeat(64)}  engender-web-1.2.3.tar.gz\n`);
  writeFileSync(join(root, 'live/index.html'), liveIndex);
  const commands = {
    gh: 'touch "$TEST_ROOT/gh-called"\nwhile [[ "$1" != --dir ]]; do shift; done\ncp "$TEST_ROOT"/fixture/* "$2/"',
    ssh: `printf '%s\\n' "$@" > "$TEST_ROOT/ssh-args"\nwhile [[ "$1" != -i ]]; do shift; done\nprintf '%s' "$2" > "$TEST_ROOT/key-path"\nstat -c %a "$2" > "$TEST_ROOT/key-mode"\n${upload ? 'tar -xzf - -C "$TEST_ROOT/received"' : 'exit 42'}`,
    curl: 'touch "$TEST_ROOT/http-called"\nfor a in "$@"; do [[ "$a" == https://* ]] && url="$a"; done\nwhile [[ "$1" != -o ]]; do shift; done\ncase "$url" in\n  */release.json) cp "$TEST_ROOT/live.json" "$2";;\n  */index.html) cp "$TEST_ROOT/live/index.html" "$2";;\n  *) cp "$TEST_ROOT/build${url#https://app.engender.barankiewicz.dev}" "$2";;\nesac'
  };
  for (const [name, body] of Object.entries(commands)) {
    const file = join(root, 'bin', name);
    writeFileSync(file, `#!/bin/bash\nset -eu\n${body}\n`);
    chmodSync(file, 0o755);
  }
  const expected = digestArg || digest;
  const result = spawnSync('bash', ['scripts/deploy-web.sh', bundle, expected], {
    encoding: 'utf8',
    env: {
      ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, TEST_ROOT: root,
      RELEASE_TAG: 'v1.2.3', VPS_HOST: 'example.test', VPS_PORT: '22', VPS_USER: 'journal',
      VPS_DEPLOY_KEY: configured ? 'synthetic-private-key' : '', VPS_KNOWN_HOSTS: 'synthetic-host-key'
    }
  });
  return { root, result, digest };
}

describe('web deployment transport', () => {
  it('sends the verified published bundle, pins the SSH host, verifies production and removes the private key', () => {
    const { root, result, digest } = replay();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(root, 'received/index.html'), 'utf8')).toBe('release document');
    expect(readFileSync(join(root, 'ssh-args'), 'utf8')).toContain(`sha256:${digest}`);
    expect(existsSync(join(root, 'gh-called'))).toBe(false);
    expect(readFileSync(join(root, 'ssh-args'), 'utf8')).toContain('StrictHostKeyChecking=yes');
    expect(readFileSync(join(root, 'key-mode'), 'utf8').trim()).toBe('600');
    expect(existsSync(readFileSync(join(root, 'key-path'), 'utf8'))).toBe(false);
    expect(result.stdout + result.stderr).not.toContain('synthetic-private-key');
    expect(result.stdout).toContain('Deployed v1.2.3');
  });

  it('refuses a bundle whose digest is not the one the build job reported, even beside a matching SHA256SUMS', () => {
    const { root, result } = replay({ swap: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not match the digest');
    expect(existsSync(join(root, 'ssh-args'))).toBe(false);
  });

  it('refuses a malformed expected digest', () => {
    const { root, result } = replay({ digestArg: 'not-a-digest' });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'ssh-args'))).toBe(false);
  });

  it('fails on upload errors without reporting success or checking an unchanged origin', () => {
    const { root, result } = replay({ upload: false });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'http-called'))).toBe(false);
    expect(existsSync(readFileSync(join(root, 'key-path'), 'utf8'))).toBe(false);
    expect(result.stdout).not.toContain('Deployed');
  });

  it('fails when production serves a different release', () => {
    const { result } = replay({ live: '1.2.2' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Production release.json does not match');
  });

  it('reads the deployed files back and fails when one differs from the bundle', () => {
    const { result } = replay({ liveIndex: 'something else' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not match the published release');
  });

  it('fails explicitly when deployment credentials are missing', () => {
    const { root, result } = replay({ configured: false });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing release configuration: VPS_DEPLOY_KEY');
    expect(existsSync(join(root, 'ssh-args'))).toBe(false);
  });
});
