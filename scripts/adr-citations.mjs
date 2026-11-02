/* Every ADR cited in src, tests and android must exist. ADR-0055 and ADR-0080
   were cited for months with no file behind them and nothing noticed.

   A citation resolves when docs/adr/ holds `NNNN-<slug>.md`, when the ADR
   README carries a tombstone line for the number, or, for a not yet numbered
   ADR, when `draft-<slug>.md` exists. A draft counts as cited only as
   `ADR draft-<slug>` or `docs/adr/draft-<slug>`, because a bare `draft-` is
   also an ordinary word in code (`draft-probe`). A tombstone is a list line that opens
   with the number: `- ADR-0080: ...`.

   adrShapeProblems holds the shape functional audit ticket 55 gave the
   records: every numbered file opens with Status, Decided, Last reviewed and
   Supersedes or Amends lines, stays at 1,000 words or fewer, and every number
   up to the highest is either a file or a tombstone, never both. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CITATION = /\b(ADR-\d{4})|(?:\bADR |\bdocs\/adr\/)(draft-[a-z0-9][a-z0-9-]*)/g;
const TOMBSTONE = /^- (?:\*\*)?ADR-(\d{4})\b/gm;
const SCANNED = ['src', 'tests', 'android'];

/** @param {string} adrDir @returns {{ numbered: Set<string>, drafts: Set<string>, tombstones: Set<string> }} */
export function readAdrIndex(adrDir) {
  const files = readdirSync(adrDir);
  const numbered = new Set(files.filter((f) => /^\d{4}-.+\.md$/.test(f)).map((f) => f.slice(0, 4)));
  const drafts = new Set(files.filter((f) => /^draft-.+\.md$/.test(f)).map((f) => f.slice(0, -3)));
  const readme = join(adrDir, 'README.md');
  const text = existsSync(readme) ? readFileSync(readme, 'utf8') : '';
  const tombstones = new Set([...text.matchAll(TOMBSTONE)].map((m) => m[1]));
  return { numbered, drafts, tombstones };
}

/** @param {string} text @returns {string[]} */
export function citationsIn(text) {
  return [...text.matchAll(CITATION)].map((m) => m[1] ?? m[2]);
}

/** @param {string[]} citations @param {ReturnType<typeof readAdrIndex>} index */
export function unresolved(citations, index) {
  return citations.filter((c) => {
    if (c.startsWith('draft-')) return !index.drafts.has(c);
    const n = c.slice(4);
    return !index.numbered.has(n) && !index.tombstones.has(n);
  });
}

/** Every unresolved citation in the app repo, as `path: citation` lines.
    @param {string} root @param {string} adrDir @returns {string[]} */
export function unresolvedInRepo(root, adrDir) {
  const index = readAdrIndex(adrDir);
  const files = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const found = [];
  for (const file of files) {
    let text;
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    for (const c of new Set(unresolved(citationsIn(text), index))) found.push(`${file}: ${c}`);
  }
  return found;
}

const MAX_WORDS = 1000;
/** @type {Array<[string, RegExp]>} */
const HEADER = [
  ['Status', /^Status: \S/m],
  ['Decided', /^Decided: \d{4}-\d{2}-\d{2}\b/m],
  ['Last reviewed', /^Last reviewed: \d{4}-\d{2}-\d{2}\b/m],
  ['Supersedes or Amends', /^(?:Supersedes|Amends): \S/m]
];

/** Every way docs/adr breaks the record shape, one line each.
    @param {string} adrDir @returns {string[]} */
export function adrShapeProblems(adrDir) {
  const { numbered, tombstones } = readAdrIndex(adrDir);
  const problems = [];
  for (const file of readdirSync(adrDir).filter((f) => /^\d{4}-.+\.md$/.test(f)).sort()) {
    const text = readFileSync(join(adrDir, file), 'utf8');
    const head = text.split('\n').slice(0, 12).join('\n');
    const missing = HEADER.filter(([, re]) => !re.test(head)).map(([name]) => name);
    if (missing.length) problems.push(`${file}: header lacks ${missing.join(', ')}`);
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS) problems.push(`${file}: ${words} words, over ${MAX_WORDS}`);
  }
  for (const n of numbered) if (tombstones.has(n)) problems.push(`ADR-${n}: both a file and a tombstone`);
  const highest = Math.max(0, ...[...numbered].map(Number));
  for (let i = 1; i <= highest; i++) {
    const n = String(i).padStart(4, '0');
    if (!numbered.has(n) && !tombstones.has(n)) problems.push(`ADR-${n}: neither a file nor a tombstone`);
  }
  return problems;
}
