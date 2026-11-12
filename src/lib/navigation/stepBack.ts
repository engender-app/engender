/* A screen that walks through steps of its own owns the system's Back while
   it is past its first step: Back goes one step back rather than off the
   screen (tester report 02: a new entry's steps). Setup has its own owner
   ($lib/onboarding/back) because it is entered instead of the app; this one
   is for a step machine inside it.

   The owner answers false on its first step, which hands Back to the
   ordinary rule (back-navigation.ts) - so leaving the first step is exactly
   leaving the screen, discard guard included.

   An owner can also draw its step back under Android's back gesture
   (ticket 04, box 5): `preview` begins, follows and cancels the drawing,
   and the commit arrives as the ordinary Back, which the owner then takes
   from wherever the gesture left the drawing. The owner says when that is
   possible (`armStepPreview`), and this module is the one place that says
   so to the native side: the web is the source of truth, and an owner that
   unmounts disarms with it. */

export type StepBackPreview = {
  /** Starts drawing the step back; false when it cannot right now. */
  begin(): boolean;
  progress(p: number): void;
  cancel(): void;
};

type Owner = { back: () => boolean; preview?: StepBackPreview };

let owner: Owner | undefined;
let armed = false;
const armedListeners = new Set<(on: boolean) => void>();

function setArmed(on: boolean): void {
  if (armed === on) return;
  armed = on;
  for (const listener of armedListeners) listener(on);
}

export function registerStepBack(back: () => boolean, preview?: StepBackPreview): () => void {
  owner = { back, preview };
  setArmed(false);
  return () => {
    if (owner?.back === back) {
      owner = undefined;
      setArmed(false);
    }
  };
}

/** Whether a mounted step machine took this Back. */
export function stepBack(): boolean {
  return owner?.back() ?? false;
}

/** The owner registered with `back` says whether a gesture could draw its
    step back now. Ignored from an owner that is no longer the current one,
    and for one with nothing to draw. */
export function armStepPreview(back: () => boolean, on: boolean): void {
  if (owner?.back !== back || !owner.preview) return;
  setArmed(on);
}

/** Called with the current state at once, then on every change. */
export function onStepPreviewArmed(listener: (on: boolean) => void): () => void {
  armedListeners.add(listener);
  listener(armed);
  return () => void armedListeners.delete(listener);
}

export function beginStepPreview(): boolean {
  return armed && (owner?.preview?.begin() ?? false);
}

export function stepPreviewProgress(p: number): void {
  owner?.preview?.progress(p);
}

/** Returns the drawing to rest. A no-op when nothing is being drawn. */
export function cancelStepPreview(): void {
  owner?.preview?.cancel();
}
