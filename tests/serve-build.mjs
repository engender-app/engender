/* Serves `<root>/build` the way deploy/nginx does (after-release ticket 31,
   audit PERF-05), for the browser checks that boot the built app.

   They used to go through vite preview, whose document is not the one that
   ships: SvelteKit's preview renders the fallback page again instead of
   reading build/index.html, so it had no CSP meta and no held module hints,
   and every check ran under neither. This reads the file on disk for every
   request, so the page a check loads is the page a person loads.

   What it copies from the production config
   (deploy/nginx/snippets/engender-journal-site.conf): the two isolation
   headers SQLite needs, a file served as itself, a missing file under
   /_app/immutable/ answered with 404, and anything else answered with the
   document, which is how this SPA's routes reach the client. It does not
   compress or cache; nothing a check measures depends on either. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.gz': 'application/gzip'
};

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

/** Starts the server on `port` (0 picks a free one) and resolves once it
    listens. The result has the two members callers of vite's preview server
    used, `httpServer` and `close()`. */
export async function serveBuild(root, { port = 0 } = {}) {
  const build = resolve(root, 'build');
  const documentPath = join(build, 'index.html');
  if (!existsSync(documentPath)) throw new Error(`No ${documentPath}. Run npm run build first.`);

  const httpServer = createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      pathname = '/';
    }
    const file = resolve(build, `.${pathname}`);
    const inside = file === build || file.startsWith(build + sep);
    const isFile = inside && existsSync(file) && statSync(file).isFile();

    if (!isFile && pathname.startsWith('/_app/immutable/')) {
      res.writeHead(404, { ...ISOLATION, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const served = isFile ? file : documentPath;
    const body = readFileSync(served);
    res.writeHead(200, {
      ...ISOLATION,
      'Content-Type': TYPES[extname(served)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  await new Promise((resolveListen, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, 'localhost', resolveListen);
  });

  return {
    httpServer,
    close: () =>
      new Promise((resolveClose) => {
        httpServer.closeAllConnections?.();
        httpServer.close(() => resolveClose());
      })
  };
}
