/* The server the browser checks boot the built app from (after-release
   ticket 31, audit PERF-05). It has to hand out the document that ships,
   with the headers production sends, or a check passes against a page no
   person will ever load: vite preview's document had no CSP and no held
   module hints. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { serveBuild } from './serve-build.mjs';

const DOCUMENT = '<!doctype html><meta http-equiv="content-security-policy" content="default-src \'self\'"><title>shipped</title>';

let root: string;
let server: Awaited<ReturnType<typeof serveBuild>> | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'serve-build-'));
  mkdirSync(join(root, 'build/_app/immutable/assets'), { recursive: true });
  writeFileSync(join(root, 'build/index.html'), DOCUMENT);
  writeFileSync(join(root, 'build/_app/immutable/assets/sqlite3.abc.wasm'), 'wasm bytes');
  writeFileSync(join(root, 'build/manifest.webmanifest'), '{}');
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

async function get(path: string) {
  server ??= await serveBuild(root);
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('server is not listening on a port');
  return fetch(`http://localhost:${address.port}${path}`);
}

test('the root and every route that is not a file get build/index.html byte for byte', async () => {
  for (const path of ['/', '/journal/2026-10-06', '/settings?tab=a']) {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await response.text()).toBe(DOCUMENT);
  }
});

test('every response carries the isolation headers SQLite needs, as production sends them', async () => {
  for (const path of ['/', '/_app/immutable/assets/sqlite3.abc.wasm', '/_app/immutable/missing.js']) {
    const response = await get(path);
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
  }
});

test('a file is served with its own type, and a missing hashed asset is a 404, not the document', async () => {
  const wasm = await get('/_app/immutable/assets/sqlite3.abc.wasm');
  expect(wasm.headers.get('content-type')).toBe('application/wasm');
  expect(await wasm.text()).toBe('wasm bytes');
  expect((await get('/manifest.webmanifest')).headers.get('content-type')).toBe('application/manifest+json');
  expect((await get('/_app/immutable/chunks/gone.js')).status).toBe(404);
});

test('a path that climbs out of build/ gets the document, never the file it names', async () => {
  writeFileSync(join(root, 'secret.txt'), 'outside');
  const response = await get('/..%2fsecret.txt');
  expect(await response.text()).toBe(DOCUMENT);
});

test('starting over a tree with no build is refused by name', async () => {
  rmSync(join(root, 'build'), { recursive: true });
  await expect(serveBuild(root)).rejects.toThrow(/build\/index\.html/);
});
