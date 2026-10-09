import type { Action } from 'svelte/action';
import { EASE_OUT_CSS, motionDuration } from '$lib/motion/tokens';

// Keep goal controls mounted while their track withdraws from view.
export const trackPanel: Action<HTMLElement, boolean> = (node, shown) => {
  let animation: Animation | undefined;
  node.hidden = !shown;
  node.inert = !shown;

  return {
    update(next) {
      if (next === shown) return;
      shown = next;
      const opacity = node.hidden ? '0' : getComputedStyle(node).opacity;
      animation?.cancel();
      node.hidden = false;
      node.inert = !shown;
      node.style.position = shown ? '' : 'absolute';
      node.style.width = shown ? '' : '100%';
      const duration = motionDuration('--dur-fast');
      if (!duration) {
        node.hidden = !shown;
        return;
      }
      const current = node.animate([{ opacity }, { opacity: shown ? 1 : 0 }], {
        duration,
        easing: EASE_OUT_CSS,
        fill: 'both'
      });
      animation = current;
      void current.finished.then(() => {
        if (animation !== current) return;
        node.hidden = !shown;
        current.cancel();
        animation = undefined;
      }, () => {});
    },
    destroy() {
      animation?.cancel();
    }
  };
};
