/* On Android 14+, preview predictive Back while the current step
   owner arms it. Disarm when the owner unmounts or preview is torn down.
   Leave the drawing blank when a gate or overlay owns Back. Native
   release always follows ordinary Back so stepBack() commits from
   the preview state. */

import {
  beginStepPreview,
  cancelStepPreview,
  onStepPreviewArmed,
  stepPreviewProgress
} from '../navigation/stepBack';

type Handle = { remove(): Promise<void> };

export interface StepBackBridge {
  setArmed(options: { armed: boolean }): Promise<void>;
  addListener(eventName: 'backStarted', listener: () => void): Promise<Handle>;
  addListener(eventName: 'backProgress', listener: (event: { progress: number }) => void): Promise<Handle>;
  addListener(eventName: 'backCancelled', listener: () => void): Promise<Handle>;
}

export function connectStepPreview(
  bridge: StepBackBridge,
  guards: { isGateActive: () => boolean; hasActiveOverlay: () => boolean }
): () => void {
  let torn = false;
  let drawing = false;
  const handles: Promise<Handle>[] = [];
  const tell = (armed: boolean) =>
    void bridge.setArmed({ armed }).catch((error) => console.error('Could not arm the step back preview', error));

  const stopArmed = onStepPreviewArmed((on) => {
    if (!torn) tell(on);
  });
  handles.push(
    bridge.addListener('backStarted', () => {
      drawing = !torn && !guards.isGateActive() && !guards.hasActiveOverlay() && beginStepPreview();
    }),
    bridge.addListener('backProgress', (event) => {
      if (drawing) stepPreviewProgress(event.progress);
    }),
    bridge.addListener('backCancelled', () => {
      if (!drawing) return;
      drawing = false;
      cancelStepPreview();
    })
  );

  return () => {
    torn = true;
    stopArmed();
    tell(false);
    for (const handle of handles) void handle.then((h) => h.remove()).catch(() => {});
    if (drawing) cancelStepPreview();
    drawing = false;
  };
}
