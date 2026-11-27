import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import ts from 'typescript';

const EXTENSIONS = new Set(['.css', '.html', '.java', '.js', '.mjs', '.svelte', '.ts', '.xml']);
const INTERNAL_REFERENCE = new RegExp([
  /\b(?:tickets?[\s-]+#?(?:[a-z]+-)*[a-z]*\d+|phase[\s-]+\d+|(?:bug|interactive)[\s-]+session|pre-release-human|ux-carpet|tester[\s-]+report|Alicja)\b/,
  /\b(?:(?:functional|final|last|sec|security)[\s-]+audit|sign[\s-]+off|prh[\s-]?\d+)\b/,
  /\b(?:after-release|pre-release|after-rc1|final-audit|(?:re-check[ -])?carpet|audit item|bug|issue|redesign|release blockers)[\s-]+\d+\b/,
  /\bitem\s+\d+\b|\baudit\s+(?:finding\s+)?(?:(?:UI|A11Y)[\s-]+)?[A-Z]+-?\d+\b/,
  /\b(?:(?:CARPET|AU|FA|GD|UI|UX|A11Y|PERF)[ -]\d+|L\d{2}-\d{2})\b/,
  /\.scratch\/|\b(?:CONTEXT|DIRECTION|PRODUCT|SCREENS|DESIGN)\.md\b|\bdocs\/(?:agents\/|internal\/|research\/|ui-copy\.md)/
].map((pattern) => pattern.source).join('|'), 'gi');

/** @typedef {{ start: number, end: number }} Range */

/** @param {string} file @param {string} source @returns {Range[]} */
function scriptComments(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  /** @type {Map<number, Range>} */
  const comments = new Map();
  /** @type {Set<number>} */
  const leading = new Set();
  /** @type {Set<number>} */
  const trailing = new Set();
  /** @param {ts.Node} node */
  function walk(node) {
    // JSDoc children are prose and can contain snippets that look like new comments.
    if (ts.isJSDoc(node)) return;
    if (!leading.has(node.pos)) {
      leading.add(node.pos);
      for (const { pos, end } of ts.getLeadingCommentRanges(source, node.pos) ?? []) {
        comments.set(pos, { start: pos, end });
      }
    }
    if (!trailing.has(node.end)) {
      trailing.add(node.end);
      for (const { pos, end } of ts.getTrailingCommentRanges(source, node.end) ?? []) {
        comments.set(pos, { start: pos, end });
      }
    }
    for (const child of node.getChildren(tree)) walk(child);
  }
  walk(tree);
  return [...comments.values()];
}

/** @param {string} source @param {boolean} lineComments @returns {Range[]} */
function cssOrJavaComments(source, lineComments) {
  const tokens = [
    String.raw`"""(?:\\[\s\S]|(?!""")[\s\S])*"""`,
    String.raw`"(?:\\[\s\S]|[^"\\])*"`,
    String.raw`'(?:\\[\s\S]|[^'\\])*'`,
    String.raw`/\*[\s\S]*?\*/`
  ];
  if (lineComments) tokens.push(String.raw`//[^\r\n]*`);
  return [...source.matchAll(new RegExp(tokens.join('|'), 'g'))]
    .filter((match) => match[0].startsWith('/'))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

/** @param {string} source @returns {Range[]} */
function markupComments(source) {
  const tags = /<!--[\s\S]*?-->|<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/\1\s*>|<(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  /** @type {Range[]} */
  const comments = [];
  for (const match of source.matchAll(tags)) {
    const [text, tag, body] = match;
    if (text.startsWith('<!--')) comments.push({ start: match.index, end: match.index + text.length });
    if (!tag) continue;
    const offset = match.index + text.lastIndexOf('</') - body.length;
    const ranges = tag.toLowerCase() === 'script' ? scriptComments('script.js', body) : cssOrJavaComments(body, false);
    for (const { start, end } of ranges) comments.push({ start: offset + start, end: offset + end });
  }
  return comments;
}

/** @param {string} source @returns {Range[]} */
function svelteComments(source) {
  const tree = parse(source, { modern: true });
  const comments = tree.comments.map(({ start, end }) => ({ start, end }));
  /** @param {unknown} node */
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if ('type' in node && node.type === 'Comment' && 'start' in node && 'end' in node &&
      typeof node.start === 'number' && typeof node.end === 'number') {
      comments.push({ start: node.start, end: node.end });
      return;
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(tree.fragment);
  if (tree.css) {
    const { styles, start: offset } = tree.css.content;
    for (const { start, end } of cssOrJavaComments(styles, false)) {
      comments.push({ start: offset + start, end: offset + end });
    }
  }
  return comments;
}

/** @param {string} file @param {string} source @returns {Range[]} */
export function commentRanges(file, source) {
  const extension = extname(file);
  let ranges;
  switch (extension) {
    case '.md': ranges = [{ start: 0, end: source.length }]; break;
    case '.svelte': ranges = svelteComments(source); break;
    case '.css': case '.java': ranges = cssOrJavaComments(source, extension === '.java'); break;
    case '.html': case '.xml': ranges = markupComments(source); break;
    default: ranges = scriptComments(file, source);
  }
  if (file === 'src/lib/data/sqlite/schema.ts') {
    for (const match of source.matchAll(/^--[^\r\n]*(?:\r?\n--[^\r\n]*)*/gm)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** @param {string} file @param {string} source */
export function countReferences(file, source) {
  return commentRanges(file, source).reduce((count, { start, end }) => {
    const prose = source.slice(start, end).replace(/\n[ \t]*\*(?!\/)/g, '\n');
    return count + [...prose.matchAll(INTERNAL_REFERENCE)].length;
  }, 0);
}

export function commentSourceFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', 'src', 'tests', 'android/app/src', 'scripts',
    ':(top,glob)*.config.*', 'ARCHITECTURE.md'], { encoding: 'utf8' })
    .split('\0').filter((file) => (file === 'ARCHITECTURE.md' || EXTENSIONS.has(extname(file))) && existsSync(file));
}

function main() {
  for (const file of commentSourceFiles()) {
    let count;
    try {
      count = countReferences(file, readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot scan comments in ${file}`, { cause: error });
    }
    if (count) {
      console.error(`FAIL ${file} has ${count} internal references. Explain the behavior or link to a public source.`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log('PASS comment references (0)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
