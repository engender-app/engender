/* The reactive AcknowledgementStore: the `acknowledgements` preference seen
   through the object every screen already reads. Screens and the tile grid
   pass this to letterStatus.ts and liveTilesSnooze.ts; their tests pass a
   memory store instead. A read is reactive because `prefs` is, and a write
   goes through the same proxy as any other preference, so it is held until
   the journal opens like the rest. */

import type { AcknowledgementStore } from '../acknowledgements';
import { prefs } from './store.svelte';

export const acknowledgementStore: AcknowledgementStore = {
  read: () => prefs.acknowledgements,
  write: (next) => {
    prefs.acknowledgements = next;
  }
};
