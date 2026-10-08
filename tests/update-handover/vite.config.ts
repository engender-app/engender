import { defineConfig } from 'vite';
import { resolve } from 'node:path';

let generation = 1;
let activationReleased = false;
let releaseActivation: (() => void) | undefined;

export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(import.meta.dirname, '../../static'),
  server: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
    fs: { strict: false }
  },
  resolve: { alias: { $lib: resolve(import.meta.dirname, '../../src/lib') } },
  worker: { format: 'es' },
  define: { __DEMO__: 'false', __APP_VERSION__: JSON.stringify('0.0.0-update-handover') },
  optimizeDeps: { exclude: ['@evolu/sqlite-wasm'] },
  plugins: [{
    name: 'held-update-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/bump') {
          generation++;
          activationReleased = false;
          res.end('ok');
        } else if (req.url === '/activation-wait') {
          if (activationReleased) res.end('ok');
          else releaseActivation = () => res.end('ok');
        } else if (req.url === '/activation-release') {
          activationReleased = true;
          releaseActivation?.();
          releaseActivation = undefined;
          res.end('ok');
        } else if (req.url === '/handover-sw.js') {
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-store');
          res.end([
            `import { listenForSkipWaiting } from '/@fs${resolve(import.meta.dirname, '../../src/lib/pwa/sw-messages.ts')}';`,
            `const GENERATION = ${generation};`,
            `listenForSkipWaiting({
              addEventListener(type, listener) {
                self.addEventListener(type, event => event.waitUntil((async () => {
                  await fetch('/activation-wait');
                  listener(event);
                })()));
              },
              skipWaiting: () => self.skipWaiting()
            });`,
            "self.addEventListener('fetch', () => {});",
            `self.addEventListener('activate', event => event.waitUntil((async () => {
              await self.clients.claim();
            })()));`
          ].join('\n'));
        } else next();
      });
    }
  }]
});
