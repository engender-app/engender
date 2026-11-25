import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { serializeCatalogue } from './catalogue.mjs';
import { catalogueFindings, collectReferenceSites, copySourceFiles } from './check-copy.mjs';
import { isOutside, readOutside, replaceOutside } from './strings-outside.mjs';
import { lexiconProblem } from './lexicon-core.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGE = fileURLToPath(new URL('./strings.html', import.meta.url));
const REVIEW_FILE = '.scratch/copy-review.json';
const LEXICON_PAGE = fileURLToPath(new URL('./lexicon.html', import.meta.url));
const LEXICON_CORE = fileURLToPath(new URL('./lexicon-core.mjs', import.meta.url));
const LEXICON_FILE = 'messages/lexicon.json';
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
  const coverage = JSON.parse(readFileSync(join(root, 'messages/copy-coverage-50.json'), 'utf8'));
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
      findings: now?.findings ?? [], sites: (now?.sites ?? []).map(site)
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

/** The lexicon and the revision a save must name, so two tabs cannot
 * overwrite each other.
 * @param {string} root */
export function readLexicon(root = ROOT) {
  let text;
  try { text = readFileSync(join(root, LEXICON_FILE), 'utf8'); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') text = '{"terms":[]}'; else throw error; }
  return { revision: createHash('sha256').update(text).digest('hex'), lexicon: JSON.parse(text) };
}

/** @param {string} root @param {unknown} save */
export function writeLexicon(root, save) {
  if (!save || typeof save !== 'object') throw new RequestError(400, 'Invalid lexicon.');
  const { revision: expected, lexicon } = /** @type {{ revision?: unknown, lexicon?: unknown }} */ (save);
  const problem = lexiconProblem(lexicon);
  if (typeof expected !== 'string' || problem) throw new RequestError(400, problem ?? 'Invalid lexicon.');
  if (readLexicon(root).revision !== expected) throw new RequestError(409, 'Lexicon changed on disk. Reload before saving.');
  writeAtomic(join(root, LEXICON_FILE), JSON.stringify(lexicon, null, 2) + '\n');
}

/** Remove one catalogue key from both languages. Refuses a key the source
 * still references, a key edited since the page loaded, and copy outside the
 * catalogues. Runs synchronously, so a concurrent edit cannot interleave.
 * @param {string} root @param {unknown} removal */
export function removeString(root, removal) {
  if (!removal || typeof removal !== 'object') throw new RequestError(400, 'Invalid removal.');
  const { key, en: shownEn, pl: shownPl } = /** @type {Record<string, unknown>} */ (removal);
  if (typeof key !== 'string' || key.startsWith('$') || isOutside(key)) {
    throw new RequestError(400, 'Only message catalogue keys can be removed.');
  }
  const files = ['en', 'pl'].map((locale) => join(root, `messages/${locale}.json`));
  const [en, pl] = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
  if (!Object.hasOwn(en, key) && !Object.hasOwn(pl, key)) throw new RequestError(400, 'Key does not exist.');
  if (!isDeepStrictEqual(shownEn, en[key] ?? null) || !isDeepStrictEqual(shownPl, pl[key] ?? null)) {
    throw new RequestError(409, `Copy changed for ${key}. Reload before removing.`);
  }
  const used = collectReferenceSites(copySourceFiles(root)).get(key) ?? [];
  if (used.length) {
    const first = `${relative(root, used[0].file)}:${used[0].line}`;
    throw new RequestError(409, `Still used in ${used.length} place${used.length === 1 ? '' : 's'}, first ${first}. Remove those references first.`);
  }
  delete en[key];
  delete pl[key];
  writeAtomic(files[0], serializeCatalogue(en));
  writeAtomic(files[1], serializeCatalogue(pl));
  const approved = readReviews(root);
  if (Object.hasOwn(approved, key)) {
    delete approved[key];
    writeAtomic(join(root, REVIEW_FILE), JSON.stringify(approved, null, 2) + '\n');
  }
}

/** @param {import('node:http').IncomingMessage} request */
async function readJson(request) {
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
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON.'); }
}

/** Without a key the server answers only 127.0.0.1. With one it answers any
 * address, so a phone on the LAN can use it, but only a browser that opened a
 * page with `?key=` once: that sets a SameSite cookie every later request must
 * carry, and a write from another site's page is refused by its Origin.
 * @param {string} root @param {{ key?: string | null }} [options] */
export function createStringsServer(root = ROOT, { key = null } = {}) {
  const session = key ? createHash('sha256').update(key).digest('hex') : null;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      const host = session ? request.headers.host ?? '' : `127.0.0.1:${port}`;
      if (request.headers.host !== host || !host.endsWith(`:${port}`) ||
          (request.headers.origin && request.headers.origin !== `http://${host}`)) {
        throw new RequestError(403, 'Use the local strings page.');
      }
      if (session) {
        const url = new URL(request.url ?? '/', `http://${host}`);
        if (request.method === 'GET' && url.searchParams.has('key')) {
          if (url.searchParams.get('key') !== key) throw new RequestError(403, 'Wrong key.');
          response.statusCode = 303;
          response.setHeader('Set-Cookie', `strings-key=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
          response.setHeader('Location', url.pathname);
          response.end();
          return;
        }
        const cookies = (request.headers.cookie ?? '').split(';').map((part) => part.trim());
        if (!cookies.includes(`strings-key=${session}`)) throw new RequestError(403, 'Open the address with its key first.');
      }
      if (request.method === 'GET' && request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(readFileSync(PAGE));
      } else if (request.method === 'GET' && request.url === '/lexicon') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(readFileSync(LEXICON_PAGE));
      } else if (request.method === 'GET' && request.url === '/lexicon-core.mjs') {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(readFileSync(LEXICON_CORE));
      } else if (request.method === 'GET' && request.url === '/api/lexicon') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(readLexicon(root)));
      } else if (request.method === 'GET' && request.url === '/api/strings') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(readStrings(root)));
      } else if ((request.method === 'PATCH' && ['/api/strings', '/api/reviews'].includes(request.url ?? '')) ||
          (request.method === 'PUT' && request.url === '/api/lexicon')) {
        const edit = await readJson(request);
        if (request.url === '/api/reviews') writeReviews(root, edit);
        else if (request.url === '/api/lexicon') writeLexicon(root, edit);
        else writeString(root, edit);
        response.statusCode = 204;
        response.end();
      } else if (request.method === 'DELETE' && request.url === '/api/strings') {
        removeString(root, await readJson(request));
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
  // `--lan`: reachable from a phone at a fixed port, behind a key kept in
  // .scratch so a restart does not log the phone out.
  const lan = process.argv.includes('--lan');
  let key = null;
  if (lan) {
    const file = join(ROOT, '.scratch/strings-lan-key');
    try { key = readFileSync(file, 'utf8').trim(); } catch { /* first run */ }
    if (!key) {
      key = randomUUID();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, key + '\n', { mode: 0o600 });
    }
  }
  const server = createStringsServer(ROOT, { key });
  server.listen(lan ? Number(process.env.STRINGS_PORT ?? 8737) : 0, lan ? '0.0.0.0' : '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address === 'object') {
      const hosts = lan ? Object.values(networkInterfaces()).flat()
        .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal).map((entry) => entry?.address) : ['127.0.0.1'];
      for (const name of hosts) {
        const base = `http://${name}:${address.port}`;
        const suffix = key ? `?key=${key}` : '';
        console.log(process.argv[2] === 'lexicon' ? `Lexicon: ${base}/lexicon${suffix}` : `Strings: ${base}/${suffix}\nLexicon: ${base}/lexicon${suffix}`);
      }
    }
  });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
