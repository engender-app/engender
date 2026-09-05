/* Which of the entry editor's contextual cards show, and on whose say-so
   (phase 8 features ticket 04, ADR-0043, ADR-0052).

   Two claims, and both are about the editor asking a shared question rather
   than answering it for itself. The questions themselves are pure and tested
   next door (cycleTracking.test.ts, areaState.test.ts); what a test can only
   check here is that this screen reaches them, because a `.svelte` file has
   no node-tier mount (ADR-0016) and the defect being fixed was precisely a
   screen that asked nobody.

   A source contract, the same shape ClinicianSummaryDossier.test.ts and the
   clinician summary's print-parity test already use for components this
   suite cannot render. It is weaker than a rendered assertion and it fails
   the moment somebody puts the preference back, which is the regression it
   is here for. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
/* Relative, not `$lib`: the node tier has no alias (vitest.config.ts). */
import { cycleTrackingVisible } from '../data/cycleTracking.ts';
import { areaQuiet, type AreaStates } from '../data/areaState.ts';
import type { RegimenEpisode } from '../data/types.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const editor = readFileSync(root + '/src/lib/components/EntryEditor.svelte', 'utf8');

const testosterone: RegimenEpisode = {
  id: 'ep-t',
  drug: 'Testosterone cypionate',
  ester: null,
  dose: 50,
  doseUnit: 'mg',
  route: 'im',
  interval: '7 days',
  startEpochDay: 19000,
  endEpochDay: null
};

describe("the editor's cycle affordance (ADR-0043)", () => {
  it('asks the shared gate rather than reading the preference', () => {
    expect(editor).toContain('cycleTrackingVisible(');
    expect(editor).not.toContain('$derived(prefs.cycleTrackingEnabled)');
  });

  it('gates the cycle panel on the gate it asked', () => {
    expect(editor).toContain('{#if cycleTrackingActive}');
    expect(editor).toContain('data-contextual="cycle-event"');
  });

  it('shows for a testosterone regimen with the preference never touched', () => {
    /* The reader the fix is for: somebody on testosterone who never opened
       Settings got the More row and the side-effects section and not this,
       which is the one surface a cycle event is logged from. */
    expect(cycleTrackingVisible([testosterone], Date.now(), false)).toBe(true);
    expect(cycleTrackingVisible([], Date.now(), false)).toBe(false);
    expect(cycleTrackingVisible([], Date.now(), true)).toBe(true);
  });
});

describe("the editor's effects card, and the cascade (ADR-0052)", () => {
  it('goes quiet when the personal effects area is quiet', () => {
    expect(editor).toContain("areaQuiet('personalEffects'");
    expect(editor).toContain('prefs.entryHrtEffectsEnabled && isHrtActive && !effectsQuiet');
  });

  it('is the only card on this screen belonging to a finishable area', () => {
    /* The other three contextual cards are a tryout, a scheduled dose and a
       procedure's recovery, and none of those areas can be finished at all
       (areaState.ts's NOT_FINISHABLE) - each already ends per record. So one
       gate here is the whole of the editor's share of the cascade, and the
       registry covers the tiles and the notifications. */
    for (const card of ['entryTryoutPromptEnabled', 'entryDoseQuickLogEnabled', 'entryProcedureRecoveryEnabled']) {
      expect(editor).toContain(card);
    }
    expect(editor.match(/effectsQuiet/g)?.length).toBe(2);
  });

  it('reads the finish against today, not against the entry being written', () => {
    // A backdated entry is not a way back into a prompt somebody switched off.
    expect(editor).toContain('areaQuiet(\'personalEffects\', areaStatesQuery.value ?? {}, todayEpochDay())');

    const finished: AreaStates = { personalEffects: { hidden: false, finishedEpochDay: 19900, suspendedEpochDay: null } };
    expect(areaQuiet('personalEffects', finished, 20000)).toBe(true);
    expect(areaQuiet('personalEffects', {}, 20000)).toBe(false);
  });
});
