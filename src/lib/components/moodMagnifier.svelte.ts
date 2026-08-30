/* The mood row's magnifier wiring, shared by the two plain rows - the
   entry editor's picker and Home's chips. The scales live here so the
   rows carry only handlers; the cell math itself is magnifier.ts's
   (magnifierRow), and the fan keeps its own loop because it also arms a
   target mid-gesture. */
import { isReducedMotion } from '$lib/motion/tokens';
import { magnifyRow } from '$lib/motion/magnifier';

export function moodMagnifier(count: number) {
  const resting = Array.from({ length: count }, () => 1);
  let moodScale = $state<number[]>(resting.slice());

  function onRowMove(e: PointerEvent) {
    if (isReducedMotion()) return;
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moodScale = magnifyRow(e.clientX, row, count);
  }
  function onRowRelease() {
    moodScale = resting.slice();
  }
  function onRowLeave() {
    moodScale = resting.slice();
  }

  return {
    get moodScale() {
      return moodScale;
    },
    onRowMove,
    onRowRelease,
    onRowLeave
  };
}
