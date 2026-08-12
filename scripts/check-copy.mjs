/* Two checks over the app's copy, run on every pull request (phase 2 ticket
   06, which wires up what ticket 19 then relies on):

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

   Run `node scripts/check-copy.mjs` to see where it stands, and
   `node scripts/check-copy.mjs --update` after moving copy into the
   catalogues, which rewrites the record. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';

const BASELINE = 'messages/untranslated-literals.txt';

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
 * Keys one catalogue has and the other does not, in both directions.
 *
 * @param {Record<string, unknown>} en
 * @param {Record<string, unknown>} pl
 * @returns {string[]}
 */
export function catalogueProblems(en, pl) {
  // The inlang schema pointer sits alongside the messages and is not one.
  /** @type {(catalogue: Record<string, unknown>) => string[]} */
  const keys = (catalogue) => Object.keys(catalogue).filter((key) => !key.startsWith('$'));
  const enKeys = keys(en);
  const plKeys = keys(pl);

  return [
    ...enKeys.filter((key) => !plKeys.includes(key)).map((key) => `${key} is missing from messages/pl.json`),
    ...plKeys.filter((key) => !enKeys.includes(key)).map((key) => `${key} is missing from messages/en.json`)
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
    if (type === 'ExpressionTag' || type === 'Comment') return;
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
    '# down. DemoBar.svelte is the one entry that stays: it is compiled out of',
    '# production builds, so its copy never reaches a reader.',
    ''
  ];
  const lines = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `${count} ${file}`);
  writeFileSync(BASELINE, [...header, ...lines, ''].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.svelte'));

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

  const problems = [
    ...catalogueProblems(
      JSON.parse(readFileSync('messages/en.json', 'utf8')),
      JSON.parse(readFileSync('messages/pl.json', 'utf8'))
    ),
    ...ratchetProblems(counts, readBaseline())
  ];

  for (const problem of problems) console.log('FAIL', problem);
  if (problems.length) {
    console.log(`\n${problems.length} FAILURE(S)`);
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`PASS both catalogues hold the same keys`);
  console.log(`PASS no new user-facing literals (${total} known, in ${Object.keys(counts).length} file(s))`);
}
