/* Commit setup answers before changing the Android launcher alias. The alias flip can kill
   the process, so flipping first can discard every answer and start setup again.

   Keep the four injected steps rune-free so Node tests can verify ordering without
   preferences, SQLite or Capacitor. */

export interface SetupCompletion {
  /** Every answer setup has been holding, `onboarded` among them. */
  writeAnswers: () => void | Promise<void>;
  /** Resolves once `writeAnswers`' writes are in SQLite rather than in
      flight. On Android it is the difference between a finished install and
      a lost one. On web a page left in the next moments kills the worker
      mid-write, and `onboarded` is lost with it. */
  flushWrites: () => Promise<void>;
  /** Whether the person turned disguise on during setup. False covers both
      "left it alone" and "skipped the step", which are the same act: the
      stored value is not touched either way. */
  disguise: boolean;
  /** Applies the disguise, which on Android closes the app. Called last,
      and only when the writes above have landed. Awaited, because the
      disguise has to be durable before it is in force for the same reason
      every other answer does - see setPreferenceDurably. */
  turnOnDisguise: () => Promise<void>;
  /** Out of setup and into the app. Called even when the disguise was
      applied: on web nothing restarts, and on Android the process is
      already gone before this could matter. */
  leaveSetup: () => void | Promise<void>;
}

/** Longest the finish screen waits for the pref table when no disguise
    depends on it: normally a few milliseconds, and a stuck table must not
    hold the person on a screen whose only control has been pressed. */
const FLUSH_LIMIT_MS = 2000;

export async function completeSetup(completion: SetupCompletion): Promise<void> {
  await completion.writeAnswers();

  /* Answers have been submitted. Preferences need a flush before disguise can
     kill the Android process, and before the page can be left on web. */
  if (completion.disguise) {
    /* Whatever happens in here, the person gets out of setup. They pressed
       the last button of a first run, and a failure to write one
       preference is not a reason to leave them on a screen whose only
       control has stopped answering - which is what an unhandled rejection
       here would do, since the caller is a click handler that cannot show
       one. The disguise is the answer that goes missing; setup is still
       over, and Settings still has the switch. */
    try {
      await completion.flushWrites();
      await completion.turnOnDisguise();
    } catch (error) {
      console.error('Could not apply the disguise at the end of setup', error);
    }
  } else {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<void>((resolve) => { timer = setTimeout(resolve, FLUSH_LIMIT_MS); });
      await Promise.race([completion.flushWrites(), limit]).finally(() => clearTimeout(timer));
    } catch (error) {
      console.error('Could not confirm the setup answers were saved', error);
    }
  }

  await completion.leaveSetup();
}
