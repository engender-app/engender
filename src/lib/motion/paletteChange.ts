import { tick } from 'svelte';

let latestChange = 0;
let sunFadePending = false;

/** The next arrival on Today answers a palette pick with a fading sun. */
export function takePaletteSunFade(): boolean {
  const pending = sunFadePending;
  sunFadePending = false;
  return pending;
}

/** Capture both palette states so the new colours can sweep over the old. */
export function changePalette(commit: () => void, doc: Document = document): void {
  if (!doc.startViewTransition) {
    commit();
    sunFadePending = true;
    return;
  }

  const change = ++latestChange;
  const root = doc.documentElement;
  root.dataset.paletteTransition = '';
  const transition = doc.startViewTransition(async () => {
    if (change !== latestChange) return;
    commit();
    sunFadePending = true;
    await tick();
  });
  void transition.finished.catch(() => {}).finally(() => {
    if (change === latestChange) delete root.dataset.paletteTransition;
  });
}
