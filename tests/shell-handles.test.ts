import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Every interactive element in the shell carries a handle (phase 5 ticket
   18, ADR-0029).

   The shell is the part of the app the walkthrough touches on its way to
   everywhere else: the tabs, the rail, the add control, quick add's
   targets, a screen's back arrow, a sheet. A missing handle here is not one
   broken assertion, it is a flow that has to reach for a class name and
   then breaks silently the next time that class is restyled - which is the
   failure ADR-0029 exists to stop.

   Screen-level controls are deliberately out of scope: they belong to their
   own screens and their own tickets. What is checked is the chrome. */

const root = fileURLToPath(new URL('..', import.meta.url));

const SHELL = [
  'src/lib/components/AppNav.svelte',
  'src/lib/components/ScreenHeader.svelte',
  'src/lib/components/QuickAdd.svelte',
  'src/lib/components/Sheet.svelte'
];

/* Opening tags for the things a person can press, focus or type into.
   Deliberately not <span>/<div>: an interactive one would be an
   accessibility defect the audit suite catches, and inventing a handle for
   it here would make that defect look answered. */
const INTERACTIVE = /<(button|a|input|select|textarea)(\s[^>]*)?>/gs;

function untagged(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(INTERACTIVE)) {
    const attrs = match[2] ?? '';
    /* An id counts, because ADR-0029's vocabulary is "a data-* attribute,
       an id, or an ARIA role/state" - the rule is against class names and
       rendered copy, not against ids. The backdate field is the case: the
       walkthrough grips it as #backdate, and its label needs that id
       anyway, so a data-* beside it would be a second name for one thing. */
    if (!/\bdata-[a-z-]+/.test(attrs) && !/\bid="/.test(attrs)) {
      offenders.push(match[0].replace(/\s+/g, ' ').slice(0, 90));
    }
  }
  return offenders;
}

describe('the shell hands the walkthrough a grip on everything it can press', () => {
  for (const file of SHELL) {
    it(`${file.split('/').pop()} tags every interactive element`, () => {
      expect(untagged(read(file))).toEqual([]);
    });
  }

  it('names the four tabs, the add control and both of its shapes', () => {
    const nav = read('src/lib/components/AppNav.svelte');
    for (const handle of ['data-app-nav', 'data-app-rail', 'data-nav-item', 'data-nav-label', 'data-nav-fab', 'data-rail-item', 'data-rail-add']) {
      expect(nav, `${handle} is the shell's name for it`).toContain(handle);
    }
  });

  it('gives quick add a handle per target, keeping the two the old sheet had', () => {
    const quickAdd = read('src/lib/components/QuickAdd.svelte');
    /* data-choose="today" and data-choose="date" predate this rebuild and
       are what several walkthrough flows already grip. Spec 04 asks for the
       suite to pass with no selector repairs, so the rebuild keeps both
       rather than renaming them to match the new ones. */
    expect(quickAdd).toContain("key: 'today'");
    expect(quickAdd).toContain('data-choose="date"');
    for (const key of ['photo', 'another-day', 'tally-misgendered', 'tally-correctly_gendered', 'dose']) {
      expect(quickAdd, `${key} is offered`).toContain(`key: '${key}'`);
    }
    expect(quickAdd).toContain('data-fan-target');
  });
});

function read(path: string): string {
  return readFileSync(root + path, 'utf8');
}
