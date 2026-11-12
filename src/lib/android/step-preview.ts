/* The web end of the predictive step back (ticket 04, box 5).

   On Android 14 and later a back swipe reports its progress before it is
   released. While a step machine is past its first step
   ($lib/navigation/stepBack), the native StepBack plugin forwards that
   progress here and this draws the step back under the finger. The release
   is not forwarded separately: the native side hands it to the ordinary
   back button, which reaches the owner through stepBack() like any Back,
   and the owner commits from where the drawing is.

   The web is the source of truth for whether the native callback is on:
   it is armed only while an owner says so, and disarmed when the owner
   unmounts or this is torn down. The native side never decides on its own,
   and whatever it is told, a release always goes on to the ordinary back
   button (StepBackGesture.java), so a callback left on can only cost the
   drawing, never a Back.

   A gesture that starts while the gate or an overlay owns Back draws
   nothing, because those take the release first. */

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
