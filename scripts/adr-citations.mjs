/* Resolve citations against the tracked ADR index. A numbered citation
   needs a record or a tombstone. A draft needs an explicit ADR prefix or
   path so ordinary draft names stay out of the scan.

   The record check enforces headers, contiguous numbering and the
   1,000-word limit. The public reference checks report private pointers
   by file and line, including links relative to a Markdown file. */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const CITATION = /\b(ADR-\d{4})|(?:\bADR |\bdocs\/adr\/)(draft-[a-z0-9][a-z0-9-]*)/g;
const TOMBSTONE = /^- (?:\*\*)?ADR-(\d{4})(?:\*\*)?:[ \t]*(.*)$/gm;
const SCANNED = ['src', 'tests', 'android'];
const PRIVATE_DOC = /\b(?:(?:DIRECTION|CONTEXT|PRODUCT|SCREENS)\.md|docs\/(?:internal|ui-copy\.md|agents|research|provisioning))\b/g;
const DOC_TOOLS = new Set([
  '.gitignore',
  'scripts/adr-citations.mjs',
  'scripts/check-ai-directories.mjs',
  'scripts/link-docs.mjs',
  'tests/adr-citations.test.ts',
  'tests/ai-directories.test.ts',
  'tests/doc-blocks.test.ts',
  'tests/doc-blocks.ts',
  'tests/link-docs.test.ts'
]);

/** @param {string} adrDir */
export function readAdrIndex(adrDir) {
  const files = readdirSync(adrDir);
  const numbered = new Set(files.filter((f) => /^\d{4}-.+\.md$/.test(f)).map((f) => f.slice(0, 4)));
  const drafts = new Set(files.filter((f) => /^draft-.+\.md$/.test(f)).map((f) => f.slice(0, -3)));
  const readme = join(adrDir, 'README.md');
  const text = existsSync(readme) ? readFileSync(readme, 'utf8') : '';
  const tombstones = new Set();
  const privateTombstones = new Set();
  for (const [, number, destination] of text.matchAll(TOMBSTONE)) {
    tombstones.add(number);
    if (/\bprivate documentation\b/.test(destination) || [...destination.matchAll(PRIVATE_DOC)].length) {
      privateTombstones.add(number);
    }
  }
  return { numbered, drafts, tombstones, privateTombstones };
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
    // The header is the first block after the title: skip the blank line,
    // then read up to the next blank one.
    const lines = text.split('\n').slice(1);
    const start = lines.findIndex((l) => l.trim() !== '');
    const end = lines.findIndex((l, i) => i > start && l.trim() === '');
    const head = start < 0 ? '' : lines.slice(start, end < 0 ? undefined : end).join('\n');
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

const MD_LINK = /\]\(\s*<?([^)\s>]+)/g;

/** Markdown links in tracked files whose target lands in docs/internal, as
    `path:line: target` lines. A link is checked as written from the repo root
    and as resolved from its own folder, fragments and queries dropped.
    @param {string} root @returns {string[]} */
export function internalDocLinks(root) {
  const files = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  /** @type {string[]} */
  const found = [];
  for (const file of files) {
    if (DOC_TOOLS.has(file)) continue;
    let text;
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(MD_LINK)) {
        const target = m[1].split(/[#?]/)[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const resolved = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(dirname(file), target));
        if (/^docs\/internal(\/|$)/.test(resolved)) found.push(`${file}:${i + 1}: ${resolved}`);
      }
    });
  }
  return found;
}

/** Private document names and private ADR tombstones in tracked text.
    Skip the declaration of a tombstone in the ADR index itself.
    @param {string} root @param {string} adrDir @returns {string[]} */
export function privateReferencesInRepo(root, adrDir) {
  const index = readAdrIndex(adrDir);
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  /** @type {string[]} */
  const found = [];
  for (const file of files) {
    if (DOC_TOOLS.has(file)) continue;
    const path = join(root, file);
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue;
    bytes.toString('utf8').split('\n').forEach((line, i) => {
      const location = file + ':' + (i + 1) + ': ';
      for (const [name] of line.matchAll(PRIVATE_DOC)) found.push(location + name);
      for (const citation of line.matchAll(/\bADR-(\d{4})\b/g)) {
        const [id, number] = citation;
        if (file === 'docs/adr/README.md' && /^- (?:\*\*)?$/.test(line.slice(0, citation.index))) continue;
        if (index.privateTombstones.has(number) && !index.numbered.has(number)) {
          found.push(location + id + ' points to private documentation');
        }
      }
    });
  }
  return found;
}
