import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = new URL('../scripts/release-metadata.mjs', import.meta.url);
const binary = createRequire(import.meta.url).resolve('@evolu/sqlite-wasm/sqlite3.wasm');

describe('release metadata', () => {
  it('preloads the emitted demo database binary and refuses a missing binary', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-metadata-'));
    try {
      for (const directory of ['build/_app/immutable/assets', '.svelte-kit', 'src/lib/data/sqlite']) {
        mkdirSync(join(root, directory), { recursive: true });
      }
      writeFileSync(join(root, 'build/_app/version.json'), JSON.stringify({ version: 'fixture-build' }));
      writeFileSync(join(root, '.svelte-kit/demo-prewarm.json'), JSON.stringify('_app/immutable/demo-prewarm.js'));
      writeFileSync(join(root, 'src/lib/data/sqlite/migrations.ts'), 'const migrations = [{ version: 7 }];');
      const html = '<meta http-equiv="content-security-policy" content="default-src self"><main>Fixture</main>';
      writeFileSync(join(root, 'build/index.html'), html);
      writeFileSync(join(root, 'build/_app/immutable/assets/unrelated.wasm'), 'not the database binary');
      const emitted = join(root, 'build/_app/immutable/assets/sqlite3.fixture.wasm');
      copyFileSync(binary, emitted);
      const run = () => spawnSync(process.execPath, [script.pathname], {
        cwd: root, encoding: 'utf8', env: { ...process.env, VITE_DEMO: '1', ENGENDER_VERSION: '9.9.9-fixture' }
      });
      const passed = run();
      expect(passed.status, passed.stderr).toBe(0);
      expect(readFileSync(join(root, 'build/index.html'), 'utf8')).toContain('data-wasm="/_app/immutable/assets/sqlite3.fixture.wasm"');
      expect(JSON.parse(readFileSync(join(root, 'build/release.json'), 'utf8'))).toEqual({
        version: '9.9.9-fixture', buildId: 'fixture-build', schemaMax: 7
      });
      rmSync(emitted);
      const missing = run();
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('The demo worker database module was not emitted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
