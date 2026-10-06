import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_ONBOARDING_AREAS, defaultPins } from '../data/pinnedRows';
import { HUB_ROWS, hubSections } from '../data/hubRows';
import { completeSetup, type SetupCompletion } from './complete';
import { measurementsHiddenOnSetup } from './steps';
import { journalWithBuiltIns } from '../data/journal/test-support';
import { AREA_GROUPS } from '../data/areaGroups';
import { areasHidden } from '../data/areaState';

describe('onboarding areas step and Today pins', () => {
  it('keeps the previous default pins for older journals without a setup answer', () => {
    const pins = defaultPins(null);
    expect(pins).toEqual(['measurements', ...DEFAULT_ONBOARDING_AREAS]);
  });

  it('turns measurements off for a new journal unless explicitly selected', () => {
    expect(measurementsHiddenOnSetup(null, false, false)).toBe(true);
    expect(measurementsHiddenOnSetup(false, false, false)).toBe(true);
    expect(measurementsHiddenOnSetup(true, false, false)).toBe(false);
  });

  it('preserves an existing or restored journal when the setup choice is skipped', () => {
    expect(measurementsHiddenOnSetup(null, true, false)).toBeNull();
    expect(measurementsHiddenOnSetup(null, false, true)).toBeNull();
    expect(measurementsHiddenOnSetup(true, false, true)).toBe(false);
    expect(measurementsHiddenOnSetup(false, false, true)).toBe(true);
  });

  it('keeps pin choice independent of feature visibility', () => {
    expect(defaultPins(['measurements'])).toEqual(['measurements']);
    expect(measurementsHiddenOnSetup(null, false, false)).toBe(true);
    expect(defaultPins(['care'])).toEqual(['care']);
    expect(measurementsHiddenOnSetup(true, false, false)).toBe(false);
  });

  it('keeps hidden feature entry points quiet while saved records remain', async () => {
    const { journal } = await journalWithBuiltIns();
    expect((await journal.effectCategories.getEffectCategories()).find((c) => c.key === 'genital_sexual')?.enabled).toBe(false);
    const measurementId = await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 80, unit: 'cm' });
    await journal.areaStates.setAreasHidden(AREA_GROUPS.measurements, true);
    const states = await journal.areaStates.getAreaStates();
    const hubKeys = hubSections({ todayEpochDay: 20000, lastWrites: {}, states, forward: {} })
      .flatMap((section) => section.rows.map((row) => row.spec.key));
    expect(hubKeys).not.toContain('measurements');
    expect(areasHidden(AREA_GROUPS.measurements, states)).toBe(true);
    expect((await journal.measurements.getMeasurements('waist')).map((m) => m.id)).toEqual([measurementId]);

    await journal.effectCategories.setCategoryEnabled('genital_sexual', true);
    expect((await journal.effectCategories.getEffectCategories()).find((c) => c.key === 'genital_sexual')?.enabled).toBe(true);
  });

  it('keeps an upgraded journal’s feature choices during built-in reconciliation', async () => {
    const { journal } = await journalWithBuiltIns();
    await journal.areaStates.setAreasHidden(AREA_GROUPS.measurements, false);
    await journal.effectCategories.setCategoryEnabled('genital_sexual', true);
    await journal.reconcileBuiltIns();

    expect(areasHidden(AREA_GROUPS.measurements, await journal.areaStates.getAreaStates())).toBe(false);
    expect((await journal.effectCategories.getEffectCategories()).find((c) => c.key === 'genital_sexual')?.enabled).toBe(true);
  });

  it('pins exactly the chosen area when one area is selected', () => {
    const pins = defaultPins(['care']);
    expect(pins).toEqual(['care']);
  });

  it('pins chosen areas in HUB_ROWS registry order without central ranking', () => {
    const pins = defaultPins(['tryouts', 'measurements', 'care']);
    const expected = HUB_ROWS.filter((r) => ['tryouts', 'measurements', 'care'].includes(r.key)).map((r) => r.key);
    expect(pins).toEqual(expected);
  });

  it('pins nothing when all areas are unticked', () => {
    const pins = defaultPins([]);
    expect(pins).toEqual([]);
  });

  it('leaves unselected areas reachable in Transition hub sections', () => {
    const sections = hubSections({ todayEpochDay: 20000, lastWrites: {}, states: {}, forward: {} });
    const allHubKeys = sections.flatMap((s) => s.rows.map((r) => r.spec.key));
    const selected = ['care'];
    const unselected = DEFAULT_ONBOARDING_AREAS.filter((k) => !selected.includes(k));
    for (const key of unselected) {
      expect(allHubKeys).toContain(key);
    }
  });

  it('explains pinning and feature visibility separately in both languages', () => {
    const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));
    const pl = JSON.parse(readFileSync('messages/pl.json', 'utf8'));

    expect(en.ob_areas_title.toLowerCase()).toContain('pin');
    expect(en.ob_areas_body).toContain('features');
    expect(en.ob_areas_body).toContain('Transition');
    expect(en.ob_areas_body).toContain('Today');

    expect(pl.ob_areas_title.toLowerCase()).toContain('przypiąć');
    expect(pl.ob_areas_body).toContain('funkcje');
    expect(pl.ob_areas_body).toContain('Tranzycji');
    expect(pl.ob_areas_body).toContain('Dziś');

    expect(en.ob_areas_preview_title).toBeDefined();
    expect(pl.ob_areas_preview_title).toBeDefined();
    expect(en.features_to_show_sub).toContain('hides');
    expect(pl.features_to_show_sub).toContain('ukrywa');
  });

  it('finishes setup successfully on skip, select one, and select many', async () => {
    type TestPrefs = { onboardingAreas?: readonly string[] | null; onboarded?: boolean };

    function runFinish(chosenAreas: readonly string[] | null, initialPrefs: TestPrefs = {}) {
      const prefs: TestPrefs = { ...initialPrefs };
      let finished = false;
      const completion: SetupCompletion = {
        writeAnswers: () => {
          if (chosenAreas) prefs.onboardingAreas = chosenAreas;
          else if (!initialPrefs.onboarded) prefs.onboardingAreas = [...DEFAULT_ONBOARDING_AREAS];
          prefs.onboarded = true;
        },
        flushWrites: async () => {},
        disguise: false,
        turnOnDisguise: async () => {},
        leaveSetup: () => {
          finished = true;
        }
      };
      return completeSetup(completion).then(() => ({ prefs, finished }));
    }

    // A new journal stores its three-item default when this step is skipped.
    const skipped = await runFinish(null);
    expect(skipped.finished).toBe(true);
    expect(skipped.prefs.onboarded).toBe(true);
    expect(skipped.prefs.onboardingAreas).toEqual([...DEFAULT_ONBOARDING_AREAS]);
    expect(defaultPins(skipped.prefs.onboardingAreas ?? null)).toEqual([...DEFAULT_ONBOARDING_AREAS]);

    // Select one writes the chosen area and resolves pins
    const one = await runFinish(['care']);
    expect(one.finished).toBe(true);
    expect(one.prefs.onboarded).toBe(true);
    expect(one.prefs.onboardingAreas).toEqual(['care']);
    expect(defaultPins(one.prefs.onboardingAreas ?? null)).toEqual(['care']);

    // Select many writes chosen areas and resolves pins in registry order
    const many = await runFinish(['tryouts', 'milestones']);
    expect(many.finished).toBe(true);
    expect(many.prefs.onboarded).toBe(true);
    expect(many.prefs.onboardingAreas).toEqual(['tryouts', 'milestones']);
    expect(defaultPins(many.prefs.onboardingAreas ?? null)).toEqual(
      HUB_ROWS.filter((r) => ['tryouts', 'milestones'].includes(r.key)).map((r) => r.key)
    );
  });

  it('renders Today preview card and all eleven choices on the areas step', () => {
    const svelte = readFileSync('src/routes/onboarding/+page.svelte', 'utf8');

    expect(svelte).toContain('data-setup-areas-preview');
    expect(svelte).toContain('data-preview-pin');
    expect(svelte).toContain('m.ob_areas_preview_title');
    expect(svelte).toContain('class="setup-areas"');
    expect(svelte).toContain('data-setup-feature-visibility');
    expect(svelte).toContain('key="feature-measurements"');
    expect(svelte).toContain('key="feature-genital-effects"');
    expect(svelte).toContain('data-leave-setup');
    expect(svelte).toContain('data-skip-step');
  });
});
