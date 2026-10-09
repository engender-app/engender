import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function receiver() {
  const root = mkdtempSync(join(tmpdir(), 'engender-receiver-'));
  roots.push(root);
  const trusted = join(root, 'trusted');
  mkdirSync(trusted);
  const script = readFileSync('deploy/receive-release.sh', 'utf8')
    .replaceAll('/home/journal', root).replaceAll('/usr/local/lib/engender', trusted);
  for (const name of ['journal-release.mjs', 'app-version.mjs']) {
    writeFileSync(join(trusted, name), readFileSync(`scripts/${name}`, 'utf8').replaceAll('/home/journal', root));
  }
  const run = (kind = 'valid') => {
    const archive = execFileSync('python3', ['-c', `
import io, json, sys, tarfile
kind = sys.argv[1]
files = {
    'build/index.html': 'release document',
    'build/service-worker.js': '// worker',
    'build/_app/version.json': '{"version":"fixture"}',
    'build/release.json': json.dumps({'version':'1.2.3','buildId':'fixture','schemaMax':3})
}
if kind == 'code':
    files['scripts/journal-release.mjs'] = 'process.exit(0)'
if kind == 'traversal':
    files['build/../../escaped'] = 'escaped'
if kind == 'incomplete':
    del files['build/index.html']
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
    for name, text in files.items():
        data = text.encode()
        member = tarfile.TarInfo(name)
        member.size = len(data)
        member.mode = 0o644
        archive.addfile(member, io.BytesIO(data))
    if kind in ['symlink', 'hardlink']:
        member = tarfile.TarInfo('build/escape')
        member.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
        member.linkname = '/tmp/escape'
        archive.addfile(member)
`, kind]);
    return spawnSync('bash', ['-c', script], { input: archive, encoding: 'utf8' });
  };
  return { root, run };
}

describe('trusted deployment receiver', () => {
  it('deploys using installed code and accepts an identical retry without replacing current', () => {
    const { root, run } = receiver();
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    const target = readlinkSync(join(root, 'current'));
    const retry = run();
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.stdout).toContain('Release already active');
    expect(readlinkSync(join(root, 'current'))).toBe(target);
  });

  it.each(['code', 'traversal', 'symlink', 'hardlink', 'incomplete'])('rejects %s without switching the active release', (kind) => {
    const { root, run } = receiver();
    expect(run().status).toBe(0);
    const target = readlinkSync(join(root, 'current'));
    const rejected = run(kind);
    expect(rejected.status).not.toBe(0);
    expect(readlinkSync(join(root, 'current'))).toBe(target);
    expect(existsSync(join(root, 'escaped'))).toBe(false);
  });
});
