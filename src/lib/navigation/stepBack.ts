/* A step machine inside the app owns Back after its first step.
   At step one, fall through to ordinary Back and its discard guard.
   Setup uses its own owner. On Android the owner arms preview,
   draws progress or cancellation, and commits via ordinary Back.
   Unmounting disarms the native preview. */

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
