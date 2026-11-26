/* Late reads on Good moments and Tryouts.

   Tryouts gates a second read beside its list, the felt-sense readings.
   It used to sit outside the gate, so the screen painted without it and
   it landed afterwards - a running tryout saying "No felt sense recorded
   yet" until its readings arrived. Good moments had the same shape with
   its snapshot history until functional audit ticket 09 cut the
   snapshots; its one read is still held here so the pool's reveal is
   measured. The held reads make that order certain rather than a race.

   The motion clause is measured, not judged: every animation frame
   records how much of each tracked element is painted (its opacity times
   the share of its own height no ancestor clips), and an element that
   arrives or leaves has to do it through several frames, starting and
   ending near nothing. */
import { flushSync } from 'svelte';
import { m } from '$lib/paraglide/messages';
import { mountScreen, until } from './mount-screen';
import { fixture, assertions, heldReads, today, type Result } from './screen-contracts/fixture';
import type { ScreenFixture } from './mount-screen';

type Sample = { opacity: number; visible: number; reach: number; text: string };
type Frame = { t: number; samples: Map<number, Sample> };

/** What of `element` is on screen this frame: its opacity with its
    ancestors', how much of its height inside the window no clipping
    ancestor inside the screen cuts (`visible`), and how much of it is
    inside the window at all (`reach`). The app frame around the screen is
    left out, and so is anything below the window's edge: a part nobody
    can see is not arriving or leaving, it is scrolled away. */
function measure(element: Element): Omit<Sample, 'text'> {
  let opacity = 1;
  const box = element.getBoundingClientRect();
  let top = Math.max(box.top, 0);
  let bottom = Math.min(box.bottom, innerHeight);
  const reach = Math.max(0, bottom - top);
  let inScreen = true;
  for (let at: Element | null = element; at && at !== document.body; at = at.parentElement) {
    const style = getComputedStyle(at);
    opacity *= Number(style.opacity);
    if (at.classList.contains('screen')) inScreen = false;
    if (inScreen && at !== element && (style.overflowY !== 'visible' || style.overflowX !== 'visible')) {
      const clip = at.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  return { opacity, visible: Math.max(0, bottom - top), reach };
}

/** Samples every animation frame until stopped. Each tracked element keeps
    one id for as long as it is connected. */
function sampler(select: () => Element[], text: (element: Element) => string = () => '') {
  const ids = new WeakMap<Element, number>();
  let next = 0;
  const frames: Frame[] = [];
  const started = performance.now();
  let handle = 0;
  const read = (now: number) => {
    const samples = new Map<number, Sample>();
    for (const element of select()) {
      if (!ids.has(element)) ids.set(element, next++);
      samples.set(ids.get(element)!, { ...measure(element), text: text(element) });
    }
    frames.push({ t: Math.round(now - started), samples });
    handle = requestAnimationFrame(read);
  };
  handle = requestAnimationFrame(read);
  return () => {
    cancelAnimationFrame(handle);
    return frames;
  };
}

/** Each element's run, its painted share per frame: its opacity times the
    part of what is inside the window that nothing clips. Frames it spends
    wholly outside the window are not counted. */
type Track = { first: number; last: number; shares: number[]; firstShare: number; lastShare: number; ramp: number; end: number };
function tracks(frames: Frame[]): Map<number, Track> {
  const out = new Map<number, Track>();
  frames.forEach((frame, index) => {
    for (const [id, sample] of frame.samples) {
      if (sample.reach === 0) continue;
      const share = sample.opacity * (sample.visible / sample.reach);
      const track = out.get(id);
      if (!track) out.set(id, { first: index, last: index, shares: [share], firstShare: share, lastShare: share, ramp: 0, end: frames.length - 1 });
      else {
        track.last = index;
        track.lastShare = share;
        track.shares.push(share);
      }
    }
  });
  /* Frames spent between nothing and whole: a one-frame swap has none. */
  for (const track of out.values()) track.ramp = track.shares.filter((share) => share > 0.02 && share < 0.95).length;
  return out;
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An arrival during the run: first sampled with something already there
    to count from (not on the run's first frame), painted at under half on
    that frame and climbing through at least three. */
function arrivedSmoothly(track: Track): boolean {
  return track.first > 0 && track.firstShare < 0.5 && track.ramp >= 3;
}

export async function lateReadsContracts(theme: 'light' | 'dark' = 'light'): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  /* Every run's frames, for the probe that prints them. */
  const runs: Record<string, Frame[]> = {};

  /* ---------- Good moments ---------- */
  /* The snapshot history and its save left with functional audit ticket
     09, so the pool is the screen's one read again. It still arrives in one
     reveal, out of the gate's skeleton, and a refused read still says so. */
  const f = await fixture('late-reads', 6);
  f.preferences!.a11yMotionReduce = false;
  f.preferences!.theme = theme;

  const heldPool = heldReads(f, ['entries'], (method) => method === 'counterevidencePool');
  const pool = () => document.querySelector('#screens .entry-days');
  const skeleton = () => document.querySelector('#screens [data-gate-skeleton]');
  /* Everything the screen draws once its read answers: each block of the
     gate's answer. */
  const answer = () => [...document.querySelectorAll('#screens .screen > .screen-part > :not([data-gate-skeleton])')];
  let stop = sampler(answer);
  let screen = await mountScreen('/doubt/evidence', heldPool.fixture);
  await settle(700);
  flushSync();
  await check('Good moments holds its skeleton while the pool is still being read', () => !pool() && skeleton());
  heldPool.release();
  await until(() => pool() && !skeleton(), 'good moments pool');
  await settle(700);
  let frames = (runs.evidenceCold = stop());
  let tracked = tracks(frames);
  await check('the pool arrives in one reveal, nothing whole on its first frame', () => {
    const arrivals = [...tracked.values()].filter((track) => track.first > 0);
    const firsts = new Set(arrivals.map((track) => track.first));
    return arrivals.length >= 1 && firsts.size === 1 && arrivals.every(arrivedSmoothly);
  });
  await screen.remove();

  /* A pool that could not be read is a failure, not an empty pool: the
     screen says so and offers the retry rather than the empty notice. */
  const refusing: ScreenFixture = {
    ...f,
    journal: new Proxy(f.journal, {
      get(target, key, receiver) {
        const area = Reflect.get(target, key, receiver);
        if (key !== 'entries') return area;
        return new Proxy(area, {
          get(operations, method) {
            return method === 'counterevidencePool'
              ? async () => {
                  throw new Error('refused for the contract');
                }
              : Reflect.get(operations, method);
          }
        });
      }
    })
  };
  screen = await mountScreen('/doubt/evidence', refusing);
  await check('a refused pool read says so instead of drawing an empty pool', async () => {
    const status = await until(() => document.querySelector('#screens [role="status"]'), 'read failure notice');
    return (
      status.textContent?.includes(m.read_failed()) &&
      !pool() &&
      !document.querySelector('#screens [data-notice="no-counterevidence"]')
    );
  });
  await screen.remove();

  /* ---------- Tryouts ---------- */
  const g = await fixture('late-tryouts', 0);
  g.preferences!.a11yMotionReduce = false;
  g.preferences!.theme = theme;
  const felt = await g.journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Robin',
    description: null,
    startEpochDay: today - 10,
    endEpochDay: null
  });
  await g.journal.feltSense.add({ tryoutId: felt }, { epochDay: today - 4, mood: 4, note: null });
  await g.journal.feltSense.add({ tryoutId: felt }, { epochDay: today - 1, mood: 5, note: null });
  await g.journal.tryouts.upsertTryout({
    kind: 'pronouns',
    label: 'they/them',
    description: null,
    startEpochDay: today - 2,
    endEpochDay: null
  });

  const heldFelt = heldReads(g, ['feltSense'], (method) => method === 'byTryout');
  const cards = () => [...document.querySelectorAll('#screens [data-tryout-card]')];
  const said = (card: Element) =>
    `${card.getAttribute('data-tryout-card')}|${card.querySelector('[data-tryout-latest]')?.textContent?.trim() ?? ''}`;
  /* The gate's answer block by block (the section heading, the running
     list) and the cards inside it. */
  const tryoutsAnswer = () => [
    ...document.querySelectorAll('#screens .screen > .screen-part > :not([data-gate-skeleton])'),
    ...cards()
  ];
  stop = sampler(tryoutsAnswer, said);
  screen = await mountScreen('/transition/tryouts', heldFelt.fixture);
  await settle(700);
  flushSync();
  await check('Tryouts holds its skeleton while the felt-sense readings are still being read', () =>
    cards().length === 0 && skeleton());
  heldFelt.release();
  await until(() => cards().length === 2 && !skeleton(), 'tryout cards');
  await settle(700);
  frames = runs.tryoutsCold = stop();
  tracked = tracks(frames);
  await check('a tryout with readings never says it has none, on any frame', () => {
    const none = `${felt}|${m.tryout_felt_none()}`;
    const shown = said(cards().find((card) => card.getAttribute('data-tryout-card') === felt)!);
    return shown !== none && frames.every((frame) => [...frame.samples.values()].every((sample) => sample.text !== none));
  });
  await check('the running heading, list and cards arrive in one reveal, none whole on its first frame', () => {
    const arrivals = [...tracked.values()].filter((track) => track.first > 0);
    const firsts = new Set(arrivals.map((track) => track.first));
    return arrivals.length === 4 && firsts.size === 1 && arrivals.every(arrivedSmoothly);
  });
  await screen.remove();
  /* Each run's tracks, for tests/late-reads-check.mjs to print. */
  (window as unknown as { __lateReadsFrames?: unknown }).__lateReadsFrames = Object.fromEntries(
    Object.entries(runs).map(([name, run]) => [
      name,
      [...tracks(run).values()].map(({ first, last, end, ramp, shares }) => ({
        first,
        last,
        end,
        ramp,
        shares: shares.map((share) => Math.round(share * 1000) / 1000)
      }))
    ])
  );
  return results;
}
