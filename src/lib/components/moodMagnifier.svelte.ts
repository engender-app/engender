/* The mood row's magnifier wiring, shared by the two plain rows - the
   entry editor's picker and Home's chips. The scales live here so the
   rows carry only handlers; the cell math itself is magnifier.ts's
   (magnifyRow, gazeRow), and the fan keeps its own loop because it also arms
   a target mid-gesture.

   It carries the gaze as well as the scale now (phase 9 carpet ticket 01).
   The two are one gesture read two ways: the scale says which face the finger
   is on, which only one face can answer, and the gaze says the row is being
   crossed, which all five can. Both come off the same pointermove and both
   rest together, so a row can never be left half-answering.

   `moodGaze` is null while nothing is happening, which is not the same as
   zero: null is "carry on looking around", zero is "look straight at the
   finger, it is on you". MoodFace's two nested groups are what keep those
   apart. */
import { isReducedMotion } from '$lib/motion/tokens';
import { gazeRow, gazeToCell, magnifyRow } from '$lib/motion/magnifier';

/** How long the four unpicked faces keep looking at the one that was picked.
    Long enough to be seen as a look rather than a flinch, short enough that
    it is over before a hand has moved on - and it releases on its own, so the
    beat ends whether or not the row is still on screen. Not a --dur-* token:
    this is how long a state is held, not how long a movement takes, and the
    movement into and out of it is the gaze's own --dur-fast. */
const PICK_HOLD_MS = 700;

export function moodMagnifier(count: number) {
  const resting = Array.from({ length: count }, () => 1);
  let moodScale = $state<number[]>(resting.slice());
  let moodGaze = $state<(number | null)[]>(Array.from({ length: count }, () => null));
  let pickTimer: ReturnType<typeof setTimeout> | undefined;

  function releaseGaze() {
    moodGaze = Array.from({ length: count }, () => null);
  }

  function clearPick() {
    if (pickTimer === undefined) return;
    clearTimeout(pickTimer);
    pickTimer = undefined;
  }

  function onRowMove(e: PointerEvent) {
    if (isReducedMotion()) return;
    /* A finger arriving cancels the pick's beat rather than queueing behind
       it: whatever the row was saying about the last choice, the live gesture
       is more current than it is. */
    clearPick();
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moodScale = magnifyRow(e.clientX, row, count);
    moodGaze = gazeRow(e.clientX, row, count);
  }
  function rest() {
    moodScale = resting.slice();
    if (pickTimer === undefined) releaseGaze();
  }
  function onRowRelease() {
    rest();
  }
  function onRowLeave() {
    rest();
  }

  /** The beat after a choice: the four that were not picked turn to look at
      the one that was, then everyone goes back to their own business. Called
      by the row from its own click handler, since only the row knows which
      cell the value it just sent lives in. */
  function onPick(index: number | null) {
    if (isReducedMotion()) return;
    clearPick();
    if (index === null) {
      releaseGaze();
      return;
    }
    moodGaze = gazeToCell(index, count);
    pickTimer = setTimeout(() => {
      pickTimer = undefined;
      releaseGaze();
    }, PICK_HOLD_MS);
  }

  return {
    get moodScale() {
      return moodScale;
    },
    get moodGaze() {
      return moodGaze;
    },
    onRowMove,
    onRowRelease,
    onRowLeave,
    onPick
  };
}
