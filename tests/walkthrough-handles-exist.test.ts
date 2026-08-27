import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { recordHandleSlug } from '../src/lib/components/kit/recordHandles.ts';

/* walkthrough-locators.test.ts polices the *shape* of a handle - never a
   CSS class, never bare copy. This polices the other half ADR-0029 names:
   a selector that stops matching does not fail loudly either, so every
   handle the walkthrough greps for has to be checked against src/ once,
   here, rather than found out thirty seconds into a Chromium timeout. */

const rootPath = fileURLToPath(new URL('../', import.meta.url));
const walkthroughPath = join(rootPath, 'tests/walkthrough.test.mjs');
const source = readFileSync(walkthroughPath, 'utf8');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(path));
      continue;
    }
    out.push(path);
  }
  return out;
}

const srcText = listFiles(join(rootPath, 'src'))
  .filter((p) => /\.(svelte|ts|js)$/.test(p))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

/* Matches the selector-string argument of every call the walkthrough uses
   to find or bound an element by handle - the same locate/wait calls
   walkthrough-locators.test.ts polices, plus slideToTarget and
   expectNoHorizontalOverflow, the two local helpers that take a raw
   selector string of their own rather than calling .locator() inline. */
const SELECTOR_CALL =
  /(?:\.locator|waitForSelector|querySelector|querySelectorAll|page\.textContent|slideToTarget|expectNoHorizontalOverflow)\(\s*(['"`])((?:(?!\1).)*)\1/g;

const DATA_ATTR = /data-[a-zA-Z0-9-]+/g;
const ID_TOKEN = /#[a-zA-Z][\w-]*/g;

const handles = new Set<string>();
for (const match of source.matchAll(SELECTOR_CALL)) {
  const selector = match[2];
  for (const m of selector.matchAll(DATA_ATTR)) handles.add(m[0]);
  for (const m of selector.matchAll(ID_TOKEN)) handles.add(m[0]);
}

/* A handle exists if a component owns it. A data-* attribute is always
   written as a literal attribute name somewhere; an id is usually an `id=`
   attribute but sometimes only a bare string a snippet turns into one
   (routes/compare/+page.svelte's date rows), so any matching quoted
   literal counts too.

   The exception is a record sheet's three buttons, whose handles are built
   from the record's own name (recordHandles.ts, phase 5 audit ticket 09).
   `data-save-lab` is nowhere in src/ as a literal, but `handle="lab"` is,
   and that is the same claim: a screen named this record, so the sheet it
   renders stamps all three. A slug no screen passes still fails here, the
   same as a misspelt attribute would. */
function ownsRecordHandle(handle: string): boolean {
  const slug = recordHandleSlug(handle);
  return slug !== null && new RegExp(`\\bhandle=["']${slug}["']`).test(srcText);
}

function existsInSrc(handle: string): boolean {
  if (handle.startsWith('#')) {
    const name = handle.slice(1);
    return (
      new RegExp(`\\bid=["'\`]${name}["'\`]`).test(srcText) ||
      srcText.includes(`'${name}'`) ||
      srcText.includes(`"${name}"`) ||
      srcText.includes(`\`${name}\``)
    );
  }
  return srcText.includes(handle) || ownsRecordHandle(handle);
}

/* Handles the walkthrough stamps onto the page itself instead of reading
   off a component - real elements while the test runs, never real markup
   in src/. */
const INJECTED_HANDLES: Record<string, string> = {
  'data-probe-next-entry':
    'the entry-to-entry flow adds a throwaway <a> via page.evaluate to prove the editor remounts rather than reusing stale params (walkthrough.test.mjs ~line 346)'
};

/* Handles a flow asserts *absent* on purpose. Each one still has to be a
   real handle some component owns elsewhere - just not on the screen under
   test - or the assertion could never fail and is refused below. Empty for
   now: ticket 01 deleted the one absence check that existed
   ([data-day-average] on day detail), because no component has ever owned
   that handle. */
const DELIBERATE_ABSENCE_HANDLES: Record<string, string> = {};

describe('the walkthrough grips handles that actually exist', () => {
  it('refuses any deliberate-absence handle that names nothing real', () => {
    const unfalsifiable = Object.keys(DELIBERATE_ABSENCE_HANDLES).filter((h) => !existsInSrc(h));
    expect(unfalsifiable).toEqual([]);
  });

  it('finds every handle the walkthrough greps for somewhere in src/', () => {
    const offenders = [...handles].filter((h) => !(h in INJECTED_HANDLES)).filter((h) => !existsInSrc(h));
    expect(offenders).toEqual([]);
  });
});
