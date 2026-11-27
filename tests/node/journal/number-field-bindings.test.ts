import { globSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/* Last-audit UI 01. Svelte's bind:value on a number input sets the parsed
   number, then reads the binding back after a tick and rewrites the field
   whenever the two differ. A getter that hands back anything else (the
   measurement, lab and wear fields stored `String(value)`) therefore
   rewrote the field on every keystroke, and Chromium put the caret at the
   start: 72.5 saved as 572 and -3 as 3. Number inputs bind plainly to a
   `number | null`, or take `value=` with their own `oninput`. The wear
   reminder hours field renders only on Android, so this rule is the one
   test that reaches it on the web tiers. */

/** Each `<input ...>` tag in a component, with the line it starts on.
    Attribute expressions can hold `>` (an arrow function), so the tag
    ends at the first `>` outside braces and quotes. */
function inputTags(source: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = [];
  for (const match of source.matchAll(/<input\b/g)) {
    let depth = 0;
    let quote = '';
    let end = match.index;
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0) break;
    }
    tags.push({ tag: source.slice(match.index, end + 1), line: source.slice(0, match.index).split('\n').length });
  }
  return tags;
}

function functionBoundNumberInputs(source: string): number[] {
  return inputTags(source)
    .filter(({ tag }) => /\btype="number"/.test(tag) && /\bbind:value=\{\s*\(\)\s*=>/.test(tag))
    .map(({ line }) => line);
}

test('no number input binds its value through a getter/setter pair', () => {
  const found = globSync('src/**/*.svelte').flatMap((file) =>
    functionBoundNumberInputs(readFileSync(file, 'utf8')).map((line) => `${file}:${line}`)
  );
  expect(found).toEqual([]);
});

test('the rule finds the coercing binding across lines and passes the plain ones', () => {
  const coercing = `<input
    type="number"
    bind:value={() => editor.hours, (value) => { editor.hours = value == null ? '' : String(value); }}
  />`;
  expect(functionBoundNumberInputs(coercing)).toEqual([1]);
  expect(functionBoundNumberInputs(`<p>a</p>\n<input type="number" step="any" bind:value={() => draft.value, (v) => (draft.value = v)} />`)).toEqual([2]);
  expect(functionBoundNumberInputs('<input type="number" bind:value={editor.value} />')).toEqual([]);
  expect(functionBoundNumberInputs('<input type="number" value={editor.dose} oninput={(event) => { editor.dose = event.currentTarget.value; }} />')).toEqual([]);
  expect(functionBoundNumberInputs('<input type="text" bind:value={() => name, (v) => (name = v.trim())} />')).toEqual([]);
});
