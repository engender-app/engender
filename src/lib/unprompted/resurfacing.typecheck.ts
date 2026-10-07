import type { Journal } from '../data/journal/journal';
import { resurfacing } from './resurfacing';

// Kept out of runtime: svelte-check verifies these rejected calls.
function registeredSurfaceRequired(journal: Journal) {
  // @ts-expect-error A resurfacing read must name its registered surface.
  void resurfacing(journal);
  // @ts-expect-error Unknown surfaces must join the registry before reading.
  void resurfacing('new-surface', journal);
  void resurfacing('wrapped-share', journal);
}
