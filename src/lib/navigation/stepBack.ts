/* A screen that walks through steps of its own owns the system's Back while
   it is past its first step: Back goes one step back rather than off the
   screen (tester report 02: a new entry's steps). Setup has its own owner
   ($lib/onboarding/back) because it is entered instead of the app; this one
   is for a step machine inside it.

   The owner answers false on its first step, which hands Back to the
   ordinary rule (back-navigation.ts) - so leaving the first step is exactly
   leaving the screen, discard guard included. */
let owner: (() => boolean) | undefined;

export function registerStepBack(back: () => boolean): () => void {
  owner = back;
  return () => {
    if (owner === back) owner = undefined;
  };
}

/** Whether a mounted step machine took this Back. */
export function stepBack(): boolean {
  return owner?.() ?? false;
}
