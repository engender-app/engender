import { mount, unmount, tick } from 'svelte';
import Home from '../../src/routes/+page.svelte';

/** Mount the shipped screen; its reserve gates include dependent live reads. */
export async function mountHome(): Promise<{ result: number; detail: string }> {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const screen = mount(Home, { target });
  try {
    await tick();
    const started = performance.now();
    while (!target.querySelector('[data-home-log]') || target.querySelector('[data-read-reserve-hold]')) {
      if (performance.now() - started > 20_000) throw new Error('Mounted Home did not finish its reads');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    await tick();
    return { result: target.querySelectorAll('*').length, detail: 'Real Home mounted; all read reserves released' };
  } finally {
    await unmount(screen);
    target.remove();
  }
}
