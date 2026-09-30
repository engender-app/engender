/* The wording a dose row's trailing attribution uses (audit U8, ticket 17).
   Whether the row shows it at all is `showAttributionLabel`'s question,
   tested with the rest of regimenEpisode. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

// $lib has no alias on the plain node tier (vitest.config.ts) - real
// messages, reached by the relative path everything else on this tier
// uses, rather than a hand-written fake that could drift from the actual
// English copy this test means to pin down.
vi.mock('$lib/paraglide/messages', async () => await import('../../paraglide/messages.js'));

import type { DoseAttribution } from '../regimenEpisode.ts';

const { attributionLabel } = await import('./doseLabels.ts');

const resolved: DoseAttribution = {
  episode: {
    id: 'ep-1', drug: 'Estradiol valerate', ester: null, dose: 4, doseUnit: 'mg', route: 'im',
    interval: 'P2W', startEpochDay: 0, endEpochDay: null, endReason: null
  },
  ambiguous: false
};

test('the three attribution states each have their own wording', () => {
  assert.equal(attributionLabel(resolved), 'under Estradiol valerate');
  assert.equal(attributionLabel({ episode: null, ambiguous: false }), 'No regimen episode covers this date');
  assert.equal(
    attributionLabel({ episode: null, ambiguous: true }),
    'More than one regimen was active: drug not recorded'
  );
});
