import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const care = readFileSync(root + 'src/routes/care/+page.svelte', 'utf8');

/* One lane per running drug (phase 11 all-four-doors ticket 10). Greps for
   the same reason the block above is: every one of these is a fact about
   which branch a piece of the template sits in, not a function with an
   answer to call. The arithmetic itself is tested where it lives
   (src/lib/data/careSpine.test.ts). */
describe('the spine draws one lane per running regimen', () => {
  it('draws every running episode, in railEpisodes order', () => {
    expect(care).toContain('careQuery.value?.lanes ?? []');
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

  it('gives each lane its own stripe, and a name that opens that drug\'s own block', () => {
    expect(care).toContain('{...laneAttrs(index, labelRows(lane.marks))}');
    expect(care).toContain('roleAttrs(roleAt(activeFlag.roles, index))');
    /* Phase 11 UI/UX ticket 25: the name is the lane's heading and the jump
       to the medication rows below, addressed by the episode's own id so a
       free-text drug name never becomes a fragment. */
    expect(care).toContain('<span class="care-lane-drug">{lane.drug}</span>');
    expect(care).toContain('href={`#${blockAnchor(lane.episodeId)}`}');
    expect(care).toContain('id={blockAnchor(lane.episode.id)}');
  });

  it('reads one lane once, so a lane and its block cannot state two different days', () => {
    expect(care).toContain('let lanes = $derived(');
    expect(care).toContain('liveQuery((j) => readCare(j, today))');
    expect(care).toContain('<ReadGate read={careRead}');
  });

  it('gives every block a Log button that opens the dose sheet on that block’s own drug', () => {
    expect(care).toContain("const logHref = (episodeId: string) => `/care/doses?add=1&episode=${encodeURIComponent(episodeId)}`;");
    expect(care).toContain('data-care-log={lane.episode.drug}');
  });

  /* prh12 bug 16: a medication's own header opens its episode's editor
     over Care rather than sending the reader to the regimen list to tap
     it a second time. The full screen stays one link away inside it. */
  it('opens the regimen editor sheet in place from a block, with the whole list still reachable', () => {
    expect(care).toContain('onclick={() => regimenSheet.open(lane.episode)}');
    expect(care).toContain('<RegimenEditorSheet bind:this={regimenSheet} allEpisodesLink />');
    expect(care).not.toContain('<a class="care-regimen" href="/care/regimen"');
  });
});

describe('every row on Care states a current value', () => {
  /* The screen's own complaint, from the whole-app audit: four of six rows
     were a title and a chevron. A row here without a `subtitle` is that
     again, so the check is structural rather than a list of the rows that
     happen to exist today. */
  const labsStockCard = care.slice(
    care.indexOf('<SectionHeading text={m.care_group_labs_stock()} />'),
    care.indexOf('<!-- What came of all of it')
  );
  const rows = labsStockCard.split('<ListRow').slice(1);

  it('finds the rows to check at all', () => {
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  for (const row of rows) {
    const key = /key="([^"]+)"/.exec(row)?.[1] ?? row.slice(0, 40);
    it(`the ${key} row carries a reading`, () => {
      expect(row.slice(0, row.indexOf('/>'))).toContain('subtitle');
    });
  }

  it('states the summary row off the summary screen’s own two modules', () => {
    expect(care).toContain('ongoingWindowRange(today, 90)');
    expect(care).toContain('CLINICIAN_SUMMARY_SECTION_KEYS.length');
  });

  it('keeps the stock row for what no lane already names', () => {
    expect(care).toContain('let unlanedStock = $derived(');
    expect(care).toContain('sameDrug(lane.episode.drug, row.entry.drug)');
  });
});
