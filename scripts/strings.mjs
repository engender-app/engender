import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { serializeCatalogue } from './catalogue.mjs';
import { catalogueFindings, collectReferenceSites, copySourceFiles } from './check-copy.mjs';
import { isOutside, readOutside, replaceOutside } from './strings-outside.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGE = fileURLToPath(new URL('./strings.html', import.meta.url));
const REVIEW_FILE = '.scratch/copy-review.json';
/** @type {Record<number, string>} */
const THEMES = {
  38: 'Journal, day, search and readback',
  39: 'Body, care and health',
  40: 'Transition, voice and reflection',
  41: 'Setup, access, recovery and gates',
  42: 'Preferences and reminders',
  43: 'Files, system and shared controls'
};

class RequestError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** @param {string} root */
function readReviews(root) {
  try { return JSON.parse(readFileSync(join(root, REVIEW_FILE), 'utf8')); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}; throw error; }
}

/** @param {unknown} en @param {unknown} pl */
const revision = (en, pl) => createHash('sha256').update(JSON.stringify([en, pl])).digest('hex');

/** @param {string} file @param {string} text */
function writeAtomic(file, text) {
  const temporary = join(dirname(file), `.strings-${randomUUID()}.tmp`);
  writeFileSync(temporary, text);
  try { renameSync(temporary, file); }
  catch (error) { unlinkSync(temporary); throw error; }
}

/** Save approval of the values actually shown, for one key or a visible group.
 * @param {string} root @param {unknown} review */
export function writeReviews(root, review) {
  if (!review || typeof review !== 'object') throw new RequestError(400, 'Invalid review.');
  const { reviewed, keys } = /** @type {{ reviewed?: unknown, keys?: unknown }} */ (review);
  if (typeof reviewed !== 'boolean' || !Array.isArray(keys) || !keys.length) throw new RequestError(400, 'Invalid review.');
  const en = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8'));
  const pl = JSON.parse(readFileSync(join(root, 'messages/pl.json'), 'utf8'));
  const approved = readReviews(root);
  const outside = readOutside(root);
  for (const entry of keys) {
    const other = entry && typeof entry.key === 'string' ? outside.get(entry.key) : undefined;
    if (!entry || typeof entry.key !== 'string' || entry.key.startsWith('$') ||
        (!other && !Object.hasOwn(en, entry.key) && !Object.hasOwn(pl, entry.key))) {
      throw new RequestError(400, 'Key does not exist.');
    }
    const current = other ? { en: other.en, pl: other.pl } : { en: en[entry.key] ?? null, pl: pl[entry.key] ?? null };
    if (!isDeepStrictEqual(entry.en, current.en) || !isDeepStrictEqual(entry.pl, current.pl)) {
      throw new RequestError(409, `Copy changed for ${entry.key}. Reload before reviewing.`);
    }
    if (reviewed) Object.defineProperty(approved, entry.key, {
      value: revision(current.en, current.pl), enumerable: true, configurable: true, writable: true
    });
    else delete approved[entry.key];
  }
  const file = join(root, REVIEW_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeAtomic(file, JSON.stringify(approved, null, 2) + '\n');
}

/** @param {string} root */
export function readStrings(root = ROOT) {
  const en = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8'));
  const pl = JSON.parse(readFileSync(join(root, 'messages/pl.json'), 'utf8'));
  const approved = readReviews(root);
  const coverage = JSON.parse(readFileSync(join(root, 'docs/agents/copy-coverage-50.json'), 'utf8'));
  const base = execFileSync('git', ['merge-base', 'HEAD', 'main'], { cwd: root, encoding: 'utf8' }).trim();
  const previousEn = JSON.parse(execFileSync('git', ['show', `${base}:messages/en.json`], { cwd: root, encoding: 'utf8' }));
  const previousPl = JSON.parse(execFileSync('git', ['show', `${base}:messages/pl.json`], { cwd: root, encoding: 'utf8' }));
  const sites = collectReferenceSites(copySourceFiles(root));
  const findings = catalogueFindings(en, pl, new Set(sites.keys()));
  const site = (/** @type {{ file: string, line: number }} */ { file, line }) => ({
    file, line, href: `vscode://file${pathToFileURL(join(root, file)).pathname}:${line}`
  });
  const outside = readOutside(root);
  const outsidePrevious = readOutside(root, base);
  const outsideRows = [...new Set([...outsidePrevious.keys(), ...outside.keys()])].sort().map((key) => {
    const now = outside.get(key);
    const before = outsidePrevious.get(key);
    const values = { en: now?.en ?? null, pl: now?.pl ?? null };
    const previous = { en: before?.en ?? null, pl: before?.pl ?? null };
    return {
      key, theme: (now ?? before)?.theme ?? 'Unassigned copy', ...values,
      reviewed: approved[key] === revision(values.en, values.pl), previous,
      change: !before ? 'added' : !now ? 'removed' : isDeepStrictEqual(values, previous) ? null : 'changed',
      findings: [], sites: (now?.sites ?? []).map(site)
    };
  });
  return [...Object.keys({ ...previousEn, ...previousPl, ...en, ...pl }).filter((key) => !key.startsWith('$')).sort().map((key) => ({
    key,
    theme: THEMES[coverage[key]?.owner] ?? 'Unassigned copy',
    en: en[key] ?? null,
    pl: pl[key] ?? null,
    reviewed: approved[key] === revision(en[key] ?? null, pl[key] ?? null),
    previous: { en: previousEn[key] ?? null, pl: previousPl[key] ?? null },
    change: !Object.hasOwn(previousEn, key) && !Object.hasOwn(previousPl, key) ? 'added' :
      !Object.hasOwn(en, key) && !Object.hasOwn(pl, key) ? 'removed' :
      !isDeepStrictEqual(en[key], previousEn[key]) || !isDeepStrictEqual(pl[key], previousPl[key]) ? 'changed' : null,
    findings: findings.filter((finding) => finding.key === key).map(({ message }) => message),
    sites: (sites.get(key) ?? []).map(({ file, line }) => ({
      file: relative(root, file), line, href: `vscode://file${pathToFileURL(file).pathname}:${line}`
    }))
  })), ...outsideRows];
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
  if (isOutside(key)) {
    if (variant !== null || form !== null) throw new RequestError(400, 'Plain values have no form.');
    const result = replaceOutside(root, locale, key, previous, text);
    if ('error' in result) throw new RequestError(result.error, result.message);
    writeAtomic(result.file, result.text);
    return;
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
  writeAtomic(file, serializeCatalogue(catalogue));
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
      } else if (request.method === 'PATCH' && ['/api/strings', '/api/reviews'].includes(request.url ?? '')) {
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
        if (request.url === '/api/reviews') writeReviews(root, edit);
        else writeString(root, edit);
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
