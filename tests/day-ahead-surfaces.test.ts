/* `/day/[day]`'s own rules from phase 8 features ticket 62 (ADR-0067), at
   the level a grep can hold - the same split calendar-surfaces.test.ts uses
   for the calendar's own ticket 61. What each behaviour actually renders
   for a real journal is tests/walkthrough.test.mjs's question; this is the
   wiring a typecheck cannot see: that a future day's write affordances sit
   behind the right branch, and that nothing here draws a second string for
   a concept the app already names. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const markupOf = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');

const DAY_ROUTE = 'src/routes/day/[day]/+page.svelte';
const day = read(DAY_ROUTE);
const dayAheadRows = read('src/lib/components/dayAheadRows.ts');

describe('the day after today', () => {
  it('is not the day carried in page.params.day alone - it is compared against today', () => {
    expect(day).toMatch(/isFuture = \$derived\(epochDay > todayEpochDay\(\)\)/);
  });

  it('reads dayAhead for its own single day, not a month', () => {
    expect(day).toContain('j.dayAhead.getDayAhead(epochDay, epochDay, todayEpochDay())');
  });

  /* The future branch itself: everything between `{#if isFuture}` and the
     `{:else}` that hands the screen to a past day. Audit item 12 turned the
     old `{#if !isFuture}` guard around so a future day can draw the records
     it does hold - an appointment, a milestone - so the rule is stated over
     that branch's own contents rather than over the order of the file. */
  const futureBranch = markupOf(day).split('{#if isFuture}')[1]?.split('{:else}')[0] ?? '';

  it('never lets the entries gate, the add-entry button or the era link past the future guard', () => {
    expect(futureBranch).not.toBe('');
    for (const offered of ['<ReadGate', 'data-add', 'data-start-era']) {
      expect(futureBranch, `${offered} reaches a day that has not happened`).not.toContain(offered);
    }
    // And they are all still on the screen, in the branch a past day takes.
    expect(markupOf(day)).toMatch(/\{:else\}[\s\S]*<ReadGate[\s\S]*data-add[\s\S]*data-start-era[\s\S]*\{\/if\}\s*<\/div>/);
  });

  it('never calls the old nothing-logged notice from outside that guard', () => {
    // "Nothing logged this day, you can still add an entry" is exactly the
    // wrong thing to say about a day that has not happened - the bug ticket
    // 62 exists to fix. Asserted negatively because the positive case (it
    // still fires for an empty past day) is unchanged and already covered
    // by the loading-states test in calendar-surfaces.test.ts.
    expect(futureBranch).not.toContain('m.nothing_logged()');
    const beforeGuard = markupOf(day).split('{#if isFuture}')[0];
    expect(beforeGuard).not.toContain('m.nothing_logged()');
    expect(beforeGuard).not.toContain('data-add');
  });

  it('has an honest empty state that offers nothing, reached only when nothing is coming or already recorded', () => {
    expect(markupOf(day)).toMatch(
      /\{:else if isFuture && !hasRecords\}[\s\S]*?<Notice[\s\S]*?m\.day_ahead_empty_title\(\)/
    );
    expect(day).not.toMatch(/day_ahead_empty[\s\S]{0,120}(data-add|goto\(|onclick)/);
  });

  it('says what a dose slot expects, which the mark itself may not carry', () => {
    /* Audit item 12: the row said "Dose" and went to /doses, which is what
       Today's agenda row already said. The amount comes off the schedule
       through `expectedDosesOnDay`, never off the mark - ADR-0067's rule
       that a mark is a day and a kind is what that split protects. */
    expect(day).toContain('expectedDosesOnDay(episodes, schedules, pauses, asked)');
    expect(day).toContain('m.adherence_slot_amount(');
    // The mark's own row module still states the kind and nothing else: the
    // amount is the screen's, read off the schedule.
    expect(dayAheadRows).not.toContain('expectedDoses');
  });

  it('drops a mark whose own record is on the screen beside it', () => {
    // An appointment and a milestone both draw a row through day.ts with
    // their kind, place or name on it; the mark would be the same fact with
    // less on it, which is the shape the audit measured.
    expect(day).toMatch(/namedByRecords[\s\S]{0,400}appointment[\s\S]{0,200}milestone/);
    expect(day).toContain('dayAheadRead.rows.filter((mark) => !namedByRecords.has(mark.kind))');
  });

  it('draws what is coming under the heading the appointments screen already has, not a second string for it', () => {
    // CONTEXT.md's "Coming up" is one concept; appointments_upcoming_heading
    // is where the app already put its words for it.
    expect(day).toContain('m.appointments_upcoming_heading()');
  });

  it('gives the coming card the one role guaranteed a colour when it is the only card on screen', () => {
    // A future day with nothing else drawn cannot risk the role that reads
    // as white on trans; today, the same card sits beside the entries card
    // and takes the second role instead.
    expect(day).toContain('role={isFuture ? entriesRole : alsoRole}');
    expect(day).toMatch(/day-ahead-empty[\s\S]{0,80}role=\{entriesRole\}/);
  });
});

describe("a mark's row", () => {
  it('is exhaustive over every kind dayAhead can produce', () => {
    // A `Record<DayAheadMarkKind, ...>` is what makes a sixth kind a
    // compile error here rather than a mark that silently draws nothing -
    // svelte-check is the test that actually enforces it; this just holds
    // the shape that makes that enforcement possible.
    expect(dayAheadRows).toMatch(/Record<DayAheadMarkKind,/);
    for (const kind of ['appointment', 'surgery', 'milestone', 'letterUnlock', 'doseSlot']) {
      expect(dayAheadRows).toContain(`${kind}:`);
    }
  });

  it('never carries a subtitle, a count or a photo - a mark has no second thing to say', () => {
    expect(dayAheadRows).not.toContain('subtitle');
    expect(dayAheadRows).not.toContain('count:');
    expect(dayAheadRows).not.toContain('photo:');
  });
});
