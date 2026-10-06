// Copy that lives outside messages/*.json: Android resources, the web
// manifests, the store listing and the privacy policy. Each source is read
// as named values with their exact place in the file, so the strings page can
// show English beside Polish and write one value back without reformatting
// anything around it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const INSTALL = 'Android, store and web install';

/** @typedef {{ name: string, value: string, start: number, end: number }} Field */
/** @typedef {{ parse: (text: string) => Field[], encode: (value: string) => string }} Format */

/** @type {Format} */
const androidXml = {
  parse(text) {
    /** @type {Field[]} */
    const fields = [];
    for (const match of text.matchAll(/<string name="([^"]+)">([^<]*)<\/string>/g)) {
      const start = match.index + match[0].indexOf('>') + 1;
      fields.push({ name: match[1], value: decodeXml(match[2]), start, end: start + match[2].length });
    }
    for (const array of text.matchAll(/<string-array name="([^"]+)">([\s\S]*?)<\/string-array>/g)) {
      const bodyStart = array.index + array[0].indexOf('>') + 1;
      let n = 0;
      for (const item of array[2].matchAll(/<item>([^<]*)<\/item>/g)) {
        const start = bodyStart + item.index + '<item>'.length;
        fields.push({ name: `${array[1]}.${++n}`, value: decodeXml(item[1]), start, end: start + item[1].length });
      }
    }
    return fields;
  },
  encode: (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll("'", "\\'").replaceAll('"', '\\"')
};

/** @param {string} raw */
function decodeXml(raw) {
  return raw.replaceAll("\\'", "'").replaceAll('\\"', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** Top-level name, short_name and description, then the same inside each shortcut. */
/** @type {Format} */
const manifest = {
  parse(text) {
    const shortcuts = text.indexOf('"shortcuts"');
    /** @type {Field[]} */
    const fields = [];
    let shortcut = 0;
    for (const match of text.matchAll(/"(name|short_name|description)":\s*("(?:[^"\\]|\\.)*")/g)) {
      const start = match.index + match[0].length - match[2].length;
      const inShortcut = shortcuts !== -1 && match.index > shortcuts;
      if (inShortcut && match[1] === 'name') shortcut++;
      fields.push({
        name: inShortcut ? `shortcuts.${shortcut}.${match[1]}` : match[1],
        value: JSON.parse(match[2]), start, end: start + match[2].length
      });
    }
    return fields;
  },
  encode: (value) => JSON.stringify(value)
};

/** The whole file is one value; its trailing newline stays outside it. */
/** @type {Format} */
const plainText = {
  parse(text) {
    const value = text.replace(/\n+$/, '');
    return [{ name: '', value, start: 0, end: value.length }];
  },
  encode: (value) => value
};

/** Paragraphs separated by blank lines, numbered from 01. */
/** @type {Format} */
const paragraphs = {
  parse(text) {
    return [...text.matchAll(/[^\n]+(?:\n[^\n]+)*/g)]
      .filter((match) => match[0].trim())
      .map((match, index) => ({
        name: String(index + 1).padStart(2, '0'), value: match[0], start: match.index, end: match.index + match[0].length
      }));
  },
  encode: (value) => {
    if (!value.trim() || /\n\s*\n/.test(value)) throw new Error('A paragraph cannot be empty or contain a blank line.');
    return value;
  }
};

/** @typedef {{ prefix: string, theme: string, format: Format, files: (root: string) => { name: string, en: string, pl: string }[] }} Source */

/** @param {string} en @param {string} pl @returns {Source['files']} */
const pair = (en, pl) => () => [{ name: '', en, pl }];

/** @type {Source[]} */
const SOURCES = [
  { prefix: 'android', theme: INSTALL, format: androidXml,
    files: pair('android/app/src/main/res/values/strings.xml', 'android/app/src/main/res/values-pl/strings.xml') },
  { prefix: 'manifest', theme: INSTALL, format: manifest,
    files: pair('static/manifest.webmanifest', 'static/manifest-pl.webmanifest') },
  { prefix: 'notes-manifest', theme: INSTALL, format: manifest,
    files: pair('static/manifest-notes.webmanifest', 'static/manifest-notes-pl.webmanifest') },
  { prefix: 'store', theme: INSTALL, format: plainText, files(root) {
    const base = 'fastlane/metadata/android';
    /** @param {string} dir @returns {string[]} */
    const list = (dir) => existsSync(join(root, dir)) ? readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.txt')) : [];
    return [...new Set([...list(`${base}/en-US`), ...list(`${base}/pl-PL`)])].map((file) => ({
      name: file.replace(/\.txt$/, ''), en: `${base}/en-US/${file}`, pl: `${base}/pl-PL/${file}`
    }));
  } },
  { prefix: 'privacy', theme: 'Privacy policy', format: paragraphs,
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

/**
 * Every value that exists in Polish, keyed `<prefix>:<file>/<name>`, with its
 * English and where both live. Values with no Polish counterpart are not copy
 * (package names, the untranslated app name) and stay out.
 * @param {string} root @param {string | null} ref git ref to read instead of the disk
 */
export function readOutside(root, ref = null) {
  /** @type {Map<string, { theme: string, en: string | null, pl: string, sites: { file: string, line: number }[] }>} */
  const rows = new Map();
  for (const source of SOURCES) {
    for (const files of source.files(root)) {
      const texts = { en: readFile(root, files.en, ref), pl: readFile(root, files.pl, ref) };
      if (texts.pl === null) continue;
      const en = new Map((texts.en === null ? [] : source.format.parse(texts.en)).map((field) => [field.name, field]));
      for (const field of source.format.parse(texts.pl)) {
        const name = [files.name, field.name].filter(Boolean).join('/');
        const english = en.get(field.name);
        rows.set(`${source.prefix}:${name}`, {
          theme: source.theme, en: english?.value ?? null, pl: field.value,
          sites: [
            ...(english && texts.en ? [{ file: files.en, line: lineAt(texts.en, english.start) }] : []),
            { file: files.pl, line: lineAt(texts.pl, field.start) }
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
 * write atomically, or throws a message the caller turns into a 400 or 409.
 * @param {string} root @param {'en' | 'pl'} locale @param {string} key @param {string} previous @param {string} text
 * @returns {{ file: string, text: string } | { error: 400 | 409, message: string }}
 */
export function replaceOutside(root, locale, key, previous, text) {
  const [prefix, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const source = SOURCES.find((candidate) => candidate.prefix === prefix);
  if (!source || !readOutside(root).has(key)) return { error: 400, message: 'Key does not exist.' };
  for (const files of source.files(root)) {
    const file = files[locale];
    const current = readFile(root, file, null);
    if (current === null) continue;
    const field = source.format.parse(current).find((candidate) => [files.name, candidate.name].filter(Boolean).join('/') === name);
    if (!field) continue;
    if (field.value !== previous) return { error: 409, message: 'Value changed on disk. Reload before saving.' };
    let encoded;
    try { encoded = source.format.encode(text); } catch (error) { return { error: 400, message: /** @type {Error} */ (error).message }; }
    return { file: join(root, file), text: current.slice(0, field.start) + encoded + current.slice(field.end) };
  }
  return { error: 400, message: 'Key does not exist.' };
}
