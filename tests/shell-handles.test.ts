import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Check shell handles in source (ADR-0029) so the walkthrough keeps
   selectors for tabs, rail, quick add, back and sheets. Home's header
   and hero and More's rows also expose handles for safe-area geometry.
   Other screen controls have their own checks. */

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

/* Svelte attribute values are expressions, and an expression can hold the
   very character the tag matcher stops at - `class:starts-group={i > 0 &&
   ...}` truncated a tag before its handle and reported a false offender.
   The values are not what is being checked here, only the attribute names,
   so they go before matching. */
function withoutExpressions(source: string): string {
  return source.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '{}');
}

function untagged(source: string): string[] {
  const offenders: string[] = [];
  for (const match of withoutExpressions(source).matchAll(INTERACTIVE)) {
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

  it('offers every target spec 04 names, each with its own handle', () => {
    const quickAdd = read('src/lib/components/QuickAdd.svelte');
    /* data-choose="date" predates the rebuild and is what the backdate flow
       already grips, so it survived rather than being renamed to match the
       handles beside it.

       data-choose="today" did not survive, and that is the one deliberate
       selector repair in this ticket: "Today" was a row of its own until it
       was merged into the mood row, because an entry cannot be saved
       without a mood and a blank entry for today was a mood picker with an
       extra tap in front of it. Picking a mood is how today's entry starts,
       so mood-N is what the flows grip now. */
    expect(quickAdd).not.toContain('data-choose="today"');
    expect(quickAdd).toContain('data-choose="date"');
    for (const key of ['another-day', 'dose', 'wear']) {
      expect(quickAdd, `${key} is offered`).toContain(`data-fan-target="${key}"`);
    }
    /* The five moods, which are the entry-for-today target. */
    expect(quickAdd).toContain('MOOD_TARGET + value');
  });
});

function read(path: string): string {
  return readFileSync(root + path, 'utf8');
}
