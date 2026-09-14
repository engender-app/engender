/* What both transports share (ticket 46): the clock, and the rule that one
   thing plays at a time. */

/**
 * A position or a duration, the way a transport writes it: `0:07`, `1:02`,
 * and hours only once there are any. Seconds are floored, because the
 * seventh second is still 0:07 until it is over - a clock that rounds shows
 * a 0:07 recording ending at 0:08.
 *
 * A duration the browser has not worked out yet arrives as NaN and reads as
 * 0:00 rather than as a hole in the row.
 */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/* Whatever is playing right now, app-wide and across both media. A recording
   playing under one entry and a video note playing under another are two
   voices in a room, and the second one starting is how a person says they
   are done with the first. */
let current: (() => void) | null = null;

/**
 * Takes the app's one playback slot, stopping whatever held it. Returns a
 * release to call when this player stops of its own accord; releasing a
 * claim that has already been taken over does nothing, since that player
 * was stopped when it lost it.
 */
export function claimPlayback(stop: () => void): () => void {
  const previous = current;
  current = stop;
  if (previous) previous();

  return () => {
    if (current === stop) current = null;
  };
}
