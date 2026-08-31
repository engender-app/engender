/* Surface and contract tests for Safe Space dashboard (ticket 52, ADR-0040).
   Verifies that /doubt uses kit surfaces, integrates BreathingExercise,
   renders grounding statistics in TileGrid, preserves counterevidence pool and
   snapshot save/delete flows, and that More hub reflects the Safe Space title and copy. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

  it('renders a statistics TileGrid with streak and good moments, opted into the tight two-up variant', () => {
    expect(markup).toContain('<TileGrid');
    expect(markup).toContain('key="streak"');
    expect(markup).toContain('key="evidence"');
    expect(doubt).toContain('j.stats.streak');
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

describe('the three more sources ticket 14 adds', () => {
  it('features the most recently unlocked letter through featuredLetter, not the full list', () => {
    expect(doubt).toContain("from '$lib/data/letterRetrospective'");
    expect(doubt).toContain('featuredLetter(');
    expect(doubt).toContain("from '$lib/components/LookBackLetterCard.svelte'");
    expect(markup).toContain('<LookBackLetterCard');
    // Not folded into the flat counterevidence list as one more row.
    expect(markup).not.toMatch(/<LookBackLetterCard[^>]*>\s*{#each/);
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
    expect(markup).toMatch(/<ListCard[^>]*>\s*<ListRow[\s\S]*?href="\/settings\/resources"/);
    expect(markup).toContain('title={m.resources_title()}');
    expect(markup).toContain('subtitle={m.resources_row_sub()}');
  });
});

describe('More hub row for Safe Space', () => {
  it('points to /doubt with safe_space_title and safe_space_hub_sub', () => {
    expect(more).toContain("key: 'doubt', icon: 'heart', title: () => m.safe_space_title(), subtitle: () => m.safe_space_hub_sub(), href: '/doubt'");
  });
});

describe('Home live tile for Safe Space nudge (ticket 50)', () => {
  const home = read('src/routes/+page.svelte');
  const homeMarkup = home.replace(/<script[\s\S]*?<\/script>/g, '');

  it('wires the Safe Space live tile with latestBadMomentEntry query and dismissal handling', () => {
    expect(home).toContain("from '$lib/data/safeSpaceNudge'");
    expect(home).toContain('j.entries.latestBadMomentEntry');
    expect(home).toContain('shouldShowSafeSpaceNudge');
    expect(homeMarkup).toContain('data-live-tile="safe-space-nudge"');
    expect(homeMarkup).toContain('data-safe-space-nudge-tile');
    expect(homeMarkup).toContain('data-safe-space-nudge-dismiss');
    expect(homeMarkup).toContain('href="/doubt"');
  });
});
