/* Guard for after-release ticket 02: a screen must not hold on to the day it
   was mounted on.

   `todayEpochDay()` reads only the clock, so `const today = todayEpochDay()`
   in a component's script, or a `$derived` whose body calls it, is computed
   once and never again; the screen then shows yesterday after midnight.
   `currentDay()` (src/lib/stores/today.svelte.ts) is the reactive read. Calls
   inside a function body, which run when something happens, are fine and are
   what writes should use. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const src = fileURLToPath(new URL('../src', import.meta.url));

/** Comments blanked to spaces, so line numbers hold and prose that names the
    pattern is not mistaken for code. */
function withoutComments(text: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank).replace(/^\s*\/\/.*$/gm, blank);
}

/** The text of the balanced parentheses opening at `open`. */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

/** Where a file captures the day instead of following it. Svelte script and
    module-level code sit at one indent level (two spaces) or none. */
export function dayCaptures(file: string, text: string): string[] {
  const code = withoutComments(text);
  const found: string[] = [];
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const indent = file.endsWith('.svelte') ? ' {0,2}' : '';
  const binding = new RegExp(`^${indent}(?:const|let) [\\w$]+(?::[^=\\n]+)? = (?![^;\\n]*(?:=>|function|\\$state(?:<[^>]*>)?\\())[^;\\n]*todayEpochDay\\(`, 'gm');
  const raw = text.split('\n');
  for (const m of code.matchAll(binding)) {
    // A deliberate hold on the mount day says so on its own line.
    if (raw[lineOf(m.index) - 1].includes('// mount-day') || m[0].includes('$derived')) continue;
    found.push(`${file}:${lineOf(m.index)} captures todayEpochDay() in a top-level binding`);
  }
  /* A derived or a live read runs again only when something it read changes,
     and the clock is not something it can read. */
  for (const m of code.matchAll(/(\$derived(?:\.by)?|liveQuery|liveList|liveQueryWatchingOnly)\(/g)) {
    const body = balanced(code, m.index + m[0].length - 1);
    if (body.includes('todayEpochDay(')) found.push(`${file}:${lineOf(m.index)} calls todayEpochDay() inside ${m[1]}`);
  }
  return found;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(svelte|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

it('no route or component captures the day it mounted on', () => {
  const found = sources(src).flatMap((path) => dayCaptures(relative(src, path), readFileSync(path, 'utf8')));
  expect(found).toEqual([]);
});

it('fails on a planted capture', () => {
  expect(dayCaptures('x.svelte', '<script>\n  const today = todayEpochDay();\n</script>')).toHaveLength(1);
  expect(dayCaptures('x.svelte', '<script>\n  let today = $state(0);\n  let t = $derived(todayEpochDay());\n</script>')).toHaveLength(1);
  expect(dayCaptures('x.svelte', '<script>\n  let t = $derived.by(() => {\n    return f(todayEpochDay());\n  });\n</script>')).toHaveLength(1);
  expect(dayCaptures('x.svelte', '<script>\n  const input = format(todayEpochDay());\n</script>')).toHaveLength(1);
  expect(dayCaptures('x.ts', 'const today = todayEpochDay();')).toHaveLength(1);
});

it('fails on a planted capture in a live read', () => {
  expect(dayCaptures('x.svelte', '<script>\n  let q = liveQuery((j) => j.a.b(todayEpochDay()));\n</script>')).toHaveLength(1);
});

it('leaves reads that happen when something runs, and comments, alone', () => {
  const ok = [
    '<script>\n  const today = $derived(currentDay());\n  function save() {\n    const day = todayEpochDay();\n  }\n</script>',
    '<script>\n  /* const today = todayEpochDay(); */\n  // let t = $derived(todayEpochDay());\n</script>',
    '<script>\n  let draft = $state(dateInputValueFromEpochDay(todayEpochDay()));\n</script>',
    '<script>\n  const gap = read(todayEpochDay()); // mount-day: the gap is decided once\n</script>'
  ];
  for (const text of ok) expect(dayCaptures('x.svelte', text)).toEqual([]);
});
