/* When the PIN wait is said out loud (after-release 21, audit L05-07).

   PinEntry redraws the remaining seconds every 250ms. That line used to be
   a `role="alert"`, so a screen reader was interrupted once a second for
   the whole wait. Now the line is only drawn, and this decides the two
   moments worth an interruption: the wait beginning and the wait being
   over. */
export function pinWaitSpeech(previousMs: number, nextMs: number): 'start' | 'end' | null {
  if (previousMs === 0 && nextMs > 0) return 'start';
  if (previousMs > 0 && nextMs === 0) return 'end';
  return null;
}
