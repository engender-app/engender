import { flushSync } from 'svelte';
import { mountScreen, until } from './mount-screen';
import { fixture, assertions, heldReads, today, type Result } from './screen-contracts/fixture';
import { journal } from '$lib/data/live/journal.svelte';
import { navigating } from './screen-router.svelte';

export async function safeSpaceContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  const f = await fixture('safe-space', 0);
  f.preferences!.a11yMotionReduce = false;
  const held = heldReads(f, ['entries'], (method) => method === 'counterevidencePool');
  let screen = await mountScreen('/doubt', held.fixture);
  const root = () => screen.target;
  const evidence = () => root().querySelector('[data-list-row="evidence"]');
  await check('breath paints while the visibility read remains held', () =>
    root().querySelector('[data-breathing-exercise]') && !evidence());
  await new Promise((resolve) => setTimeout(resolve, 800));
  await check('held empty read never flashes Good moments or gates the breath', () =>
    !evidence() && !root().querySelector('[data-read-reserve-hold]') &&
    root().querySelector('[data-breathing-toggle]'));
  held.release();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await check('resolved empty pool omits only Good moments', () =>
    !evidence() && root().querySelectorAll('[data-list-row]').length === 3 &&
    root().querySelector('a[href="/doubt/comfort"]'));

  const id = await journal.entries.upsertEntry({ epochDay: today, mood: 2, note: 'Quiet afternoon' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await check('an ordinary saved entry does not reveal Good moments', () => !evidence());

  async function movement(change: () => Promise<unknown>, visible: boolean) {
    const heights: number[] = [];
    let sampling = true;
    const sample = () => {
      heights.push(root().querySelector('[data-list-card]')!.getBoundingClientRect().height);
      if (sampling) requestAnimationFrame(sample);
    };
    sample();
    try {
      await change();
      await until(() => Boolean(evidence()) === visible, 'Good moments visibility');
      await new Promise((resolve) => setTimeout(resolve, 650));
    } finally {
      sampling = false;
    }
    const delta = heights.at(-1)! - heights[0];
    const increments = heights.slice(1).map((height, i) => Math.abs(height - heights[i]));
    return Math.abs(delta) > 40 && increments.filter((step) => step > 0.1).length > 3 &&
      Math.max(...increments) < Math.abs(delta) * 0.6;
  }
  await check('starring the first qualifying entry reveals Good moments through several frames', () =>
    movement(() => journal.entries.setEntryStarred(id, true), true));
  await check('Good moments remains a direct link in the stated order', () =>
    evidence()?.getAttribute('href') === '/doubt/evidence' &&
    [...root().querySelectorAll('[data-list-row]')].map((row) => row.getAttribute('data-list-row')).join() ===
      'resources,moments,evidence,readings');
  await check('unstarring the last qualifying entry collapses Good moments through several frames', () =>
    movement(() => journal.entries.setEntryStarred(id, false), false));
  const taggedId = await journal.entries.upsertEntry({ epochDay: today - 1, mood: 4, tags: ['g-body-eu'], note: 'Felt right' });
  await until(evidence, 'good-tagged row');
  await check('a saved euphoria capture also reveals Good moments', () => evidence());
  await new Promise((resolve) => setTimeout(resolve, 650));
  await check('leaving Safe space does not collapse the Good moments row', async () => {
    const row = evidence()!.parentElement!;
    const fullHeight = row.getBoundingClientRect().height;
    const heights = [fullHeight];
    let frame = 0;
    const sample = () => {
      if (row.isConnected) heights.push(row.getBoundingClientRect().height);
      frame = requestAnimationFrame(sample);
    };
    Object.assign(navigating, { to: { url: new URL('/calendar', location.origin) } });
    frame = requestAnimationFrame(sample);
    try {
      await journal.entries.deleteEntry(taggedId);
      await until(() => !row.isConnected, 'departing evidence row');
      await screen.remove(true);
      return heights.every((height) => Math.abs(height - fullHeight) < 1);
    } finally {
      cancelAnimationFrame(frame);
      Object.assign(navigating, { to: null });
    }
  });

  await journal.entries.deleteEntry(id);
  await journal.entries.deleteEntry(taggedId);
  screen = await mountScreen('/doubt/evidence', f);
  await until(() => root().querySelector('[data-notice="no-counterevidence"]'), 'direct empty evidence');
  flushSync();
  await check('direct empty Good moments retains explanation and both ways forward', () =>
    root().querySelector('[data-notice="no-counterevidence"]')?.textContent?.trim() &&
    root().querySelector('a[href="/calendar"]') && root().querySelector('a[href="/doubt/comfort"]'));
  await screen.remove();
  return results;
}
