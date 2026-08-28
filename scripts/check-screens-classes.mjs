/* The ratchet against screens.css regrowing into a shared dumping ground
   (phase 5 audit ticket 16, which first cut it from 239 classes to under
   100 - onboarding, Home, the entry editor, timeline and the heat map all
   moved their own classes into their own <style> blocks).

   A class belongs in screens.css when more than one screen's markup reads
   it. A class only one file ever reads belongs in that file's own <style>
   block instead, where an unused rule is a compiler warning
   (svelte-check's css_unused_selector) rather than silent dead text nobody
   notices for three tickets. So: every class this file defines gets a
   consumer count, and a class with exactly one consumer is either recorded
   in the baseline below (screens.css's existing long tail, which rides
   future screen tickets rather than being swept up here) or marked SHARED
   (a class one screen happens to use today but is meant for more), and a
   genuinely new single-consumer class is neither - it fails, with the file
   to move it to named in the message.

   A class with zero consumers anywhere fails outright: nothing marks a
   dead class deliberate, because there is no screen left to ask about it.

   Consumer counting is a grep over .svelte markup - class="...", class:foo
   directives, and the token boundaries a hyphenated name needs (a naive
   \b treats the hyphen in "kit-heading-action" as a delimiter and matches
   "kit-heading" as a substring of it, which is wrong). It does not read
   .ts helper functions that build a class string themselves
   (GateScreen.svelte's gateBodyClass is one) or template literals baked
   into a .ts module (icons.ts's own `class="icon ..."`) - both exist in
   this app and both undercount a class's real reach. A false "single
   consumer" from either blind spot fails this check same as a real one;
   fixed the same way, by adding the class to SHARED with the reason.

   Run `node scripts/check-screens-classes.mjs` to see where it stands, and
   `node scripts/check-screens-classes.mjs --update` after moving a class
   out (or accepting a new one into the baseline), which rewrites the
   record. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEET = 'src/lib/styles/screens.css';
const BASELINE = 'src/lib/styles/screens-classes-baseline.txt';

/** Classes this check's consumer count cannot be trusted for, each with
    why - either genuinely meant for reuse and not reached for again yet,
    or (as below) real consumers this script's grep cannot see, which would
    otherwise misreport as single-consumer or as dead outright. */
const SHARED = new Set([
  /* icons.ts bakes `class="icon ..."` into every icon's own SVG string via
     a template literal, not a .svelte class= attribute - screens.css's
     `.photo-star .icon`/`.starred-photo-unstar .icon` rules read a class
     hundreds of call sites carry. */
  'icon',
  /* GateScreen.svelte's exported gateBodyClass() composes this into six
     gates' own class={...} expressions - never a literal "is-long" this
     script's attribute grep can find. */
  'is-long'
]);

/**
 * Every class token named in a CSS selector prelude in the sheet.
 * @param {string} css
 * @returns {Set<string>}
 */
export function classesIn(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Set();
  const preludeRe = /(^|\})\s*([^{}]+)\s*\{/g;
  let m;
  while ((m = preludeRe.exec(noComments))) {
    const tokens = m[2].match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) ?? [];
    for (const t of tokens) classes.add(t.slice(1));
  }
  return classes;
}

/**
 * The literal class tokens a .svelte file's own markup carries - a real
 * class="..."/classList="..." attribute or a class:foo directive, never a
 * bare occurrence of the word (screens.css class names are often ordinary
 * English words like "home" that match prose and script identifiers).
 * @param {string} source
 * @returns {Set<string>}
 */
export function classTokensIn(source) {
  const tokens = new Set();
  for (const m of source.matchAll(/\bclass(?:List)?=(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
    const body = m[1] ?? m[2] ?? m[3] ?? '';
    for (const t of body.split(/\s+/)) if (t && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(t)) tokens.add(t);
  }
  for (const m of source.matchAll(/\bclass:([a-zA-Z][a-zA-Z0-9_-]*)/g)) tokens.add(m[1]);
  return tokens;
}

/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walkSvelteFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walkSvelteFiles(p, out);
    else if (entry.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/**
 * @param {Set<string>} sheetClasses
 * @param {{ path: string; tokens: Set<string> }[]} files
 * @returns {Map<string, string[]>} class name -> consuming file paths
 */
export function consumerCounts(sheetClasses, files) {
  const counts = new Map();
  for (const cls of sheetClasses) {
    counts.set(
      cls,
      files.filter(({ tokens }) => tokens.has(cls)).map(({ path }) => path)
    );
  }
  return counts;
}

/**
 * @param {Map<string, string[]>} counts
 * @param {Set<string>} baseline
 * @returns {string[]}
 */
export function classProblems(counts, baseline) {
  const problems = [];
  for (const [cls, consumers] of counts) {
    if (SHARED.has(cls)) continue;
    if (consumers.length === 0) {
      problems.push(`.${cls} has no consumer left anywhere in src/ - delete it from ${SHEET}`);
    } else if (consumers.length === 1 && !baseline.has(cls)) {
      problems.push(`.${cls} has exactly one consumer (${consumers[0]}) - move it there, or add it to SHARED with why`);
    }
  }
  return problems;
}

function readBaseline() {
  try {
    return new Set(
      readFileSync(BASELINE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    );
  } catch {
    return new Set();
  }
}

/** @param {Map<string, string[]>} counts */
function writeBaseline(counts) {
  const singleConsumer = [...counts]
    .filter(([, consumers]) => consumers.length === 1)
    .map(([cls]) => cls)
    .sort();
  const header = [
    '# Single-consumer classes screens.css already carried when ticket 16 added',
    '# this check (or accepted since) - the long tail future screen tickets move',
    '# out one at a time. Regenerate with `node scripts/check-screens-classes.mjs',
    '# --update` after moving a class out or deliberately accepting a new one.'
  ];
  writeFileSync(BASELINE, [...header, ...singleConsumer, ''].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sheetClasses = classesIn(readFileSync(SHEET, 'utf8'));
  const files = walkSvelteFiles('src').map((path) => ({
    path,
    tokens: classTokensIn(readFileSync(path, 'utf8'))
  }));
  const counts = consumerCounts(sheetClasses, files);

  if (process.argv.includes('--update')) {
    writeBaseline(counts);
    const n = [...counts.values()].filter((c) => c.length === 1).length;
    console.log(`Recorded ${n} single-consumer class(es) in ${BASELINE}`);
  } else {
    const baseline = readBaseline();
    const problems = classProblems(counts, baseline);
    for (const problem of problems) console.log('FAIL', problem);
    if (problems.length) {
      console.log(`\n${problems.length} FAILURE(S)`);
      process.exit(1);
    }
    console.log(`PASS ${sheetClasses.size} class(es) in ${SHEET}, every single-consumer one accounted for`);
  }
}
