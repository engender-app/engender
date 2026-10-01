/* Five checks over the app's copy, run on every pull request (phase 2 ticket
   06, which wires up what ticket 19 then relies on; the third check added by
   phase 5 ticket 05; the fourth by phase 8 deepening ticket 05; the fifth by
   phase 12 copy-tooling ticket 01):

   1. The two catalogues hold the same keys. A key present in English and
      missing in Polish is not an error anywhere else - paraglide falls back to
      the base locale - so it ships as English text shown to a Polish reader.
      A key the source actually calls and no catalogue has is already a type
      error, since paraglide generates one function per key; `npm run check`
      catches that one and this does not repeat it.

   2. No screen grows new user-facing text that never reaches the catalogues.
      There are hundreds of such literals today, from the phase 0 and phase 1
      screens, so the check is a ratchet against a recorded count per file
      rather than a rule that could pass now: nothing may go up, and anything
      that goes down is recorded. messages/untranslated-literals.txt is that
      record, and it is the number tickets 19 and 23 work down.

   3. No Polish string genders the reader (docs/ui-copy.md, "The reader has no
      gender here"). Polish inflects second-person past tense for gender, so a
      word ending in "-łaś" always addresses the reader as a woman - that
      ending is specific enough to flag anywhere it appears. A predicate
      adjective aimed at the reader genders just as surely ("jesteś dumna"),
      but a general pattern for that catches adjectives that agree with an
      ordinary feminine noun instead ("niepewna ... krzywa", "wersja ...
      gotowa"), so this check only flags a short, named list of forms already
      found addressing the reader rather than every feminine adjective ending.

   4. No catalogue key sits with no shipped caller. The other direction - a key the
      source calls and no catalogue has - is already a type error, since
      paraglide generates one function per key; `npm run check` catches that
      one. A key the catalogue has and nothing calls is invisible to every
      other check here and to the typechecker both, and it happens in
      clusters: ticket 16's kit contract orphaned twelve `*_row_aria` keys at
      once when `ListRow`/`RecordSheet` started deriving a row's accessible
      name from `title` instead. There is no dynamic `m[...]` or
      `messages[...]` access in `src/`, so reading `m.<key>`/`messages.<key>`
      as plain text out of shipped `.svelte`/`.ts`/`.js` files is a sound
      scan - not an approximation of one - and needs no new parser: a
      built-in's wording can be reached only through
      `src/lib/data/vocabulary/vocabulary.ts` (ADR-0024) and still read as
      `m.<key>` by name one layer down, in `labels.ts`, where the text scan
      finds it same as anywhere else. DEAD_ALLOW exists for the rarer case a
      plain-text scan genuinely cannot see - each entry carries its reason.

   5. Both catalogues are in the order scripts/catalogue.mjs writes: `$schema`
      first, keys sorted. Branches that each append a key at the end of an
      unsorted file collide on merge; sorted keys scatter the insertions.

   Run `node scripts/check-copy.mjs` to see where it stands, and
   `node scripts/check-copy.mjs --update` after moving copy into the
   catalogues, which rewrites the record. `--fix` rewrites a catalogue that
   is out of serializer order (scripts/catalogue.mjs) in place. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import { isSerialized, serializeCatalogue } from './catalogue.mjs';

const BASELINE = 'messages/untranslated-literals.txt';
const CATALOGUES = ['messages/en.json', 'messages/pl.json'];

/** Attributes a person reads or hears. The rest are for the machine. */
const SPOKEN_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'alt',
  'placeholder',
  'title',
  // Components in this app take their copy through these two.
  'label',
  'text'
]);

/** At least one letter, in any alphabet. Separators and arrows are not copy. */
const A_WORD = /\p{L}/u;

/**
 * Feminine predicate adjectives already found addressing the reader
 * directly, rather than agreeing with an ordinary feminine noun nearby
 * ("jesteś dumna" vs "wersja jest gotowa"). Kept short and literal on
 * purpose - see the file header.
 */
const GENDERED_READER_ADJECTIVES = new Set(['dumna', 'zauważona']);

/**
 * Catalogue keys the text scan below cannot see a caller for, kept anyway.
 * Every entry needs a reason, the way the CSS ratchet's `SHARED` set does.
 */
const DEAD_ALLOW = new Map();

/**
 * Files the literal ratchet does not read, and why. Every entry needs a
 * reason, the way DEAD_ALLOW above and the CSS ratchet's `SHARED` set do.
 *
 * The ratchet is a rule about screens, and a screen's literal is text a
 * reader can end up looking at. DemoBar is not one: it is the review-only
 * control strip, `__DEMO__` compiles it out of a production build, and
 * verify-build.mjs greps the emitted JavaScript and CSS to prove its copy
 * is not in there. Recorded rather than exempt until phase 9 audit ticket
 * 12, which is when the cost showed: the count had climbed 15 -> 16 on a
 * demo control added by another ticket, and a ratchet that turns "add a
 * jump button" into "re-record a copy baseline" is asking sessions to
 * update a number nobody reads instead of catching copy a reader could see.
 */
const UNSCANNED = new Map([
  [
    'src/lib/components/DemoBar.svelte',
    'review-only, compiled out of production builds - verify-build.mjs proves its copy never ships'
  ]
]);

/**
 * Keys one catalogue has and the other does not, in both directions.
 *
 * @param {Record<string, unknown>} en
 * @param {Record<string, unknown>} pl
 * @returns {string[]}
 */
export function catalogueProblems(en, pl) {
  return missingKeyFindings(en, pl).map(({ message }) => message);
}

/** @param {Record<string, unknown>} en @param {Record<string, unknown>} pl */
function missingKeyFindings(en, pl) {
  // The inlang schema pointer sits alongside the messages and is not one.
  /** @type {(catalogue: Record<string, unknown>) => string[]} */
  const keys = (catalogue) => Object.keys(catalogue).filter((key) => !key.startsWith('$'));
  const enKeys = keys(en);
  const plKeys = keys(pl);

  return [
    ...enKeys.filter((key) => !plKeys.includes(key)).map((key) => ({ key, message: `${key} is missing from messages/pl.json` })),
    ...plKeys.filter((key) => !enKeys.includes(key)).map((key) => ({ key, message: `${key} is missing from messages/en.json` }))
  ];
}

/**
 * Catalogues whose text is not what scripts/catalogue.mjs would write: keys
 * out of order, or the formatting drifted. Sorted keys are what keep parallel
 * branches from colliding on the same spot at the end of the file.
 *
 * @param {Record<string, string>} texts  file path to file contents
 * @returns {string[]}
 */
export function catalogueOrderProblems(texts) {
  return Object.entries(texts)
    .filter(([, text]) => !isSerialized(text))
    .map(([file]) => `${file} is not in serializer order. Run \`npm run check:copy -- --fix\`.`);
}

/**
 * Rewrites, in place, each catalogue that is not in serializer order.
 *
 * @param {string[]} files
 */
export function fixCatalogues(files) {
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!isSerialized(text)) writeFileSync(file, serializeCatalogue(JSON.parse(text)));
  }
}

/**
 * Polish strings that gender the reader: a word ending in "-łaś" (the
 * feminine second-person past-tense clitic, e.g. "czułaś", "zapisałaś") or
 * a known feminine predicate adjective aimed at the reader.
 *
 * @param {Record<string, unknown>} pl
 * @returns {string[]}
 */
export function genderedReaderProblems(pl) {
  return genderedReaderFindings(pl).map(({ message }) => message);
}

/** @param {Record<string, unknown>} pl */
function genderedReaderFindings(pl) {
  const problems = [];
  for (const [key, value] of Object.entries(pl)) {
    if (key.startsWith('$') || typeof value !== 'string') continue;
    const words = value.match(/\p{L}+/gu) ?? [];
    for (const word of words) {
      const lower = word.toLowerCase();
      if (lower.endsWith('łaś') || GENDERED_READER_ADJECTIVES.has(lower)) {
        problems.push({ key, message: `${key} genders the reader: "${word}" in messages/pl.json` });
      }
    }
  }
  return problems;
}

/**
 * Every `m.<key>` / `messages.<key>` identifier called anywhere in the given
 * files, read as plain text rather than parsed - see the file header for why
 * that is sound here.
 *
 * @param {string[]} files
 * @returns {Set<string>}
 */
export function collectReferencedKeys(files) {
  return new Set(collectReferenceSites(files).keys());
}

/** @param {string[]} files @returns {Map<string, { file: string, line: number }[]>} */
export function collectReferenceSites(files) {
  const sites = new Map();
  const pattern = /\b(?:m|messages)\.([A-Za-z_$][A-Za-z0-9_$]*)/g;
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(pattern)) {
        if (!sites.has(match[1])) sites.set(match[1], []);
        sites.get(match[1]).push({ file, line: index + 1 });
      }
    }
  }
  return sites;
}

/** The same shipped-source list for the CLI and the local strings page.
 * @param {string} root @returns {string[]} */
export function copySourceFiles(root = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z', 'src'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((file) => /\.(svelte|ts|js)$/.test(file)).map((file) => resolve(root, file));
}

/**
 * Catalogue keys no file calls by name and DEAD_ALLOW does not explain.
 *
 * @param {Record<string, unknown>} catalogue
 * @param {Set<string>} referenced
 * @param {Map<string, string>} allowList
 * @returns {string[]}
 */
export function deadKeyProblems(catalogue, referenced, allowList) {
  return deadKeyFindings(catalogue, referenced, allowList).map(({ message }) => message);
}

/** @param {Record<string, unknown>} catalogue @param {Set<string>} referenced
 * @param {Map<string, string>} allowList */
function deadKeyFindings(catalogue, referenced, allowList) {
  return Object.keys(catalogue)
    .filter((key) => !key.startsWith('$') && !referenced.has(key) && !allowList.has(key))
    .map((key) => ({ key, message: `${key} is in the catalogues but nothing calls m.${key} or messages.${key}` }));
}

/** Row findings shared by check:copy and the strings page.
 * @param {Record<string, unknown>} en @param {Record<string, unknown>} pl
 * @param {Set<string>} referenced @returns {{ key: string, message: string }[]} */
export function catalogueFindings(en, pl, referenced) {
  return [
    ...missingKeyFindings(en, pl),
    ...genderedReaderFindings(pl),
    ...deadKeyFindings({ ...en, ...pl }, referenced, DEAD_ALLOW)
  ];
}

/**
 * User-facing text written straight into a Svelte file's markup, from the
 * parsed template rather than by pattern-matching the source: a template
 * knows the difference between a text node, an expression, a comment and the
 * script block, and a regular expression over the file does not.
 *
 * @param {string} source
 * @returns {{ text: string, attribute: string | null, line: number }[]}
 */
export function findLiterals(source) {
  /** @type {{ text: string, attribute: string | null, line: number }[]} */
  const found = [];
  // The script and style blocks hang off the root separately from the
  // template, so walking the template alone never reaches them.
  const { fragment } = parse(source, { modern: true });
  /** @type {(offset: number) => number} */
  const lineOf = (offset) => source.slice(0, offset).split('\n').length;

  /** @type {(node: unknown, attribute: string | null) => void} */
  const walk = (node, attribute) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return void node.forEach((child) => walk(child, attribute));

    const { type } = /** @type {{ type?: string }} */ (node);
    if (type === 'Text') {
      const { data, start } = /** @type {{ data: string, start: number }} */ (node);
      const text = data.trim();
      if (text && A_WORD.test(text)) found.push({ text, attribute, line: lineOf(start) });
      return;
    }
    // An expression is code, and a comment is for whoever reads the file.
    // `style:--x="{n}px"` parses to a StyleDirective whose value is the same
    // mixed text+expression shape as an attribute's, so its trailing "px" is
    // CSS, not something anyone reads.
    if (type === 'ExpressionTag' || type === 'Comment') return;
    if (type === 'StyleDirective') return;
    if (type === 'Attribute') {
      const { name, value } = /** @type {{ name: string, value: unknown }} */ (node);
      if (SPOKEN_ATTRIBUTES.has(name)) walk(value, name);
      return;
    }

    for (const value of Object.values(node)) walk(value, attribute);
  };

  walk(fragment, null);
  return found;
}

/**
 * How the counts differ from the record, in either direction.
 *
 * @param {Record<string, number>} counts    what the files hold now
 * @param {Record<string, number>} baseline  what the record says
 * @returns {string[]}
 */
export function ratchetProblems(counts, baseline) {
  const problems = [];
  for (const file of [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort()) {
    const now = counts[file] ?? 0;
    const recorded = baseline[file] ?? 0;
    if (now > recorded) {
      problems.push(
        `${file} has ${now} user-facing literal(s) outside the catalogues, up from ${recorded}. ` +
          'Add the new copy to messages/en.json and messages/pl.json.'
      );
    } else if (now < recorded) {
      problems.push(
        `${file} is down to ${now} from ${recorded}. Run \`node scripts/check-copy.mjs --update\` ` +
          'so the count cannot climb back.'
      );
    }
  }
  return problems;
}

/** The record, as a file. Sorted by path, so a diff shows only real movement. */
function readBaseline() {
  /** @type {Record<string, number>} */
  const baseline = {};
  for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [count, file] = line.trim().split(/\s+/);
    baseline[file] = Number(count);
  }
  return baseline;
}

/** @param {Record<string, number>} counts */
function writeBaseline(counts) {
  const header = [
    '# Screens with user-facing text written straight into the markup instead of',
    '# coming from messages/en.json and messages/pl.json, and how many literals',
    '# each one still has. Checked on every pull request by scripts/check-copy.mjs:',
    '# a count may not go up, and one that goes down is recorded here with',
    '# `node scripts/check-copy.mjs --update`.',
    '#',
    '# Phase 0 and phase 1 left these behind, and tickets 19 and 23 work them',
    '# down. Files the ratchet does not read at all are named in the script,',
    "# under UNSCANNED, each with the reason it is not a screen's copy.",
    ''
  ];
  const lines = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `${count} ${file}`);
  writeFileSync(BASELINE, [...header, ...lines, ''].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const refFiles = copySourceFiles();
  const files = refFiles.map((file) => relative(process.cwd(), file))
    .filter((file) => file.endsWith('.svelte') && !UNSCANNED.has(file));

  /** @type {Record<string, number>} */
  const counts = {};
  for (const file of files) {
    const literals = findLiterals(readFileSync(file, 'utf8'));
    if (literals.length) counts[file] = literals.length;
  }

  if (process.argv.includes('--update')) {
    writeBaseline(counts);
    console.log(`Recorded ${Object.values(counts).reduce((a, b) => a + b, 0)} literal(s) in ${BASELINE}`);
    process.exit(0);
  }

  if (process.argv.includes('--fix')) fixCatalogues(CATALOGUES);

  const enCatalogue = JSON.parse(readFileSync('messages/en.json', 'utf8'));
  const plCatalogue = JSON.parse(readFileSync('messages/pl.json', 'utf8'));
  const referenced = collectReferencedKeys(refFiles);
  const problems = [
    ...catalogueOrderProblems(Object.fromEntries(CATALOGUES.map((file) => [file, readFileSync(file, 'utf8')]))),
    ...ratchetProblems(counts, readBaseline()),
    ...catalogueFindings(enCatalogue, plCatalogue, referenced).map(({ message }) => message)
  ];

  for (const problem of problems) console.log('FAIL', problem);
  if (problems.length) {
    console.log(`\n${problems.length} FAILURE(S)`);
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('PASS both catalogues are in serializer order');
  console.log('PASS both catalogues hold the same keys');
  console.log(
    `PASS no new user-facing literals (${total} known, in ${Object.keys(counts).length} file(s), ` +
      `${UNSCANNED.size} file(s) not scanned)`
  );
  console.log('PASS no Polish string genders the reader');
  console.log(`PASS no catalogue key sits with no caller (${referenced.size} referenced, ${DEAD_ALLOW.size} allow-listed)`);
}
