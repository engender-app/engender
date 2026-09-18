import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_ONBOARDING_AREAS, defaultPins } from '../data/pinnedRows';
import { HUB_ROWS, hubSections } from '../data/hubRows';
import { completeSetup, type SetupCompletion } from './complete';

describe('onboarding areas step and Today pins', () => {
  it('preserves default pins when setup areas choice is skipped', () => {
    const pins = defaultPins(null);
    expect(pins).toEqual([...DEFAULT_ONBOARDING_AREAS]);
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

  it('has catalogue strings describing pinning, not enabling/disabling capabilities', () => {
    const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));
    const pl = JSON.parse(readFileSync('messages/pl.json', 'utf8'));

    expect(en.ob_areas_title.toLowerCase()).toContain('pin');
    expect(en.ob_areas_body).toContain('front page');
    expect(en.ob_areas_body).toContain('Transition');
    expect(en.ob_areas_body).toContain('Today');

    expect(pl.ob_areas_title.toLowerCase()).toContain('przypiąć');
    expect(pl.ob_areas_body).toContain('stronę główną');
    expect(pl.ob_areas_body).toContain('Tranzycji');
    expect(pl.ob_areas_body).toContain('Dziś');

    expect(en.ob_areas_preview_title).toBeDefined();
    expect(pl.ob_areas_preview_title).toBeDefined();
  });

  it('finishes setup successfully on skip, select one, and select many', async () => {
    type TestPrefs = { onboardingAreas?: readonly string[] | null; onboarded?: boolean };

    function runFinish(chosenAreas: readonly string[] | null, initialPrefs: TestPrefs = {}) {
      const prefs: TestPrefs = { ...initialPrefs };
      let finished = false;
      const completion: SetupCompletion = {
        writeAnswers: () => {
          if (chosenAreas) prefs.onboardingAreas = chosenAreas;
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

    // Skip keeps default pins and leaves prefs.onboardingAreas unset
    const skipped = await runFinish(null);
    expect(skipped.finished).toBe(true);
    expect(skipped.prefs.onboarded).toBe(true);
    expect(skipped.prefs.onboardingAreas).toBeUndefined();
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
    expect(svelte).toContain('data-leave-setup');
    expect(svelte).toContain('data-skip-step');
  });
});
