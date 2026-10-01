import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serializeCatalogue } from './catalogue.mjs';
import { catalogueFindings, collectReferenceSites, copySourceFiles } from './check-copy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGE = fileURLToPath(new URL('./strings.html', import.meta.url));

class RequestError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** @param {string} root */
export function readStrings(root = ROOT) {
  const en = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8'));
  const pl = JSON.parse(readFileSync(join(root, 'messages/pl.json'), 'utf8'));
  const sites = collectReferenceSites(copySourceFiles(root));
  const findings = catalogueFindings(en, pl, new Set(sites.keys()));
  return Object.keys({ ...en, ...pl }).filter((key) => !key.startsWith('$')).sort().map((key) => ({
    key,
    en: en[key] ?? null,
    pl: pl[key] ?? null,
    findings: findings.filter((finding) => finding.key === key).map(({ message }) => message),
    sites: (sites.get(key) ?? []).map(({ file, line }) => ({
      file: relative(root, file), line, href: `vscode://file${pathToFileURL(file).pathname}:${line}`
    }))
  }));
}

/** Edit only an existing string or one declared match form. Reload before
 * writing so another field's changes survive; reject a stale same-field edit.
 * @param {string} root @param {unknown} edit */
export function writeString(root, edit) {
  if (!edit || typeof edit !== 'object') throw new RequestError(400, 'Invalid edit.');
  const { locale, key, variant, form, previous, text } = /** @type {Record<string, unknown>} */ (edit);
  if ((locale !== 'en' && locale !== 'pl') || typeof key !== 'string' || key.startsWith('$') ||
      typeof text !== 'string' || typeof previous !== 'string') {
    throw new RequestError(400, 'Invalid locale, key or text.');
  }
  const file = join(root, `messages/${locale}.json`);
  const catalogue = JSON.parse(readFileSync(file, 'utf8'));
  if (!Object.hasOwn(catalogue, key)) throw new RequestError(400, 'Key does not exist.');
  let target = catalogue;
  let field = key;
  if (typeof catalogue[key] === 'string') {
    if (variant !== null || form !== null) throw new RequestError(400, 'Plain values have no form.');
  } else {
    if (!Array.isArray(catalogue[key]) || typeof variant !== 'number' || !Number.isInteger(variant) ||
        typeof form !== 'string' || !catalogue[key][variant]?.match ||
        !Object.hasOwn(catalogue[key][variant].match, form)) {
      throw new RequestError(400, 'Form does not exist.');
    }
    target = catalogue[key][variant].match;
    field = form;
  }
  if (typeof target[field] !== 'string') throw new RequestError(400, 'Value is not editable text.');
  if (target[field] !== previous) throw new RequestError(409, 'Value changed on disk. Reload before saving.');
  target[field] = text;
  const temporary = join(dirname(file), `.strings-${randomUUID()}.tmp`);
  writeFileSync(temporary, serializeCatalogue(catalogue));
  try {
    renameSync(temporary, file);
  } catch (error) {
    unlinkSync(temporary);
    throw error;
  }
}

/** @param {string} root */
export function createStringsServer(root = ROOT) {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const address = server.address();
      const host = address && typeof address === 'object' ? `127.0.0.1:${address.port}` : '';
      if (request.headers.host !== host ||
          (request.headers.origin && request.headers.origin !== `http://${host}`)) {
        throw new RequestError(403, 'Use the local strings page.');
      }
      if (request.method === 'GET' && request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(readFileSync(PAGE));
      } else if (request.method === 'GET' && request.url === '/api/strings') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(readStrings(root)));
      } else if (request.method === 'PATCH' && request.url === '/api/strings') {
        if (request.headers['content-type'] !== 'application/json') {
          throw new RequestError(415, 'Send application/json.');
        }
        /** @type {Buffer[]} */
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 1024 * 1024) throw new RequestError(413, 'Edit is too large.');
          chunks.push(chunk);
        }
        let edit;
        try { edit = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON.'); }
        writeString(root, edit);
        response.statusCode = 204;
        response.end();
      } else {
        throw new RequestError(404, 'Not found.');
      }
    } catch (error) {
      response.statusCode = error instanceof RequestError ? error.status : 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(error instanceof Error ? error.message : 'Request failed.');
    }
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createStringsServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address === 'object') console.log(`Strings: http://127.0.0.1:${address.port}`);
  });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
