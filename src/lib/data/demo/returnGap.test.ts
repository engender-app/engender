/* Phase 11 all-four-doors ticket 23: the return-gap seed's own era must not
   overlap the persona's, which `eras.ts`'s no-overlap invariant enforces on
   write (`journal/eras.ts`'s `upsertEra`). `seedReturnGap` itself can't run
   in the Node tier - `seedPersonaJournal`'s photos need a DOM - so this
   tests the pure day-picking logic it relies on instead. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { firstDayAfterPersonaEras } from './returnGap.ts';
import { persona } from './persona.ts';

test('starts the day after the latest persona era ends', () => {
  assert.equal(
    firstDayAfterPersonaEras([
      { endEpochDay: 100 },
      { endEpochDay: 300 },
      { endEpochDay: 200 }
    ]),
    301
  );
});

test('lands after every one of the real persona eras, for any anchor', () => {
  for (const anchor of [19000, 20000, 25000]) {
    const eras = persona(anchor).eras;
    const start = firstDayAfterPersonaEras(eras);
    for (const era of eras) assert.ok(start > era.endEpochDay, `${start} <= ${era.name}'s end ${era.endEpochDay}`);
  }
});
