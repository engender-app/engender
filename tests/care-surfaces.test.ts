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

/* One lane per running drug (phase 11 all-four-doors ticket 10). Greps for
   the same reason the block above is: every one of these is a fact about
   which branch a piece of the template sits in, not a function with an
   answer to call. The arithmetic itself is tested where it lives
   (src/lib/data/careSpine.test.ts, src/lib/data/journal/hormoneCurve.test.ts). */
describe('the spine draws one lane per running regimen', () => {
  it('draws every running episode, in railEpisodes order', () => {
    expect(care).toContain("import {\n    careSpine,\n    railEpisodes,");
    expect(care).toContain('railEpisodes(activeEpisodesAt(episodesQuery.rows, startOfDayTimestamp(today)))');
    expect(care).toMatch(/\{#each spine\.lanes as lane, index \(lane\.episodeId\)\}/);
  });

  it('has no "Other regimens" heading left to put a drug under', () => {
    expect(care).not.toContain('care_group_other_regimens');
    expect(care).not.toContain('otherScheduleRows');
    /* The rail no longer picks one episode and gives up on the rest, so the
       screen has no "more than one regimen is running" branch either. */
    expect(care).not.toContain('chooseRailEpisode');
    expect(care).not.toContain('m.care_regimen_several()');
  });

  it('draws today and the draw once for the whole rail, as guides across every lane', () => {
    expect(care.match(/\{#each spine\.shared as mark \(mark\.kind\)\}/g)).toHaveLength(2);
    expect(care).toContain('class="care-guide"');
  });

  it('gives each lane its own stripe and its own name', () => {
    expect(care).toContain('{...laneAttrs(index, labelRows(lane.marks))}');
    expect(care).toContain('roleAttrs(roleAt(activeFlag.roles, index))');
    expect(care).toContain('<span class="care-lane-name">{lane.drug}</span>');
  });

  it('reads one lane once, so a lane and its block cannot state two different days', () => {
    expect(care).toContain('let lanes = $derived(');
    expect(care.match(/doseFactsFor\(episode\)/g)).toHaveLength(1);
  });

  it('gives every block a Log button that opens the dose sheet on that block’s own drug', () => {
    expect(care).toContain("const logHref = (drug: string) => `/care/doses?add=1&drug=${encodeURIComponent(drug)}`;");
    expect(care).toContain('data-care-log={lane.episode.drug}');
  });
});

describe('every row on Care states a current value', () => {
  /* The screen's own complaint, from the whole-app audit: four of six rows
     were a title and a chevron. A row here without a `subtitle` is that
     again, so the check is structural rather than a list of the rows that
     happen to exist today. */
  const hormonesCard = care.slice(
    care.indexOf('<SectionHeading text={m.care_group_hormones()} />'),
    care.indexOf('<!-- Mood between injections')
  );
  const rows = hormonesCard.split('<ListRow').slice(1);

  it('finds the rows to check at all', () => {
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  for (const row of rows) {
    const key = /key="([^"]+)"/.exec(row)?.[1] ?? row.slice(0, 40);
    it(`the ${key} row carries a reading`, () => {
      expect(row.slice(0, row.indexOf('/>'))).toContain('subtitle');
    });
  }

  it('states the curve as a word about the drawing, never a level the app has read', () => {
    expect(care).toContain('j.hormoneCurve.getCurveDirection({ drug: curveDrug, epochDay: today })');
    expect(care).toContain('m.care_row_curve_reading(');
    expect(care).not.toContain('latestQualitativeValue');
    expect(care).not.toContain('bandMidpointAt');
  });

  it('states the summary row off the summary screen’s own two modules', () => {
    expect(care).toContain('ongoingWindowRange(today, 90)');
    expect(care).toContain('CLINICIAN_DOSSIER_INCLUSION_KEYS.length');
  });

  it('keeps the stock row for what no lane already names', () => {
    expect(care).toContain('let unlanedStock = $derived(');
    expect(care).toContain('drugsMatch(lane.episode.drug, row.entry.drug)');
  });
});

describe('the curve row never falls back to a title and a chevron', () => {
  /* The spec axis of this ticket's own code review: a curve drug running
     with nothing logged inside the model's reach yet - a regimen started
     this week - left `curveReading` null, and ListRow drops a falsy
     subtitle, so the row came back as the bare title the ticket exists to
     get rid of. Both silences take the curve screen's own words now. */
  it('states the curve screen’s own empty words whenever there is no direction', () => {
    expect(care).toContain('if (!direction) return m.curve_empty_title();');
    expect(care).not.toMatch(/if \(!direction\).*curveDrug === null \? /);
  });
});
