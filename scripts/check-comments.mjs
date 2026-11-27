import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import ts from 'typescript';

const BASELINE = 'scripts/comment-baseline.json';
const EXTENSIONS = new Set(['.css', '.html', '.java', '.js', '.mjs', '.svelte', '.ts', '.xml']);
const INTERNAL_REFERENCE = /\b(?:tickets?[\s-]+#?(?:[a-z]+-)*\d+|phase[\s-]+\d+|(?:bug|interactive)[\s-]+session|(?:functional|final|last)[\s-]+audit|pre-release-human|ux-carpet|tester[\s-]+report|Alicja)\b|\.scratch\/|\b(?:CONTEXT|DIRECTION|PRODUCT|SCREENS)\.md\b|\bdocs\/(?:agents\/|internal\/|research\/|ui-copy\.md)/gi;

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
    case '.svelte': ranges = svelteComments(source); break;
    case '.css': case '.java': ranges = cssOrJavaComments(source, extension === '.java'); break;
    case '.html': case '.xml': ranges = markupComments(source); break;
    default: ranges = scriptComments(file, source);
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
  return execFileSync('git', ['ls-files', '-z', '--', 'src', 'tests', 'android/app/src', 'scripts'], { encoding: 'utf8' })
    .split('\0').filter((file) => EXTENSIONS.has(extname(file)) && existsSync(file));
}

/** @param {Record<string, number>} counts @param {Record<string, number>} baseline */
export function referenceGrowth(counts, baseline) {
  return Object.entries(counts).flatMap(([file, count]) => {
    const allowed = baseline[file] ?? 0;
    return count > allowed ? [`${file} has ${count} internal references in comments, up from ${allowed}. Explain the behavior or link to a public source.`] : [];
  });
}

/** @param {boolean} update */
function main(update) {
  if (!update && !existsSync(BASELINE)) throw new Error(`Missing ${BASELINE}`);
  /** @type {Record<string, number>} */
  const counts = {};
  for (const file of commentSourceFiles()) {
    try {
      const count = countReferences(file, readFileSync(file, 'utf8'));
      if (count) counts[file] = count;
    } catch (error) {
      throw new Error(`Cannot scan comments in ${file}`, { cause: error });
    }
  }
  const problems = existsSync(BASELINE) ? referenceGrowth(counts, JSON.parse(readFileSync(BASELINE, 'utf8'))) : [];
  if (problems.length) {
    for (const problem of problems) console.error('FAIL', problem);
    process.exitCode = 1;
    return;
  }
  if (update) writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`PASS comment references (${Object.values(counts).reduce((sum, count) => sum + count, 0)} across ${Object.keys(counts).length} files)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.includes('--update'));
}
