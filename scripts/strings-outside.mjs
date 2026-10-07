// Copy that lives outside messages/*.json: Android resources, the web
// manifests, the store listing and the privacy policy. Each source is read
// as named values with their exact place in the file, so the strings page can
// show English beside Polish and write one value back without reformatting
// anything around it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const INSTALL = 'Android, store and web install';

/** @typedef {{ name: string, value: string, start: number, end: number, locked?: string }} Field */
/** @typedef {{ parse: (text: string) => Field[], encode: (value: string) => string }} Format */

/** Android string resources: entities, then backslash escapes. */
/** @param {string} raw */
function decodeAndroid(raw) {
  const unentity = raw.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, name) =>
    name[0] === '#' ? String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
      : { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[/** @type {'lt'} */ (name.toLowerCase())]);
  return unentity.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, code) =>
    code.length === 5 ? String.fromCharCode(parseInt(code.slice(1), 16)) : code === 'n' ? '\n' : code === 't' ? '\t' : code);
}

/** @type {Format} */
const androidXml = {
  parse(text) {
    /** @type {Field[]} */
    const fields = [];
    for (const match of text.matchAll(/<string name="([^"]+)"([^>]*)>([\s\S]*?)<\/string>/g)) {
      if (/translatable="false"/.test(match[2])) continue;
      const start = match.index + match[0].indexOf('>') + 1;
      const markup = /[<]/.test(match[3]);
      fields.push({ name: match[1], value: markup ? match[3] : decodeAndroid(match[3]), start, end: start + match[3].length,
        ...(markup ? { locked: 'This string holds markup. Edit it in the file.' } : {}) });
    }
    for (const array of text.matchAll(/<string-array name="([^"]+)"([^>]*)>([\s\S]*?)<\/string-array>/g)) {
      if (/translatable="false"/.test(array[2])) continue;
      const bodyStart = array.index + array[0].indexOf('>') + 1;
      let n = 0;
      for (const item of array[3].matchAll(/<item>([^<]*)<\/item>/g)) {
        const start = bodyStart + item.index + '<item>'.length;
        fields.push({ name: `${array[1]}.${++n}`, value: decodeAndroid(item[1]), start, end: start + item[1].length });
      }
    }
    return fields;
  },
  encode: (value) => value.replaceAll('\\', '\\\\').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll("'", "\\'").replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t').replace(/^([@?])/, '\\$1')
};

/** Every string value in a JSON text with its dotted path (array indexes from 1). @param {string} text */
function jsonStrings(text) {
  /** @type {{ path: string, value: string, start: number, end: number }[]} */
  const out = [];
  /** @type {{ array: boolean, key: string | null, index: number }[]} */
  const stack = [];
  let expectKey = false;
  const path = () => stack.map((frame) => frame.array ? String(frame.index) : frame.key).join('.');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') { stack.push({ array: false, key: null, index: 0 }); expectKey = true; }
    else if (c === '[') { stack.push({ array: true, key: null, index: 1 }); }
    else if (c === '}' || c === ']') { stack.pop(); }
    else if (c === ',') { const top = stack.at(-1); if (top?.array) top.index++; else expectKey = true; }
    else if (c === '"') {
      const literal = /^"(?:[^"\\]|\\.)*"/.exec(text.slice(i))?.[0] ?? '""';
      const value = JSON.parse(literal);
      const top = stack.at(-1);
      if (top && !top.array && expectKey) { top.key = value; expectKey = false; }
      else out.push({ path: path(), value, start: i, end: i + literal.length });
      i += literal.length - 1;
    }
  }
  return out;
}

/** name, short_name and description, at the top and in each shortcut. */
/** @type {Format} */
const manifest = {
  parse: (text) => jsonStrings(text)
    .filter(({ path }) => /^(?:shortcuts\.\d+\.)?(?:name|short_name|description)$/.test(path))
    .map(({ path, value, start, end }) => ({ name: path, value, start, end })),
  encode: (value) => JSON.stringify(value)
};

/** The whole file is one value; its trailing newline stays outside it. */
/** @type {Format} */
const plainText = {
  parse(text) {
    const value = text.replace(/\s+$/, '');
    return [{ name: '', value, start: 0, end: value.length }];
  },
  encode: (value) => value
};

/** Paragraphs separated by blank (or whitespace-only) lines, numbered from 01. */
/** @type {Format} */
const paragraphs = {
  parse: (text) => [...text.matchAll(/[^\n]*\S[^\n]*(?:\n[^\n]*\S[^\n]*)*/g)].map((match, index) => ({
    name: String(index + 1).padStart(2, '0'), value: match[0], start: match.index, end: match.index + match[0].length
  })),
  encode: (value) => {
    if (!value.trim() || /\n\s*\n/.test(value)) throw new Error('A paragraph cannot be empty or contain a blank line.');
    return value;
  }
};

/** Play Console limits for the store listing files. @type {Record<string, number>} */
const STORE_LIMITS = { title: 30, short_description: 80, full_description: 4000 };

/**
 * @typedef {{
 *   prefix: string, theme: string, format: Format,
 *   files: (root: string) => { name: string, en: string, pl: string }[],
 *   englishOnly?: 'skip' | 'missing', limit?: (name: string) => number | undefined,
 *   pairedByPosition?: boolean
 * }} Source
 */

/** @param {string} en @param {string} pl @returns {Source['files']} */
const pair = (en, pl) => () => [{ name: '', en, pl }];

/** @type {Source[]} */
const SOURCES = [
  // English-only Android values are identifiers (package name, URL scheme,
  // the untranslated app name), so they are not copy to review.
  { prefix: 'android', theme: INSTALL, format: androidXml, englishOnly: 'skip',
    files: pair('android/app/src/main/res/values/strings.xml', 'android/app/src/main/res/values-pl/strings.xml') },
  { prefix: 'manifest', theme: INSTALL, format: manifest,
    files: pair('static/manifest.webmanifest', 'static/manifest-pl.webmanifest') },
  { prefix: 'notes-manifest', theme: INSTALL, format: manifest,
    files: pair('static/manifest-notes.webmanifest', 'static/manifest-notes-pl.webmanifest') },
  { prefix: 'store', theme: INSTALL, format: plainText,
    limit: (name) => STORE_LIMITS[name] ?? (name.startsWith('changelogs/') ? 500 : undefined),
    files(root) {
      const base = 'fastlane/metadata/android';
      /** @param {string} dir @returns {string[]} */
      const list = (dir) => existsSync(join(root, dir)) ? readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.txt')) : [];
      return [...new Set([...list(`${base}/en-US`), ...list(`${base}/pl-PL`)])].sort().map((file) => ({
        name: file.replace(/\.txt$/, ''), en: `${base}/en-US/${file}`, pl: `${base}/pl-PL/${file}`
      }));
    } },
  { prefix: 'privacy', theme: 'Privacy policy', format: paragraphs, pairedByPosition: true,
    files: pair('docs/privacy-policy.en.md', 'docs/privacy-policy.pl.md') }
];

/** @param {string} root @param {string} file @param {string | null} ref */
function readFile(root, file, ref) {
  try {
    return ref ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      : readFileSync(join(root, file), 'utf8');
  } catch { return null; }
}

/** @param {string} text @param {number} offset */
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

/** @param {string | null} text @param {Format} format */
const fieldMap = (text, format) => new Map((text === null ? [] : format.parse(text)).map((field) => [field.name, field]));

/**
 * Every value, keyed `<prefix>:<file>/<name>`, with its English, its Polish
 * and where both live. Findings name what the page cannot fix by itself:
 * a missing translation, a store text over Play's limit, paragraphs that no
 * longer pair up.
 * @param {string} root @param {string | null} ref git ref to read instead of the disk
 */
export function readOutside(root, ref = null) {
  /** @type {Map<string, { theme: string, en: string | null, pl: string | null, findings: string[], sites: { file: string, line: number }[] }>} */
  const rows = new Map();
  for (const source of SOURCES) {
    for (const files of source.files(root)) {
      const texts = { en: readFile(root, files.en, ref), pl: readFile(root, files.pl, ref) };
      if (texts.en === null && texts.pl === null) continue;
      const en = fieldMap(texts.en, source.format);
      const pl = fieldMap(texts.pl, source.format);
      const names = [...new Set([...en.keys(), ...pl.keys()])]
        .filter((name) => pl.has(name) || source.englishOnly !== 'skip');
      const shifted = source.pairedByPosition && en.size !== pl.size;
      for (const name of names) {
        const key = `${source.prefix}:${[files.name, name].filter(Boolean).join('/')}`;
        const english = en.get(name);
        const polish = pl.get(name);
        const limit = source.limit?.(files.name);
        /** @type {string[]} */
        const findings = [];
        if (!polish) findings.push(`${key} is missing from ${files.pl}`);
        if (!english) findings.push(`${key} is missing from ${files.en}`);
        for (const [file, field] of /** @type {const} */ ([[files.en, english], [files.pl, polish]])) {
          if (field && limit && Array.from(field.value).length > limit) {
            findings.push(`${key} is ${Array.from(field.value).length} characters in ${file}; Play allows ${limit}`);
          }
          if (field?.locked) findings.push(`${key}: ${field.locked}`);
        }
        if (shifted) findings.push(`${files.en} has ${en.size} paragraphs and ${files.pl} has ${pl.size}, so pairs after the difference are off`);
        rows.set(key, {
          theme: source.theme, en: english?.value ?? null, pl: polish?.value ?? null, findings,
          sites: [
            ...(english && texts.en ? [{ file: files.en, line: lineAt(texts.en, english.start) }] : []),
            ...(polish && texts.pl ? [{ file: files.pl, line: lineAt(texts.pl, polish.start) }] : [])
          ]
        });
      }
    }
  }
  return new Map([...rows].sort(([a], [b]) => a.localeCompare(b)));
}

/** Is this key one of ours rather than a catalogue key? @param {string} key */
export const isOutside = (key) => key.includes(':');

/**
 * Replace one value in place. Returns the path and new text for the caller to
 * write atomically, or the status and message for a refusal.
 * @param {string} root @param {'en' | 'pl'} locale @param {string} key @param {string} previous @param {string} text
 * @returns {{ file: string, text: string } | { error: 400 | 409, message: string }}
 */
export function replaceOutside(root, locale, key, previous, text) {
  const [prefix, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const source = SOURCES.find((candidate) => candidate.prefix === prefix);
  if (!source) return { error: 400, message: 'Key does not exist.' };
  for (const files of source.files(root)) {
    const current = readFile(root, files[locale], null);
    if (current === null) continue;
    const field = source.format.parse(current).find((candidate) => [files.name, candidate.name].filter(Boolean).join('/') === name);
    if (!field) continue;
    if (field.locked) return { error: 400, message: field.locked };
    if (source.englishOnly === 'skip' && !fieldMap(readFile(root, files.pl, null), source.format).has(field.name)) break;
    if (field.value !== previous) return { error: 409, message: 'Value changed on disk. Reload before saving.' };
    let encoded;
    try { encoded = source.format.encode(text); } catch (error) { return { error: 400, message: /** @type {Error} */ (error).message }; }
    return { file: join(root, files[locale]), text: current.slice(0, field.start) + encoded + current.slice(field.end) };
  }
  return { error: 400, message: 'Key does not exist.' };
}
