import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from '../src/lib/data/journal/test-support.ts';
import { PREFERENCE_DEFAULTS, DEVICE_LOCAL_KEYS } from '../src/lib/data/prefs/catalogue.ts';
import { OFFERS, answerOffer, milestoneMintedByGoal } from '../src/lib/data/offers.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('roadmap to milestone sync (ticket 10, ADR-0045)', () => {
  it('defaults prefs.roadmapMilestoneSyncEnabled to true and is device-local', () => {
    expect(PREFERENCE_DEFAULTS.roadmapMilestoneSyncEnabled).toBe(true);
    expect(DEVICE_LOCAL_KEYS).toContain('roadmapMilestoneSyncEnabled');
  });

  it('stores and retrieves roadmapGoalKey on milestone', async () => {
    const { journal } = await journalWithBuiltIns();
    await journal.roadmap.setGoalStatus('pl', 'pl-social-tell-one-person', 'checked');

    const id = await journal.milestones.upsertMilestone({
      name: 'Came out to my best friend',
      epochDay: 20100,
      roadmapGoalKey: 'pl-social-tell-one-person'
    });

    const milestones = await journal.milestones.getMilestones();
    const found = milestones.find((m) => m.id === id);
    assert.ok(found);
    expect(found.name).toBe('Came out to my best friend');
    expect(found.roadmapGoalKey).toBe('pl-social-tell-one-person');
  });

  it('allows updating milestone while preserving roadmapGoalKey', async () => {
    const { journal } = await journalWithBuiltIns();
    const id = await journal.milestones.upsertMilestone({
      name: 'Initial Name',
      epochDay: 20100,
      roadmapGoalKey: 'pl-legal-birth-certificate'
    });

    await journal.milestones.upsertMilestone({
      id,
      name: 'Updated Name',
      epochDay: 20105,
      roadmapGoalKey: 'pl-legal-birth-certificate'
    });

    const milestones = await journal.milestones.getMilestones();
    const found = milestones.find((m) => m.id === id);
    assert.ok(found);
    expect(found.name).toBe('Updated Name');
    expect(found.epochDay).toBe(20105);
    expect(found.roadmapGoalKey).toBe('pl-legal-birth-certificate');
  });

  it('gracefully unlinks: deleting milestone leaves roadmap goal checked (ADR-0045)', async () => {
    const { journal } = await journalWithBuiltIns();
    await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-fee', 'checked');

    const id = await journal.milestones.upsertMilestone({
      name: 'Court fee paid',
      epochDay: 20200,
      roadmapGoalKey: 'pl-legal-court-fee'
    });

    // Delete milestone
    await journal.milestones.deleteMilestone(id);

    // Milestone is deleted
    const milestones = await journal.milestones.getMilestones();
    expect(milestones.some((m) => m.id === id)).toBe(false);

    // Roadmap goal checkmark remains checked
    const statuses = await journal.roadmap.getGoalStatuses('pl');
    expect(statuses['pl-legal-court-fee']).toBe('checked');
  });

  it('wires roadmap page to RoadmapMilestonePromptSheet with confirmation flow', () => {
    /* The write moved into the offer registry (phase 8 features ticket 22)
       and the screen reaches it through `answerOffer`, which is the only
       path there is. What a confirmation actually writes is asserted below
       against the entry itself, which is where it now lives. */
    const roadmapSrc = read('src/routes/transition/roadmap/+page.svelte');
    expect(roadmapSrc).toContain("import RoadmapMilestonePromptSheet from '$lib/components/RoadmapMilestonePromptSheet.svelte'");
    expect(roadmapSrc).toContain('prefs.roadmapMilestoneSyncEnabled');
    expect(roadmapSrc).toContain('<RoadmapMilestonePromptSheet');
    expect(roadmapSrc).toContain("OFFERS['roadmap-goal-milestone']");
    expect(roadmapSrc).toContain('answerOffer(');
    expect(roadmapSrc).toContain('milestoneMintedByGoal(');
    expect(roadmapSrc).not.toContain('journal.milestones.upsertMilestone');
  });

  it('the offer this screen makes writes the goal key onto the milestone', async () => {
    const { journal } = await journalWithBuiltIns();
    await answerOffer(
      OFFERS['roadmap-goal-milestone'],
      { title: 'Court fee paid', epochDay: 20100, photo: null, goalKey: 'pl-legal-court-fee' },
      'confirm',
      journal
    );

    const milestones = await journal.milestones.getMilestones();
    expect(milestones.map((milestone) => [milestone.name, milestone.roadmapGoalKey])).toEqual([
      ['Court fee paid', 'pl-legal-court-fee']
    ]);
  });

  it('a goal that already minted its milestone is not offered again (ADR-0045)', async () => {
    /* Unchecking a goal and checking it again re-offered, and confirming a
       second time inserted a duplicate milestone against the same key. The
       screen asks `milestoneMintedByGoal` before it opens the sheet, so the
       second tick offers nothing. */
    const { journal } = await journalWithBuiltIns();
    await answerOffer(
      OFFERS['roadmap-goal-milestone'],
      { title: 'Court fee paid', epochDay: 20100, photo: null, goalKey: 'pl-legal-court-fee' },
      'confirm',
      journal
    );

    const milestones = await journal.milestones.getMilestones();
    expect(milestoneMintedByGoal(milestones, 'pl-legal-court-fee')?.name).toBe('Court fee paid');
    expect(milestoneMintedByGoal(milestones, 'pl-legal-birth-certificate')).toBe(null);
  });

  it('has confirmation and dismissal actions on RoadmapMilestonePromptSheet', () => {
    const sheetSrc = read('src/lib/components/RoadmapMilestonePromptSheet.svelte');
    expect(sheetSrc).toContain('data-confirm-milestone');
    expect(sheetSrc).toContain('data-dismiss-milestone');
    expect(sheetSrc).toContain('data-add-photo');
    expect(sheetSrc).toContain('data-capture-photo');
    expect(sheetSrc).toContain('DatePicker');
    expect(sheetSrc).toContain('PhotoThumb');
  });

  it('contains English and Polish translations for prompt and settings copy', () => {
    const en = JSON.parse(read('messages/en.json'));
    const pl = JSON.parse(read('messages/pl.json'));

    for (const key of [
      'roadmap_milestone_prompt_sheet_title',
      'roadmap_milestone_prompt_title',
      'roadmap_milestone_prompt_add',
      'roadmap_milestone_sync_title',
      'roadmap_milestone_sync_sub'
    ]) {
      expect(en[key], `en.${key}`).toBeDefined();
      expect(pl[key], `pl.${key}`).toBeDefined();
    }
  });
});
