/* The arrow-key half of the ARIA radio group pattern: which option a
   Left/Up or Right/Down press moves to, wrapping at either end so the last
   option's next stop is the first rather than nowhere. Shared by
   Segmented.svelte and kit/MoodChips.svelte, which otherwise have nothing in
   common - a scrolling track and a pointer magnifier respectively - so only
   this arithmetic is factored out rather than the controls themselves. */

/** `null` for any key that is not one of the four arrows, so a caller can
    tell "not an arrow" from "arrow that didn't move" apart - the latter
    never happens here since a single-option group still wraps to itself. */
export function nextRadioIndex(key: string, current: number, count: number): number | null {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  return null;
}
