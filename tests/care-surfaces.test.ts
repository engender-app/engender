/* The two interval folds' emptiness rule, moved here whole from
   tests/stats-surfaces.test.ts when redesign ticket 05 moved the readings
   themselves off a general stats door onto Care's own spine.

   Greps by design (ticket 08): every one of these is a Svelte template fact
   - which branch a panel is inside - rather than a function with an answer
   to call. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const care = readFileSync(root + 'src/routes/care/+page.svelte', 'utf8');

describe('the two folds read the whole journal, said once, and only when they draw', () => {
  /* The two cards each used to print their own "reads the whole journal"
     line; merged into one card under one heading, that would have printed
     it twice for the same fact. `care_interval_all_history` prints exactly
     once now, ahead of both ReadGates rather than inside either one, since
     it is true of the card regardless of which of the two readings below it
     has enough to draw. */
  it('says it reads the whole journal exactly once, ahead of both folds', () => {
    expect(care.match(/\{m\.care_interval_all_history\(\)\}/g)).toHaveLength(1);
    expect(care).not.toContain('m.stats_all_history()');
  });

  /* The explainer still belongs to the schedule-driven fold specifically -
     it is the one that keeps calling itself a "day of interval" - so it
     stays where it always was, ahead of both readings rather than pinned to
     one ReadGate's own branch. */
  it('keeps the day-of-interval explainer on the merged card', () => {
    expect(care).toContain('{m.interval_mood_explainer()}');
  });

  /* Both folds say they read the whole journal, so neither may be gated on
     a count of anything Care's own rail is narrower than - which is what
     they were on /stats, and it hid both cards for a long dose history with
     a quiet month. The floor is WRAPPED_ENTRY_FLOOR positions of the fold's
     own all-history output. */
  it('gates each fold on its own output, not on a range', () => {
    expect(care).toMatch(
      /const foldDrawable = \(pattern[^)]*\) => pattern\.length >= WRAPPED_ENTRY_FLOOR;/
    );
    expect(care.match(/\{#if foldDrawable\(/g)).toHaveLength(2);
  });

  /* Alicja, on the rendered screen: an interval fold is keyed on a position
     and drew a value gutter with no ends at all, so the one thing the
     picture is keyed on went unnamed. */
  it('names both ends of each fold axis', () => {
    expect(care.match(/\{@const ends = positionEnds\(/g)).toHaveLength(2);
    expect(care.match(/from=\{ends\.from\}\s*to=\{ends\.to\}/g)).toHaveLength(2);
    expect(care).toContain('m.interval_day_n({ n: String(point.x) })');
  });

  /* The custom length is this card's one control, on the heading's line
     with its own unit either side of the field, rather than a bare number
     with a hidden label (the whole-app audit's own complaint: "a bare
     number input '28' with no unit"). */
  it('draws the custom length as the card\'s one control, with a visible unit', () => {
    expect(care).toMatch(/\{#snippet control\(\)\}[\s\S]{0,800}data-interval-length/);
    expect(care).toContain('{m.care_interval_fold_prefix()}');
    expect(care).toContain('{m.care_interval_fold_unit()}');
  });

  it('is one card, one heading, for both readings', () => {
    expect(care.match(/kind="interval-mood"/g)).toHaveLength(1);
    expect(care).not.toContain('kind="custom-interval"');
  });
});
