import { tick } from 'svelte';

let latestChange = 0;
const latestKindChange = { palette: 0, theme: 0 };
let sunFadePending = false;

/** A return from Settings to Today answers a palette pick with a fading sun. */
export function takePaletteSunFade(from: string | null, to: string): boolean {
  const pending = sunFadePending && from === '/settings' && to === '/';
  sunFadePending = false;
  return pending;
}

/** Capture both appearances so the new colours can sweep over the old. */
function changeAppearance(commit: () => void, kind: 'palette' | 'theme', doc: Document): void {
  const change = ++latestChange;
  latestKindChange[kind] = change;
  if (!doc.startViewTransition) {
    if (doc.documentElement) {
      delete doc.documentElement.dataset.appearanceTransition;
      delete doc.documentElement.dataset.paletteTransition;
    }
    commit();
    return;
  }

  const root = doc.documentElement;
  root.dataset.appearanceTransition = '';
  if (kind === 'palette') root.dataset.paletteTransition = '';
  else delete root.dataset.paletteTransition;
  const transition = doc.startViewTransition(async () => {
    if (change !== latestKindChange[kind]) return;
    commit();
    await tick();
  });
  void transition.finished.catch(() => {}).finally(() => {
    if (change === latestChange) {
      delete root.dataset.appearanceTransition;
      delete root.dataset.paletteTransition;
    }
  });
}

export function changePalette(commit: () => void, doc: Document = document): void {
  changeAppearance(() => {
    commit();
    sunFadePending = true;
  }, 'palette', doc);
}

export function changeTheme(commit: () => void, doc: Document = document): void {
  changeAppearance(commit, 'theme', doc);
}
