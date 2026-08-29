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

  it('renders a statistics TileGrid with streak and good moments', () => {
    expect(markup).toContain('<TileGrid');
    expect(markup).toContain('key="streak"');
    expect(markup).toContain('key="evidence"');
    expect(doubt).toContain('j.stats.streak');
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

describe('More hub row for Safe Space', () => {
  it('points to /doubt with safe_space_title and safe_space_hub_sub', () => {
    expect(more).toContain("key: 'doubt', icon: 'heart', title: () => m.safe_space_title(), subtitle: () => m.safe_space_hub_sub(), href: '/doubt'");
  });
});
