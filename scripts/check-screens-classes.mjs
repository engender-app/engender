/* Check shared classes in screens.css, kit.css and components.css.
   A single-consumer rule belongs in the component's own style block,
   where Svelte can report unused selectors. Existing entries have a
   baseline. SHARED records classes intended for reuse or consumed
   through patterns the scan cannot see.

   The scan counts class tokens and class directives in Svelte markup.
   It misses runtime expressions, JS helpers, inline SVG strings and
   injected classes. Give each exception its reason. Zero consumers
   fails unless an actual consumer is known to be outside the scan.
   Run npm run check:screens-classes to check and pass --update after
   moving a rule out of a shared sheet. */
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
      'is-long',
      /* GateScreen.svelte is the single shell for all six gates; .gate-page:has(.pin-pad)
         centers the PIN pad across the gate window. */
      'gate-page',
      'gate-field',
      'pin-pad',
      'pin-dots'
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
      'kit-notice-cta',
      /* Sibling selector .screen-header + .kit-heading references ScreenHeader */
      'screen-header',
      /* direction-contracts.ts asserts .kit-tile-note-text clamp in kit.css */
      'kit-tile-note-text',
      /* ReadReserve.svelte is the one consumer, but the rule that names them is about the
         heading inside, not the reserve: a.kit-heading first in a reserve body keeps its 40
         unless the reserve is first on the screen. It sits beside kit.css's other
         first-heading rules, at their unscoped specificity, so the cascade between them
         stays readable in one place; a scoped copy in ReadReserve would win on specificity
         alone and hide the interaction. */
      'read-reserve',
      'read-reserve-body',
      /* DayCard's `tight` and EntryDays' per-entry wrapper. One consumer each, but both
         rules are about the day card's own body and rail - `.kit-entry-row` is what the
         rail's first and last segment rules count through - so they sit beside those rules
         in kit.css, where the cascade between them is read in one place. */
      'is-tight',
      'kit-entry-row'
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
      'skeleton-block',
      /* overlayLock.ts adds `is-withdrawn` via classList.add() one rAF after
         `inert`, so the pre-blurred ::after can crossfade in.
         Added in TypeScript, not a .svelte class attribute. */
      'is-withdrawn',
      /* Both nav layouts share the overlay withdrawal rule. The rail's
         desktop instance lives in AppNav.svelte alone. */
      'app-rail'
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
