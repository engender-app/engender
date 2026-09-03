import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { journalWithBuiltIns } from '../src/lib/data/journal/test-support.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('tryout-to-milestone adoption pipeline', () => {
  it('adopts an active name tryout, closes the date range and mints a timeline milestone with felt-sense majority rating', async () => {
    const { journal } = await journalWithBuiltIns();

    const tryoutId = await journal.tryouts.upsertTryout({
      kind: 'name',
      label: 'Alicja',
      startEpochDay: 19000,
      endEpochDay: null
    });

    // Add felt-sense entries with a majority mood (mood 5 appears twice, mood 4 once)
    await journal.feltSense.add({ tryoutId }, { epochDay: 19005, mood: 5, note: 'felt so natural' });
    await journal.feltSense.add({ tryoutId }, { epochDay: 19010, mood: 4, note: 'ordering coffee' });
    await journal.feltSense.add({ tryoutId }, { epochDay: 19015, mood: 5, note: 'work meeting' });

    const result = await journal.tryouts.adoptTryout(tryoutId, {
      endEpochDay: 19042,
      createMilestone: true,
      milestoneTitle: 'Adopted name Alicja',
      milestoneEpochDay: 19042
    });

    expect(result.tryoutId).toBe(tryoutId);
    expect(result.milestoneId).toBeDefined();

    // Verify tryout is now closed with endEpochDay
    const tryouts = await journal.tryouts.getTryouts();
    const tryout = tryouts.find((t) => t.id === tryoutId);
    expect(tryout).toBeDefined();
    expect(tryout?.endEpochDay).toBe(19042);

    // Verify milestone was minted and shows on timeline
    const milestones = await journal.milestones.getMilestones();
    const createdMilestone = milestones.find((m) => m.id === result.milestoneId);
    expect(createdMilestone).toBeDefined();
    expect(createdMilestone?.name).toBe('Adopted name Alicja');
    expect(createdMilestone?.epochDay).toBe(19042);

    // Verify majority felt-sense rating (5) is attached to the milestone
    const milestoneFeelings = await journal.feltSense.forMilestone(result.milestoneId!);
    expect(milestoneFeelings).toHaveLength(1);
    expect(milestoneFeelings[0].mood).toBe(5);
    expect(milestoneFeelings[0].epochDay).toBe(19042);
  });

  it('adopts a pronoun tryout without creating a milestone when requested', async () => {
    const { journal } = await journalWithBuiltIns();

    const tryoutId = await journal.tryouts.upsertTryout({
      kind: 'pronouns',
      label: 'she/her',
      startEpochDay: 19000,
      endEpochDay: null
    });

    const result = await journal.tryouts.adoptTryout(tryoutId, {
      endEpochDay: 19030,
      createMilestone: false
    });

    expect(result.tryoutId).toBe(tryoutId);
    expect(result.milestoneId).toBeUndefined();

    const tryouts = await journal.tryouts.getTryouts();
    const tryout = tryouts.find((t) => t.id === tryoutId);
    expect(tryout?.endEpochDay).toBe(19030);

    const milestones = await journal.milestones.getMilestones();
    expect(milestones).toHaveLength(0);
  });

  it('tryout detail page includes the Adopt Permanently action and confirmation sheet', () => {
    const tryoutDetail = read('src/routes/settings/tryouts/[id]/+page.svelte');
    expect(tryoutDetail).toContain('data-adopt-tryout');
    expect(tryoutDetail).toContain('AdoptTryoutConfirmationSheet');
    /* The adoption write moved into the offer registry (phase 8 features
       ticket 22) and this screen reaches it through `answerOffer`, which is
       the only path from the sheet to a write. */
    expect(tryoutDetail).toContain("OFFERS['tryout-adoption-milestone']");
    expect(tryoutDetail).toContain('answerAdoptOffer');
    expect(tryoutDetail).not.toContain('journal.tryouts.adoptTryout');
  });

  it('AdoptTryoutConfirmationSheet component complies with design system and offers required controls', () => {
    const sheetCode = read('src/lib/components/AdoptTryoutConfirmationSheet.svelte');
    expect(sheetCode).toContain('data-adopt-duration');
    expect(sheetCode).toContain('data-adopt-majority-mood');
    expect(sheetCode).toContain('data-adopt-profile-option');
    expect(sheetCode).toContain('data-confirm-adopt-milestone');
    expect(sheetCode).toContain('data-adopt-without-milestone');
    expect(sheetCode).toContain('data-dismiss-adopt');
    expect(sheetCode).toContain('DatePicker');
    expect(sheetCode).toContain('MoodFace');
  });
});
