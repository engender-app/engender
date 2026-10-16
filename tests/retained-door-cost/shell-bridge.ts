import { bootState, browserSession } from '../../src/lib/stores/boot.svelte';
import { lockState, markUnlocked } from '../../src/lib/stores/lock.svelte';
import { readOperations } from './operation-recording';

declare const __RETAINED64_BUILD__: unknown;

declare global {
  interface Window {
    __retainedShell?: {
      build: unknown;
      bootState: typeof bootState;
      browserSession: typeof browserSession;
      lockState: typeof lockState;
      markUnlocked: typeof markUnlocked;
      readOperations: typeof readOperations;
      animations: { startedAtMs: number; target: Element; animation: Animation; frames: Keyframe[] }[];
      retainedReady?: () => boolean;
    };
  }
}

if (typeof window !== 'undefined') {
  const mode = localStorage.getItem('retained64-mode');
  window.__retainedDoorExperiment = mode === 'deferred' || mode === 'bounded' ? mode : 'current';
  const animations: NonNullable<Window['__retainedShell']>['animations'] = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const animation = animate.call(this, frames, options);
    animations.push({ startedAtMs: performance.now(), target: this, animation, frames: frames as Keyframe[] });
    return animation;
  };
  window.__retainedShell = { build: __RETAINED64_BUILD__, bootState, browserSession, lockState, markUnlocked, readOperations, animations };
}
