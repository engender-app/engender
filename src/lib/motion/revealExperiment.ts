/* Ticket 09 measurement switch, removed before merge.

   localStorage `ticket09-reveal` = `6/2` makes playAfterPaint wait with the
   arrival hold's quick-frame rule instead of two frames. `ticket09-care` =
   `wait` makes /care's read wait for its screen to be still. Read once per
   process, so every arrival in a run is on the same arm. */

let reveal: boolean | undefined;

export function revealWaits(): boolean {
  if (reveal === undefined) {
    try {
      reveal = localStorage.getItem('ticket09-reveal') === '6/2';
    } catch {
      reveal = false;
    }
  }
  return reveal;
}

let care: boolean | undefined;

export function careWaits(): boolean {
  if (care === undefined) {
    try {
      care = localStorage.getItem('ticket09-care') === 'wait';
    } catch {
      care = false;
    }
  }
  return care;
}
