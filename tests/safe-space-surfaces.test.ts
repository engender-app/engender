/* Surface and contract tests for Safe Space dashboard (ticket 52, ADR-0040).
   Verifies that /doubt uses kit surfaces, integrates BreathingExercise,
   renders grounding statistics in TileGrid, preserves counterevidence pool and
   snapshot save/delete flows, and that More hub reflects the Safe Space title and copy. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles.ts';
import { UNPROMPTED_ROWS } from '../src/lib/unprompted/registry.ts';
import { HUB_ROWS } from '../src/lib/data/hubRows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const doubt = read('src/routes/doubt/+page.svelte');
const more = read('src/routes/more/+page.svelte');
const markup = doubt.replace(/<script[\s\S]*?<\/script>/g, '');

describe('what Safe Space is built from', () => {
  it('takes its surfaces from the kit and does not reach for pre-kit SectionTitle or EmptyState', () => {
    expect(doubt).not.toContain("from '$lib/components/SectionTitle.svelte'");
    expect(doubt).not.toContain("from '$lib/components/EmptyState.svelte'");
    expect(markup).not.toMatch(/<SectionTitle/);
    expect(markup).not.toMatch(/<EmptyState/);
    expect(doubt).toContain("from '$lib/components/kit/SectionHeading.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/TileGrid.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/Tile.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/Notice.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/ReadGate.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/ConfirmDeleteSheet.svelte'");
    expect(doubt).toContain("from '$lib/components/BreathingExercise.svelte'");
  });

  it('backs out to the More hub via smartBack', () => {
    expect(doubt).toContain("back={() => smartBack('/more')}");
  });

  it('renders a breathing exercise calming tool', () => {
    expect(markup).toContain('<BreathingExercise');
  });

  it('renders a statistics TileGrid with what is written and good moments, opted into the tight two-up variant', () => {
    expect(markup).toContain('<TileGrid');
    /* Phase 8 UX ticket 01: this said "days in a row" until the streak went.
       A run is the one figure on this screen that could go down, and
       somebody arriving here after a fortnight away would have been told
       their evidence was zero. */
    expect(markup).toContain('key="written"');
    expect(markup).toContain('key="evidence"');
    expect(doubt).toContain('j.entries.countAll()');
    expect(doubt, 'no run of consecutive days').not.toContain('j.stats.streak');
    // Alicja's review: these two tiles' notes are short enough that the
    // 390px floor's default single-column stack is overcautious for them.
    expect(markup).toMatch(/<TileGrid[^>]*data-tight[^>]*>/);
  });

  it('preserves the counterevidence pool and snapshot save/delete actions', () => {
    expect(doubt).toContain('j.entries.counterevidencePool');
    expect(doubt).toContain('j.doubtJournal.getSnapshots');
    expect(doubt).toContain('journal.doubtJournal.saveSnapshot');
    expect(doubt).toContain('journal.doubtJournal.deleteSnapshot');
    expect(markup).toContain("confirmAttrs={{ 'data-confirm-delete-doubt-snapshot': '' }}");
  });

  it('reads section colors from activeFlag shell roles', () => {
    expect(doubt).toContain("from '$lib/theme/activeFlag.svelte'");
    expect(doubt).toContain("from '$lib/theme/roles'");
  });

  it('renders visual charts for 30-day timeline and affirming themes', () => {
    expect(doubt).toContain("from '$lib/components/kit/ChartCard.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/AreaChart.svelte'");
    expect(doubt).toContain("from '$lib/components/kit/BarRows.svelte'");
    expect(markup).toContain('kind="timeline"');
    expect(markup).toContain('kind="affirming-themes"');
  });
});

describe('the letters, photos and voice sources (ticket 14, widened by ticket 21)', () => {
  /* Ticket 14 showed one letter here; phase 8 features ticket 21 widened
     that to every unlocked one, capped, with the rest a tap away. What is
     pinned is the seal rule staying in letterRetrospective.ts, the cap
     existing at all, and the letters keeping their own card rather than
     being folded into the flat counterevidence list. */
  it('lists the unlocked letters through safeSpaceLetters, capped, with an overflow row to the letters screen', () => {
    expect(doubt).toContain("from '$lib/data/letterRetrospective'");
    expect(doubt).toContain('safeSpaceLetters(');
    expect(doubt).toContain("from '$lib/components/LookBackLetterCard.svelte'");
    expect(doubt).toMatch(/LETTER_LIMIT\s*=\s*\d+/);
    expect(doubt).toContain('unlockedLetters.length > LETTER_LIMIT');
    expect(markup).toContain('<LookBackLetterCard');
    // Under the card, not a last row in it: a row there wore the letters'
    // own disc and chevron and read as a fourth letter.
    expect(markup).toMatch(/<\/ListCard>[\s\S]*?<a[^>]*data-all-letters[^>]*href="\/transition\/letters"/);
    expect(markup).toMatch(/m\.safe_space_letters_all\(\{\s*count:\s*unlockedLetters\.length - LETTER_LIMIT\s*\}\)/);
    // Its own card, not one more row inside the counterevidence list.
    expect(markup).toMatch(/<ListCard[\s\S]*?<LookBackLetterCard/);
  });

  it('leads a Safe Space letter row with the letter, not with its date', () => {
    expect(markup).toMatch(/<LookBackLetterCard[^>]*lead="text"/);

    // The other two surfaces keep the retrospective's own framing, where the
    // date is why the letter is there at all.
    expect(read('src/routes/on-this-day/+page.svelte')).not.toMatch(/<LookBackLetterCard[^>]*lead=/);
    expect(read('src/lib/components/WrappedYear.svelte')).not.toMatch(/<LookBackLetterCard[^>]*lead=/);

    const kit = read('src/lib/styles/kit.css');
    expect(kit).toContain("[data-list-row='letter-preview'][data-lead='text'] .kit-row-title");
    expect(kit).toContain("[data-list-row='letter-preview'][data-lead='date'] .kit-row-sub");
  });

  it('shows a letter as a preview that links to the whole thing, and cuts that preview in code as well as in CSS', () => {
    // The tap target is the letter's own screen, and the screen itself does
    // no cutting: the card asks letterOpening for it, so what a row
    // announces is what a row draws rather than the whole letter.
    const letterBlock = markup.match(/{#each letters[\s\S]*?{\/each}/)?.[0] ?? '';
    expect(letterBlock).toContain('<LookBackLetterCard');

    const card = read('src/lib/components/LookBackLetterCard.svelte');
    expect(card).toContain('href={`/transition/letters/${letter.id}`}');
    expect(card).toContain('letterOpening(letter.text, LETTER_OPENING_LIMIT)');
    expect(card).not.toMatch(/title=\{letter\.text\}|subtitle=\{letter\.text\}/);
  });

  it('reads starred photos and caps how many it shows', () => {
    expect(doubt).toContain('j.photos.starredPhotos');
    expect(doubt).toContain("from '$lib/components/PhotoThumb.svelte'");
    expect(markup).toContain('<PhotoThumb');
    expect(doubt).toMatch(/PHOTO_LIMIT\s*=\s*\d+/);
  });

  it('runs no query against voice_benchmark - ticket 15/16 have not shipped that table to read', () => {
    // The comment explaining the deferral is allowed to name the table;
    // no call or query string may reach for it.
    expect(doubt).not.toMatch(/\bj\.voiceBenchmark\b/);
    expect(doubt).not.toMatch(/FROM\s+voice_benchmark/i);
    expect(doubt).not.toContain('voiceBenchmarkQuery');
  });

  it('adds no click handler to the letter or photo evidence - the screen stays read-only', () => {
    const letterBlock = markup.match(/<LookBackLetterCard[\s\S]*?\/>/)?.[0] ?? '';
    const photoBlock = markup.match(/<div class="photo-grid"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(letterBlock).not.toContain('onclick');
    expect(photoBlock).not.toContain('onclick');
  });
});

describe('the support directory panel', () => {
  it('renders as its own ListCard/ListRow panel, not a heading action link, pointing at the existing directory', () => {
    expect(doubt).toContain("from '$lib/components/kit/ListRow.svelte'");
    expect(markup).not.toContain('kit-heading-action');
    expect(markup).toMatch(/<ListCard[^>]*>\s*<ListRow[\s\S]*?href="\/practice\/resources"/);
    expect(markup).toContain('title={m.resources_title()}');
    expect(markup).toContain('subtitle={m.resources_row_sub()}');
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
