/* Small cross-screen UI state. */

export const ui = $state({
  /** Quick add's fan (F1, phase 5 ticket 18), openable from the bar and the rail. */
  chooserOpen: false,
  /* The app is opening: a gate has taken the secret and the field is on its
     way to the height the screen behind it draws ($lib/motion/appOpening,
     redesign ticket 34).

     Held here rather than in that module because it has to be a rune - the
     surfaces that read it are components - and that module is node-tested,
     which a `.svelte.ts` cannot be. What reads it is anything whose own read
     answers during the opening: a view transition paints its snapshots over
     the page, so a panel that mounts under one is not drawn arriving and is
     simply there when the paint lifts, rows below it shoved down (Alicja,
     round one: "a yank caused by the backup monit appearing between frames
     24 and 25"). Waiting for this to clear puts it on a settled screen,
     where opening its own height reads as the change it is. */
  appOpening: false,
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
  chooserFailed: false,
  /** Which vocabulary manager's sheet is raised over whatever screen is
      showing (audit item 6): modes and entry templates are vocabulary
      managers wearing an area screen's clothes even under Settings
      (redesign ticket 51), two rows and hundreds of pixels of black for
      anyone with few of either. Mounted once at the app root
      (VocabularyManagerSheets, alongside QuickAdd) rather than inside
      Settings, so the entry editor's own "manage" links (EntryEditor.svelte)
      can raise the same sheet in place, with no navigation at all - only a
      stale bookmark to the old standalone screen actually navigates, to
      Settings, before raising it the same way. */
  raisedManager: null as 'modes' | 'templates' | null
});

/* How many bars the frame is holding (carpet 26). */
export const saveBar = $state({ count: 0 });
