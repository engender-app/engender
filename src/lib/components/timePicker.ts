/* The arithmetic under TimePicker (phase 12 pickers, ticket 02), kept out of
   the components so the node tier can hold it: what a typed time means,
   which row of a drum sits in its band, and where a key moves it.

   A time is the string an `<input type="time">` holds, `HH:MM` on a 24-hour
   clock, so every caller keeps the value it stored before the picker. */

export type Time = { hour: number; minute: number };

/** A typed time, or null. One or two digits of hour and two of minute,
    with a colon or the dot a time is often written with by hand. */
export function parseTime(text: string): Time | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The row a drum scrolled this far has in its band. */
export function drumIndex(scrollTop: number, rowHeight: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / rowHeight)));
}

/** Where a key moves a drum of `count` rows, or null for a key that is not
    a step. Up is the next value, the spinbutton's convention, and the drum
    holds at its ends: it shows no row past 23 or 59 to wrap round to. */
export function drumStep(key: string, index: number, count: number): number | null {
  const to =
    key === 'ArrowUp' ? index + 1
    : key === 'ArrowDown' ? index - 1
    : key === 'PageUp' ? index + 10
    : key === 'PageDown' ? index - 10
    : key === 'Home' ? 0
    : key === 'End' ? count - 1
    : null;
  return to === null ? null : Math.min(count - 1, Math.max(0, to));
}
