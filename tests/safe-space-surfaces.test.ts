/* Surface and contract tests for Safe space (ticket 52, ADR-0040).

   Phase 10 redesign ticket 47 split the screen these were written against.
   `/doubt` offers personal support before the breathing exercise; the statistics,
   the charts, the counterevidence pool, the snapshots, the letters, the
   photos and the comfort list are each one tap down, on their own route.

   So every assertion below still asks the same question and asks it of
   whichever file now holds the answer - which is the point of keeping them
   rather than rewriting them. What this file is for is that nothing was cut
   in the move, and a test that only knew where things used to be could not
   tell a section that moved from a section that went.

   Phase 11 ticket 15 moves two of them again, and one of them out of Safe
   space entirely. The letters and the starred photographs are the letters
   screen's now - `/doubt/moments` was showing the same unlocked letters
   `/transition/letters` already showed in its Open section - so the
   assertions about them read that file. The readings were a Look back page
   on this door and ticket 07 gives them a reading of their own, so the
   assertions about a tile grid and two charts are gone rather than
   repointed: that is a section that went from here, and this file's job is
   to say which. Both addresses still answer, as redirect stubs, and
   tests/settings-route-redirects.test.ts is what holds them. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles.ts';
import { UNPROMPTED_ROWS } from '../src/lib/unprompted/registry.ts';
import { HUB_ROWS } from '../src/lib/data/hubRows.ts';
import { SAFE_SPACE_WAYS } from '../src/lib/data/safeSpaceWays.ts';
import { COUNTEREVIDENCE_LIMIT, COUNTEREVIDENCE_PREVIEW } from '../src/lib/data/counterevidence.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const doubt = read('src/routes/doubt/+page.svelte');
const comfort = read('src/routes/doubt/comfort/+page.svelte');
const evidence = read('src/routes/doubt/evidence/+page.svelte');
const letters = read('src/routes/transition/letters/+page.svelte');
const more = read('src/routes/more/+page.svelte');

const strip = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');
const markup = strip(doubt);
const evidenceMarkup = strip(evidence);
const lettersMarkup = strip(letters);

/** Safe space as one thing, for the assertions that only care that the app
    still holds a surface somewhere behind that row. */
const safeSpace = [doubt, comfort, evidence].join('\n');

describe('what Safe Space is built from', () => {
  it('takes its surfaces from the kit and does not reach for pre-kit SectionTitle or EmptyState', () => {
    expect(safeSpace).not.toContain("from '$lib/components/SectionTitle.svelte'");
    expect(safeSpace).not.toContain("from '$lib/components/EmptyState.svelte'");
    expect(safeSpace).not.toMatch(/<SectionTitle/);
    expect(safeSpace).not.toMatch(/<EmptyState/);
    expect(evidence).toContain("from '$lib/components/kit/SectionHeading.svelte'");
    expect(safeSpace).toContain("from '$lib/components/kit/Notice.svelte'");
    expect(evidence).toContain("from '$lib/components/kit/ReadGate.svelte'");
    expect(evidence).toContain("from '$lib/components/kit/ConfirmDeleteSheet.svelte'");
    expect(doubt).toContain("from '$lib/components/BreathingExercise.svelte'");
  });

  it('keeps the breathing tool available without a separate heading', () => {
    expect(markup).toContain('<BreathingExercise');
    // No section heading over it: the field says where this is.
    expect(doubt).not.toContain("from '$lib/components/kit/SectionHeading.svelte'");
  });

  it('runs no live query at all, so a cold launch paints the breath without waiting', () => {
    expect(doubt).not.toContain('liveList(');
    expect(doubt).not.toContain('liveQuery(');
    expect(doubt).not.toContain("from '$lib/data/live/journal.svelte'");
  });

  it('puts every way down one tap from the breath, in the order the module states', () => {
    expect(doubt).toContain("from '$lib/data/safeSpaceWays'");
    expect(markup).toMatch(/{#each SAFE_SPACE_WAYS as way[\s\S]*?<ListRow/);
    for (const way of SAFE_SPACE_WAYS) expect(doubt).toContain(`${way.key}:`);
  });

  it('names the More hub as where back falls back to', () => {
    /* CARPET-05: the href is the fallback rather than the destination now,
       and ScreenHeader is what turns it into a return to whichever screen
       the person actually came from. */
    expect(doubt).toContain('back="/more"');
  });

  it('renders a breathing exercise calming tool', () => {
    expect(markup).toContain('<BreathingExercise');
  });

  it('preserves the counterevidence pool and snapshot save/delete actions', () => {
    expect(evidence).toContain('j.entries.counterevidencePool');
    expect(evidence).toContain('j.doubtJournal.getSnapshots');
    expect(evidence).toContain('journal.doubtJournal.saveSnapshot');
    expect(evidence).toContain('journal.doubtJournal.deleteSnapshot');
    expect(evidenceMarkup).toContain("confirmAttrs={{ 'data-confirm-delete-doubt-snapshot': '' }}");
  });

  it('reads section colors from activeFlag shell roles', () => {
    for (const source of [doubt, comfort, evidence]) {
      expect(source).toContain("from '$lib/theme/activeFlag.svelte'");
      expect(source).toContain("from '$lib/theme/roles'");
    }
  });

  /* Ticket 15's bound. Twenty entry cards ran this screen to 3990px and
     put the save control at the bottom of it, so the one thing a person
     came here to do was twenty cards away. Six is what fits above it. */
  it('opens on six of the pool with the save under them, and holds the rest behind one control', () => {
    expect(evidence).toContain('COUNTEREVIDENCE_PREVIEW');
    expect(evidence).toContain('counterevidence.slice(0, COUNTEREVIDENCE_PREVIEW)');
    expect(evidence).toContain('counterevidence.slice(COUNTEREVIDENCE_PREVIEW)');
    expect(COUNTEREVIDENCE_PREVIEW).toBeLessThan(COUNTEREVIDENCE_LIMIT);
    // The save sits between the six and the control, which is the whole
    // point of the bound - not under all twenty, as it was.
    expect(evidenceMarkup).toMatch(
      /{#each shown[\s\S]*?onclick={saveSnapshot}[\s\S]*?data-evidence-see-all/
    );
    // And it still saves the whole pool, not the six that are showing.
    expect(evidence).toContain('counterevidence.map((e) => ({');
  });

  it('discloses the rest in place rather than sending anyone to a second screen', () => {
    expect(evidenceMarkup).toContain('data-evidence-see-all');
    expect(evidenceMarkup).not.toMatch(/data-evidence-see-all[^>]*href=/);
    expect(evidence).toContain('m.safe_space_evidence_see_all({ count: counterevidence.length })');
    /* ADR-0078: the control discloses by moving. The rows it reveals clip
       open from their own left edge and the control itself collapses,
       rather than either cutting into place. */
    expect(evidence).toContain('out:disclose');
    expect(evidence).toContain('animation: kit-block-in');
  });

  /* Ticket 15 again: the subtitle is the qualification rule in the
     person's own words, and entries.ts is what keeps it. The two moved
     together and a screen promising more than the query delivers is the
     defect the ticket was written for. */
  it('says what qualifies in terms the query actually holds to', () => {
    expect(evidence).toContain('m.safe_space_counterevidence_sub()');
    const entries = read('src/lib/data/journal/entries.ts');
    expect(entries).toContain('DYSPHORIA_TAG_KEYS.map(() => \'?\').join');
    expect(entries).toContain('BODY_REGION_MIDPOINT');
  });
});

describe('the letters and photos, folded onto the letters screen (ticket 14, widened by 21, moved by 15)', () => {
  /* Ticket 14 showed one letter under Safe space; ticket 21 widened that to
     every unlocked one, capped, with the rest a tap away. Ticket 15 noticed
     that the tap went to `/transition/letters`, which was already showing
     the same two letters in its Open section - so the capped list and its
     overflow row are gone, and the screen they handed over to is the one
     surface. What is pinned now is that the seal rule is still the only
     thing deciding which letters are readable, and that the starred
     photographs came across with their bound. */
  it('decides which letters are open by the seal rule and nothing else', () => {
    expect(letters).toContain("from '$lib/data/letterStatus'");
    expect(letters).toContain('isLetterSealed(letter, today)');
    /* No second, looser idea of "open" anywhere on the screen: a letter is
       readable when its unlock day has passed, and that answer is
       letterStatus.ts's - the rule letterRetrospective.ts takes for every
       retrospective surface. */
    expect(letters).not.toMatch(/unlockEpochDay\s*[<>]=?\s*today/);
  });

  it('shows the starred photos in the Open section, capped, beside the letters', () => {
    expect(letters).toContain('j.photos.starredPhotos');
    expect(letters).toContain("from '$lib/components/PhotoThumb.svelte'");
    expect(letters).toMatch(/PHOTO_LIMIT\s*=\s*\d+/);
    expect(lettersMarkup).toContain('<PhotoThumb');
    // Inside the section the heading names, not a third area under it.
    expect(lettersMarkup).toMatch(/letters_opened_title\(\)[\s\S]*?data-safe-space-photos/);
    // Absent, never empty.
    expect(lettersMarkup).toContain('{#if starredPhotos.length}');
  });

  it('names the Open section so Safe space can land on it', () => {
    /* The way down from `/doubt` points at `#opened` (safeSpaceWays.ts):
       somebody arriving from their worst day meets what is open rather than
       what is still sealed. safeSpaceWays.test.ts holds the other half. */
    expect(lettersMarkup).toMatch(/<SectionHeading[^>]*id="opened"/);
  });

  it('brings the photo grid in rather than cutting it into place', () => {
    /* The two reads resolve about 350ms apart on the demo, letters first,
       so without this the grid appears on a screen that has already
       settled (ticket 113's finding, the phase 11 no-yank clause). */
    expect(letters).toContain('animation: kit-block-in');
  });

  it('keeps the letter preview a preview, cut in code as well as in CSS', () => {
    // The retrospective surfaces still draw the shared row, and the row
    // still asks letterOpening for its text rather than carrying the whole
    // letter into a link's accessible name.
    const card = read('src/lib/components/LookBackLetterCard.svelte');
    expect(card).toContain('href={`/transition/letters/${letter.id}`}');
    expect(card).toContain('letterOpening(letter.text, LETTER_OPENING_LIMIT)');
    expect(card).not.toMatch(/title=\{letter\.text\}|subtitle=\{letter\.text\}/);
    /* Ticket 15 removed the row's `lead`: Safe Space's list was its only
       caller, and a prop with one arrangement left is not a choice. */
    expect(card).not.toContain('data-lead');
    expect(read('src/lib/styles/kit.css')).not.toContain("[data-lead='text']");
  });

  it('runs no query against voice_benchmark - ticket 15/16 have not shipped that table to read', () => {
    // The comment explaining the deferral is allowed to name the table;
    // no call or query string may reach for it.
    expect(safeSpace).not.toMatch(/\bj\.voiceBenchmark\b/);
    expect(safeSpace).not.toMatch(/FROM\s+voice_benchmark/i);
    expect(safeSpace).not.toContain('voiceBenchmarkQuery');
  });

  it('adds no click handler to the photo evidence - the grid stays a glance', () => {
    const photoBlock = lettersMarkup.match(/<div class="photo-grid"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(photoBlock).not.toContain('onclick');
  });
});

describe('the support directory panel', () => {
  it('renders as its own ListCard/ListRow panel, not a heading action link, pointing at the existing directory', () => {
    expect(doubt).toContain("from '$lib/components/kit/ListRow.svelte'");
    expect(markup).not.toContain('kit-heading-action');
    /* Its own row in the run of ways down now (ticket 47), rather than a
       panel of its own above the rest of a dashboard - and still the first
       of them, which is where it already sat and which ticket 63 is the
       ticket that gets to move. */
    expect(SAFE_SPACE_WAYS[0]).toMatchObject({ key: 'resources', href: '/support/resources' });
    expect(doubt).toContain('title: m.resources_title');
    /* The row's own key, shortened rather than duplicated: this screen was
       always its only caller, and at its old length it ran to a third line
       at 390px against rule 6's 60px for a two-line row. */
    expect(doubt).toContain('sub: m.resources_row_sub');
  });
});

describe('More hub row for Safe Space', () => {
  it('points to /doubt, and its title is the one the screen uses', () => {
    /* The row list moved into `hubRows.ts` with phase 8 UX ticket 02, and the
       titles with it into `vocabulary/hubLabels.ts`, so this asks the module
       for the row and the label module for the key it draws the title from. */
    expect(HUB_ROWS.find((row) => row.key === 'doubt')).toMatchObject({ href: '/doubt', icon: 'heart' });
    expect(read('src/lib/data/vocabulary/hubLabels.ts')).toContain('doubt: m.safe_space_title');
  });
});

describe('Home live tile for Safe Space nudge (ticket 50)', () => {
  /* The tile left the route with the rest of the grid (phase 8 deepening
     ticket 07). What it says, where it goes and what its dismiss does are
     `liveTiles.grid.test.ts`'s now, through `composeHomeTiles`; what is
     still a grep is which module holds the read, and that Home does not
     hold it twice. */
  it('reads the bad-moment entry from the module that owns the grid', () => {
    expect(read('src/lib/data/liveTiles.svelte.ts')).toContain('j.entries.latestBadMomentEntry');
    expect(read('src/routes/+page.svelte')).not.toContain('latestBadMomentEntry');
    expect(read('src/lib/data/liveTiles.ts')).toContain('shouldShowSafeSpaceNudge');
  });

  it('keeps the nudge in the registry both settings views read', () => {
    const row = UNPROMPTED_ROWS.find((r) => r.key === 'safe-space-nudge');
    expect(row?.surface?.prefKey).toBe('safeSpaceNudgeEnabled');
    expect(LIVE_TILE_ORDER as readonly string[]).toContain('safe-space-nudge');
  });
});
