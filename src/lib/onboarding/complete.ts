/* The last thing setup does, and the one order it survives (phase 10
   redesign ticket 32, ADR-0079).

   Setup holds every answer in local state and writes them all at the end,
   which is what lets any step be skipped and any step be left from. That
   was uncomplicated until disguise became one of the answers. Turning
   disguise on swaps the Android launcher alias, and DisguisePlugin kills
   the process the moment the alias actually flips - so the write and the
   flip are in a race, and the loser is the whole first run: a person who
   answered seven questions and turned disguise on would come back to a
   disguised launcher icon and setup at step one.

   Hence a function rather than five lines inside the route. The order is
   the risky part of this ticket, it fails only on a device and only
   silently, and a rune-free module is something the Node tier can hold to
   it (ADR-0017).

   Deliberately not a place to add anything else. It sequences four things
   the route supplies and knows nothing about preferences, SQLite or
   Capacitor. */

export interface SetupCompletion {
  /** Every answer setup has been holding, `onboarded` among them. Whatever
      the route's own guards decide gets written; this only decides when. */
  writeAnswers: () => void;
  /** Resolves once `writeAnswers`' writes are in SQLite rather than in
      flight. On web this is a formality. On Android it is the difference
      between a finished install and a lost one. */
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
  leaveSetup: () => void;
}

export async function completeSetup(completion: SetupCompletion): Promise<void> {
  completion.writeAnswers();

  /* Nothing to race, so nothing to wait for. A first run that leaves
     disguise alone should not pay a round trip to SQLite for the sake of a
     branch it never takes. */
  if (completion.disguise) {
    await completion.flushWrites();
    await completion.turnOnDisguise();
  }

  completion.leaveSetup();
}
