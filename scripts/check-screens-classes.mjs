/* The ratchet against a stylesheet regrowing into a shared dumping ground
   (phase 5 audit ticket 16, which first cut screens.css from 239 classes to
   under 100 - onboarding, Home, the entry editor, timeline and the heat map
   all moved their own classes into their own <style> blocks; ticket 12
   widened the same check to kit.css and components.css, the repo's third
   and fourth hottest files, after finding they had no ratchet at all).

   A class belongs in one of these three shared sheets when more than one
   consumer reads it. A class only one file ever reads belongs in that
   file's own <style> block instead, where an unused rule is a compiler
   warning (svelte-check's css_unused_selector) rather than silent dead text
   nobody notices for three tickets. So: every class a sheet defines gets a
   consumer count, and a class with exactly one consumer is either recorded
   in that sheet's baseline (its existing long tail, which rides future
   tickets rather than being swept up at once) or marked in that sheet's
   SHARED set (a class one consumer happens to use today but is meant for
   more, or a real consumer this script's grep cannot see), and a genuinely
   new single-consumer class is neither - it fails, with the file to move it
   to named in the message.

   A class with zero consumers anywhere fails outright: nothing marks a
   dead class deliberate, because there is no consumer left to ask about it.

   Consumer counting is a grep over .svelte markup - class="...", class:foo
   directives, and the token boundaries a hyphenated name needs (a naive
   \b treats the hyphen in "kit-heading-action" as a delimiter and matches
   "kit-heading" as a substring of it, which is wrong). It does not read
   .ts helper functions that build a class string themselves
   (GateScreen.svelte's gateBodyClass is one), template literals baked into
   a .ts module (icons.ts's own `class="icon ..."`), a `class={expression}`
   built at runtime (Tile.svelte's and Notice.svelte's ternaries), or a
   class a third-party library injects into the DOM itself (flatpickr's
   default `altInputClass`, or any of its own popup markup) - all of these
   exist in this app and all of them undercount a class's real reach. A
   false "single consumer" or "no consumer" from any of these blind spots
   fails this check same as a real one; fixed the same way, by adding the
   class to that sheet's SHARED with the reason.

   Run `node scripts/check-screens-classes.mjs` to see where all three
   sheets stand, and `node scripts/check-screens-classes.mjs --update` after
   moving a class out (or accepting a new one into a baseline), which
   rewrites every sheet's record. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One ratchet per shared sheet - its own file, baseline record and SHARED
    allow-list, so a class new to kit.css cannot hide behind screens.css's
    long tail or vice versa. */
const SHEETS = [
  {
    file: 'src/lib/styles/screens.css',
    baseline: 'src/lib/styles/screens-classes-baseline.txt',
    shared: new Set([
      /* icons.ts bakes `class="icon ..."` into every icon's own SVG string
         via a template literal, not a .svelte class= attribute -
         screens.css's `.photo-star .icon`/`.starred-photo-unstar .icon`
         rules read a class hundreds of call sites carry. */
      'icon',
      /* GateScreen.svelte's exported gateBodyClass() composes this into six
         gates' own class={...} expressions - never a literal "is-long"
         this script's attribute grep can find. */
      'is-long'
    ])
  },
  {
    file: 'src/lib/styles/kit.css',
    baseline: 'src/lib/styles/kit-classes-baseline.txt',
    shared: new Set([
      /* Tile.svelte:80,91 and Notice.svelte:154,161 each pick one of two
         literal classes with a ternary inside a `class={...}` expression,
         never a literal `class="..."` this script's attribute grep can
         see. */
      'kit-tile-act',
      'kit-notice-act',
      'kit-notice-cta'
    ])
  },
  {
    file: 'src/lib/styles/components.css',
    baseline: 'src/lib/styles/components-classes-baseline.txt',
    shared: new Set([
      /* Same icons.ts blind spot screens.css's SHARED documents - `.icon
         .muted`/`.icon.muted`/`.icon.is-starred` read a class every icon
         carries via a template literal, not a .svelte class= attribute. */
      'icon',
      /* DatePicker.svelte never sets flatpickr's `altInputClass` option, so
         the library falls back to its own default - the visible field it
         creates at runtime carries `form-control` (and, in `.inline`
         calendars, `.selected`/`.today`/`.prevMonthDay`/`.nextMonthDay` on
         the day cells it renders) - none of it a literal our grep can find
         in DatePicker.svelte or anywhere else. */
      'form-control',
      'inline',
      'selected',
      'today',
      'prevMonthDay',
      'nextMonthDay',
      /* flatpickr's own popup markup, themed here rather than replaced -
         same blind spot, the library builds these elements itself. */
      'flatpickr-calendar',
      'flatpickr-months',
      'flatpickr-current-month',
      'flatpickr-monthDropdown-months',
      'flatpickr-monthDropdown-month',
      'flatpickr-prev-month',
      'flatpickr-next-month',
      'flatpickr-weekday',
      'flatpickr-day',
      /* Skeleton.svelte:26 builds `class="skeleton-{variant} stagger-in"` -
         a literal string with an embedded expression, not a bare
         `class="skeleton-card"` this script's token split can match (it
         only accepts tokens made of letters, digits, `_` and `-`, and
         `skeleton-{variant}` fails that on the brace). `card` and `block`
         are two of the three values `variant` takes and are read across
         dozens of screens (search, on-this-day, body-map, EntryEditor,
         and more) - the third, `line`, reuses the sheet's already-shared
         `.skeleton-line`. */
      'skeleton-card',
      'skeleton-block'
    ])
  }
];

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
 * @param {Set<string>} [shared]
 * @param {string} [sheetName]
 * @returns {string[]}
 */
export function classProblems(counts, baseline, shared = new Set(), sheetName = 'the sheet') {
  const problems = [];
  for (const [cls, consumers] of counts) {
    if (shared.has(cls)) continue;
    if (consumers.length === 0) {
      problems.push(`.${cls} has no consumer left anywhere in src/ - delete it from ${sheetName}`);
    } else if (consumers.length === 1 && !baseline.has(cls)) {
      problems.push(`.${cls} has exactly one consumer (${consumers[0]}) - move it there, or add it to SHARED with why`);
    }
  }
  return problems;
}

/** @param {string} baselinePath */
function readBaseline(baselinePath) {
  try {
    return new Set(
      readFileSync(baselinePath, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    );
  } catch {
    return new Set();
  }
}

/**
 * @param {Map<string, string[]>} counts
 * @param {string} baselinePath
 * @param {string} sheetFile
 */
function writeBaseline(counts, baselinePath, sheetFile) {
  const singleConsumer = [...counts]
    .filter(([, consumers]) => consumers.length === 1)
    .map(([cls]) => cls)
    .sort();
  const header = [
    `# Single-consumer classes ${sheetFile} already carried when this check`,
    '# started covering it (or accepted since) - the long tail future tickets',
    '# move out one at a time. Regenerate with `node scripts/check-screens-classes.mjs',
    '# --update` after moving a class out or deliberately accepting a new one.'
  ];
  writeFileSync(baselinePath, [...header, ...singleConsumer, ''].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = walkSvelteFiles('src').map((path) => ({
    path,
    tokens: classTokensIn(readFileSync(path, 'utf8'))
  }));

  const update = process.argv.includes('--update');
  let anyFailed = false;

  for (const { file, baseline: baselinePath, shared } of SHEETS) {
    const sheetClasses = classesIn(readFileSync(file, 'utf8'));
    const counts = consumerCounts(sheetClasses, files);

    if (update) {
      writeBaseline(counts, baselinePath, file);
      const n = [...counts.values()].filter((c) => c.length === 1).length;
      console.log(`Recorded ${n} single-consumer class(es) in ${baselinePath}`);
    } else {
      const baseline = readBaseline(baselinePath);
      const problems = classProblems(counts, baseline, shared, file);
      for (const problem of problems) console.log('FAIL', problem);
      if (problems.length) {
        anyFailed = true;
        console.log(`${problems.length} FAILURE(S) in ${file}\n`);
      } else {
        console.log(`PASS ${sheetClasses.size} class(es) in ${file}, every single-consumer one accounted for`);
      }
    }
  }

  if (anyFailed) process.exit(1);
}
