/* Small cross-screen UI state. */

export const ui = $state({
  /** Quick add's fan (F1, phase 5 ticket 18), openable from the bar and the rail. */
  chooserOpen: false,
  /* Whether the pointer that opened the fan is still down. The add control
     sets it and quick add clears it, because the press-and-slide gesture
     starts on one component and finishes on another: the button opens the
     fan on the way down, and the fan resolves whatever the finger is over
     on the way up. */
  chooserPressing: false,
  /* A write that finished without going anywhere just landed, and the add
     control is reporting it. Lives here rather than in quick add because
     the two halves are in different components: the fan measures the flight
     and the control catches it. */
  chooserConfirming: false,
  /* The moment the flight arrives, which is later than the moment it
     starts: the control only wears the tick once something has reached it. */
  chooserCaught: false,
  /* The other outcome. Its own flag rather than a mode on the one above,
     because they are not two shades of the same thing: one has something
     arriving and the other has nothing to arrive. */
  chooserFailed: false
});
