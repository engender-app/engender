import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

/* The recency rows lead somewhere (pre-production UI/UX ticket 28): a
   route `.svelte` file cannot mount on this tier (ADR-0016), so the
   contract is read off the source the same way the clinician summary's
   print-parity and AreaFinish tests read theirs. The real-browser half of
   the ticket's verification lives in hair-removal-recency-handoff-check.mjs. */

const hairRemoval = read('src/routes/body/hair-removal/+page.svelte');

describe('hair-removal recency area handoff contract (pre-production UI/UX 28)', () => {
  it('opens the existing add-session form with the row area prefilled', () => {
    /* No per-area history destination exists - the body-map inspector reads
       the dysphoria-scoped region vocabulary, deliberately never merged
       with these treatment areas - so the ticket's fallback owns it: the
       row seeds the RecordSheet's own draft with that area. */
    expect(hairRemoval, 'a recency row hands off to the existing editor draft with its area set').toMatch(
      /function openSessionForArea\(area: HairRemovalAreaKey\)[\s\S]*?record\.editor = blankDraft\(area\)/
    );
    expect(hairRemoval).toContain('onclick={() => openSessionForArea(area)}');
  });

  it('adds no save path of its own - the sheet still saves, never the row', () => {
    /* Only the RecordSheet's save reaches the journal: counting upsert
       calls keeps a prefilled row from growing a second one. */
    expect(hairRemoval.match(/journal\.hairRemoval\.upsertSession/g)?.length).toBe(1);
  });

  it('turns the recency rows into controls and keeps the all-area overview', () => {
    /* The overview card still renders one row per closed-vocabulary area
       (never an imported or renamed key), each now pressable - the static
       row that went nowhere is what the audit flagged. */
    const recencyStart = hairRemoval.indexOf('hair_removal_recency_title');
    const recency = hairRemoval.slice(recencyStart, hairRemoval.indexOf('hair_removal()', recencyStart));
    expect(recency).toContain('{#each HAIR_REMOVAL_AREAS as area (area)}');
    expect(recency).not.toMatch(/<ListRow[\s\S]*?static/);
    expect(recency).toContain('m.hair_removal_area_never_used()');
  });

  it('seeds a new-session draft - no id, so nothing edits an existing record', () => {
    /* The handoff draft is the blank draft with one field chosen: without
       an id the sheet is "New session", and a clean baseline means an
       untouched dismissal closes directly instead of prompting. */
    expect(hairRemoval, 'the blank draft names its defaults once').toMatch(
      /function blankDraft[\s\S]*?\{[\s\S]*?method: 'laser'[\s\S]*?\}/
    );
    expect(hairRemoval.match(/id: session\.id/)?.length).toBe(1);
  });
});
