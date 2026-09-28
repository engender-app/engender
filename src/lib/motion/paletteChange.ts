import { tick } from 'svelte';

let latestChange = 0;
type Appearance = 'palette' | 'theme';
const pending: Partial<Record<Appearance, () => void>> = {};
let sunFadePending = false;

export function isAppearancePending(kind: Appearance): boolean {
  return pending[kind] !== undefined;
}

/** A return from Settings to Today answers a palette pick with a fading sun. */
export function takePaletteSunFade(from: string | null, to: string): boolean {
  const pending = sunFadePending && from === '/settings' && to === '/';
  sunFadePending = false;
  return pending;
}

/** Capture both appearances so the new colours can sweep over the old. */
function changeAppearance(commit: () => void, kind: Appearance, doc: Document): void {
  pending[kind] = commit;
  const change = ++latestChange;
  function applyPending() {
    for (const choice of ['palette', 'theme'] as const) {
      const apply = pending[choice];
      delete pending[choice];
      apply?.();
    }
  }
  if (!doc.startViewTransition) {
    if (doc.documentElement) {
      delete doc.documentElement.dataset.appearanceTransition;
      delete doc.documentElement.dataset.paletteTransition;
    }
    applyPending();
    return;
  }

  const root = doc.documentElement;
  root.dataset.appearanceTransition = '';
  if (pending.palette) root.dataset.paletteTransition = '';
  else delete root.dataset.paletteTransition;
  const transition = doc.startViewTransition(async () => {
    if (change !== latestChange) return;
    applyPending();
    await tick();
  });
  void transition.finished.catch(() => {}).finally(() => {
    if (change === latestChange) {
      applyPending();
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
