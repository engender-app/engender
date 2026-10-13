import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadConfigFromFile, type Plugin, type ResolvedConfig } from 'vite';
import { rollup } from 'rollup';

async function emit(files: Record<string, string>) {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve('vite.config.ts'));
  const owner = loaded!.config.plugins!.flat().find((plugin) =>
    plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'engender:layout-startup-chunks'
  ) as Plugin;
  (owner.configResolved as (config: ResolvedConfig) => void)({
    build: { outDir: resolve('.svelte-kit/output/client') }
  } as ResolvedConfig);
  const sources = new Map(Object.entries({
    'bootstrap.js': `import * as layout from './src/routes/+layout.svelte'; export const client = () => layout;`,
    ...files
  }).map(([file, code]) => [resolve(file), code]));
  const bundle = await rollup({
    input: resolve('bootstrap.js'),
    plugins: [{
      name: 'startup-fixture',
      resolveId(id, importer) {
        if (sources.has(id)) return id;
        const path = resolve(importer ? resolve(importer, '..') : '.', id);
        return sources.has(path) ? path : undefined;
      },
      load: (id) => sources.get(id)
    }, owner]
  });
  try { return (await bundle.generate({ format: 'es' })).output; }
  finally { await bundle.close(); }
}

describe('production layout chunk ownership', () => {
  it('keeps dynamic features, the catalogue and early bootstrap outside the group', async () => {
    const output = await emit({
      'src/routes/+layout.svelte': `import { eager } from '../lib/eager.js';
        import { message } from '../lib/paraglide/messages.js';
        import { ssr } from './+layout.ts';
        export const layout = [eager, message, ssr];
        export const feature = () => import('../lib/lazy.js');`,
      'src/routes/+layout.ts': 'export const ssr = false;',
      'src/lib/eager.js': `import { runtime } from '../../node_modules/dependency/index.js'; export const eager = runtime;`,
      'node_modules/dependency/index.js': 'export const runtime = 1;',
      'src/lib/paraglide/messages.js': `export { message } from './message.js'; export { unused } from './unused.js';`,
      'src/lib/paraglide/message.js': 'export const message = "hello";',
      'src/lib/paraglide/unused.js': 'export const unused = "route-only copy";',
      'src/lib/lazy.js': 'export const lazy = "deferred feature";'
    });
    const group = output.find((chunk) => chunk.type === 'chunk' && chunk.name === 'layout-startup');
    expect(group?.type).toBe('chunk');
    if (group?.type !== 'chunk') return;
    expect(Object.keys(group.modules).map((id) => id.slice(process.cwd().length + 1)).sort()).toEqual([
      'src/lib/eager.js', 'src/routes/+layout.svelte'
    ]);
    const chunks = output.filter((item) => item.type === 'chunk');
    const lazy = chunks.find((chunk) => resolve('src/lib/lazy.js') in chunk.modules)!;
    expect(chunks.some((chunk) => chunk.dynamicImports.includes(lazy.fileName))).toBe(true);
    const eager = new Set<string>();
    const visit = (file: string) => {
      if (eager.has(file)) return;
      eager.add(file);
      for (const dependency of chunks.find((chunk) => chunk.fileName === file)?.imports ?? []) visit(dependency);
    };
    visit(chunks.find((chunk) => chunk.isEntry)!.fileName);
    expect(eager.has(lazy.fileName)).toBe(false);
  });

  it('refuses a route that would become eager through a layout import', async () => {
    await expect(emit({
      'src/routes/+layout.svelte': `export { page } from './+page.svelte';`,
      'src/routes/+page.svelte': 'export const page = 1;'
    })).rejects.toThrow('crosses a lazy or bootstrap boundary');
  });

  it('refuses a static chunk cycle through a dependency', async () => {
    await expect(emit({
      'src/routes/+layout.svelte': `import { eager } from '../lib/eager.js';
        import { shared } from '../lib/shared.js'; export const layout = [eager, shared];`,
      'src/lib/eager.js': `import { runtime } from '../../node_modules/dependency/index.js'; export const eager = runtime;`,
      'node_modules/dependency/index.js': `import { shared } from '../../src/lib/shared.js'; export const runtime = shared;`,
      'src/lib/shared.js': 'export const shared = 1;'
    })).rejects.toThrow('creates a static chunk cycle');
  });

  it.each(['components/VocabularyManagerSheets.svelte', 'navigation/RetainedDoors.svelte', 'data/vocabulary/vocabulary.ts'])(
    'refuses %s even when layout use shakes out but another route renders it', async (feature) => {
      await expect(emit({
        'src/routes/+layout.svelte': `import { keep } from '../lib/barrel.js'; export { keep };
          export const route = () => import('./other/+page.svelte');`,
        'src/lib/barrel.js': `export const keep = 1; export { deferred } from './${feature}';`,
        [`src/lib/${feature}`]: 'export const deferred = 2;',
        'src/routes/other/+page.svelte': `export { deferred } from '../../lib/${feature}';`
      })).rejects.toThrow('crosses a lazy or bootstrap boundary');
    }
  );
});
