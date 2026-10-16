import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const repo = resolve(import.meta.dirname, '../..');
export const buildIdentity = {
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  probeSha256: createHash('sha256').update(Buffer.concat(readdirSync(import.meta.dirname).sort()
    .filter(name => statSync(resolve(import.meta.dirname, name)).isFile())
    .map(name => readFileSync(resolve(import.meta.dirname, name))))).digest('hex'),
  driverSha256: createHash('sha256').update(readFileSync(resolve(repo, 'src/lib/data/sqlite/android-driver.ts'))).digest('hex'),
  builtAt: new Date().toISOString()
};

export function queryExperiment(): Plugin {
  return {
      name: 'disposable-retained-query-deferral',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('/src/lib/data/live/journal.svelte.ts')) return;
        const owner = '  const instance = ++queriesMade;';
        const admission = '    if (!started && !when()) return;';
        if (!source.includes(owner) || !source.includes(admission)) throw new Error('retained query experiment owner changed');
        return "import { useDoorActivity } from '$lib/navigation/doorActivity.svelte';\nimport { recordReadOperations } from '/tests/retained-door-cost/operation-recording';\n" + source
          .replace(owner, "  const doorActive = useDoorActivity();\n  const defer = window.__retainedDoorExperiment === 'deferred';\n" + owner)
          .replace(admission, '    if (defer && !doorActive()) return;\n' + admission)
          .replace('running = run(recordingJournal(ready, dependOn, calls));',
            'running = run(recordReadOperations(recordingJournal(ready, dependOn, calls), doorActive));');
      }
    };
}

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [
    queryExperiment(),
    svelte({ configFile: false })
  ],
  define: { __RETAINED64_BUILD__: JSON.stringify(buildIdentity), __DEMO__: 'false', __APP_VERSION__: JSON.stringify('0.0.0-retained-door-cost') },
  resolve: { alias: {
    '/tests/retained-door-cost/operation-recording': resolve(repo, 'tests/retained-door-cost/operation-recording.ts'),
    '$lib/stores/today.svelte': resolve(repo, 'tests/long-journal/today-stub.ts'),
    '$lib/stores/boot.svelte': resolve(repo, 'tests/browser-tier/entry-editor-boot-stub.ts'),
    '$app/state': resolve(repo, 'tests/browser-tier/screen-router.svelte.ts'),
    '$app/navigation': resolve(repo, 'tests/browser-tier/app-navigation-stub.ts'),
    $lib: resolve(repo, 'src/lib')
  } },
  build: { outDir: resolve(repo, 'android/app/src/androidTest/assets/retained-door-cost-probe'),
    emptyOutDir: true, minify: false, target: 'chrome86' },
  worker: { format: 'es' }
});
