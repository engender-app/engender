import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import base from './retained-door-cost.vite.config';

const control: Plugin = {
  name: 'retained-door-observer-control',
  enforce: 'pre',
  transform(source, id) {
    if (!id.endsWith('/retained-door-cost/probe.svelte.ts')) return;
    return source
      .replace("import { createAndroidSqlite } from '../../src/lib/data/sqlite/android-driver';",
        "import { createEncryptedWebSqlite as createAndroidSqlite } from '../../src/lib/data/sqlite/mc-driver';")
      .replace("import { appPrivatePhotoFiles } from '../../src/lib/data/photos/android-file-store';",
        "import { opfsPhotoFiles as appPrivatePhotoFiles } from '../../src/lib/data/photos/opfs-file-store';")
      .replace('days: TEN_YEARS_IN_DAYS', 'days: 90')
      .replace("driver: 'native SQLCipher createAndroidSqlite with recordingDriver'", "driver: 'desktop observer control only'");
  }
};

export default defineConfig({
  ...base,
  plugins: [control, ...(base.plugins ?? [])],
  publicDir: resolve(import.meta.dirname, '../../static'),
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  optimizeDeps: { exclude: ['@evolu/sqlite-wasm'] }
});
