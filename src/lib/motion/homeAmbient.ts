import type { Attachment } from 'svelte/attachments';
import { isDoorActive } from '../navigation/doorActivity';

/** Home's decorative loops rest after 30 seconds without input. */
export const homeAmbient: Attachment<HTMLElement> = (home) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const pause = () => {
    clear();
    if (home.dataset.homeAmbient !== 'paused') home.dataset.homeAmbient = 'paused';
  };
  const resume = () => {
    if (!isDoorActive(home) || document.hidden) return;
    clear();
    if (home.dataset.homeAmbient !== 'running') home.dataset.homeAmbient = 'running';
    timer = setTimeout(pause, 30_000);
  };
  const sync = () => {
    if (!isDoorActive(home) || document.hidden) pause();
    else resume();
  };
  const events = ['pointerdown', 'pointermove', 'keydown', 'click', 'focusin', 'wheel'] as const;
  for (const event of events) document.addEventListener(event, resume, { capture: true, passive: true });
  document.addEventListener('visibilitychange', sync);
  const door = home.closest('[data-retained-door]');
  const activity = door ? new MutationObserver(sync) : null;
  if (door) activity?.observe(door, { attributes: true, attributeFilter: ['data-retained-active'] });
  sync();
  return () => {
    clear();
    activity?.disconnect();
    document.removeEventListener('visibilitychange', sync);
    for (const event of events) document.removeEventListener(event, resume, { capture: true });
  };
};
