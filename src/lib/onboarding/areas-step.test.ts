import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_ONBOARDING_AREAS, defaultPins } from '../data/pinnedRows';
import { HUB_ROWS, hubSections } from '../data/hubRows';
import { completeSetup, type SetupCompletion } from './complete';

describe('onboarding areas step and Today pins', () => {
  it('keeps the previous default pins for older journals without a setup answer', () => {
    const pins = defaultPins(null);
    expect(pins).toEqual(DEFAULT_ONBOARDING_AREAS);
  });

    it('pins exactly the chosen area when one area is selected', () => {
    const pins = defaultPins(['care']);
    expect(pins).toEqual(['care']);
  });

  it('pins chosen areas in HUB_ROWS registry order without central ranking', () => {
    const pins = defaultPins(['tryouts', 'care']);
    const expected = HUB_ROWS.filter((r) => ['tryouts', 'care'].includes(r.key)).map((r) => r.key);
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

  /* Two steps since after-release 17 (UX-09), so each says one thing: the
     pins step what a pin is, the features step what off means. */
  it('explains pinning and feature visibility on their own steps in both languages', () => {
    const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));
    const pl = JSON.parse(readFileSync('messages/pl.json', 'utf8'));

    expect(en.ob_areas_title.toLowerCase()).toContain('pin');
    expect(en.ob_areas_body).not.toContain('features');
    expect(en.ob_areas_body).toContain('Transition');
    expect(en.ob_areas_body).toContain('Today');

    expect(pl.ob_areas_title.toLowerCase()).toContain('przypiąć');
    expect(pl.ob_areas_body).not.toContain('funkcje');
    expect(pl.ob_areas_body).toContain('Tranzycji');
    expect(pl.ob_areas_body).toContain('Dziś');

    expect(en.ob_areas_preview_title).toBeUndefined();
    expect(en.ob_features_body).toContain('hidden');
    expect(pl.ob_features_body).toContain('ukryte');
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

  /* After-release 17 (UX-09): the preview card and the feature toggles left
     the pins step. The features are a step of their own before it, and the
     pins step offers Measurements only when that feature is on. */
  it('draws the pins as the choice, with the features on their own step', () => {
    const svelte = readFileSync('src/routes/onboarding/+page.svelte', 'utf8');

    expect(svelte).not.toContain('data-setup-areas-preview');
    expect(svelte).not.toContain('data-preview-pin');
    expect(svelte).toContain('class="setup-areas"');
    expect(svelte).toContain("step === 'features'");
    expect(svelte).toContain('key="feature-genital-effects"');
    expect(svelte).toContain('data-leave-setup');
    expect(svelte).toContain('data-skip-step');
  });
});
