/* Late reads on Good moments and Tryouts (last-audit UI ticket 20).

   Each screen gates a second read beside its list: Good moments' snapshot
   history, Tryouts' felt-sense readings. Both reads used to sit outside
   the gate, so the screen painted without them and they landed afterwards
   - the snapshot panels popping in under a settled screen, a running
   tryout saying "No felt sense recorded yet" until its readings arrived.
   The held reads below make that order certain rather than a race.

   The motion clause is measured, not judged: every animation frame
   records how much of each tracked element is painted (its opacity times
   the share of its own height no ancestor clips), and an element that
   arrives or leaves has to do it through several frames, starting and
   ending near nothing. */
import { flushSync } from 'svelte';
import { m } from '$lib/paraglide/messages';
import { mountScreen, until } from './mount-screen';
import { fixture, assertions, heldReads, today, type Result } from './screen-contracts/fixture';

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
/** Neither arriving nor leaving: whole on every frame. */
function stayedWhole(track: Track): boolean {
  return track.shares.every((share) => share > 0.95);
}
/** A departure: gone before the run ended, under half on its last
    painted frame, and fading or closing through at least three. */
function leftSmoothly(track: Track): boolean {
  return track.last < track.end && track.lastShare < 0.5 && track.ramp >= 3;
}

export async function lateReadsContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  /* Every run's frames, for the probe that prints them. */
  const runs: Record<string, Frame[]> = {};

  /* ---------- Good moments ---------- */
  const f = await fixture('late-reads', 6);
  f.preferences!.a11yMotionReduce = false;
  await f.journal.doubtJournal.saveSnapshot(today - 3, [{ epochDay: today - 3, mood: 4, note: 'Kept from a good week' }]);
  await f.journal.doubtJournal.saveSnapshot(today - 2, [{ epochDay: today - 2, mood: 5, note: 'Kept the day after' }]);

  const heldSnapshots = heldReads(f, ['doubtJournal'], (method) => method === 'getSnapshots');
  /* Each snapshot is one surface; the pool is the entry days above them. */
  const panels = () => [...document.querySelectorAll('#screens .kit-panel[data-kit-surface]')];
  const pool = () => document.querySelector('#screens .entry-days');
  const skeleton = () => document.querySelector('#screens [data-gate-skeleton]');
  /* Everything the screen draws once its reads answer: each block of the
     gate's answer (the pool, the save control), the history's heading
     and its panels. */
  const answer = () => [
    ...document.querySelectorAll('#screens .screen > .screen-part > :not([data-gate-skeleton])'),
    ...document.querySelectorAll('#screens [data-section-heading]'),
    ...panels()
  ];
  let stop = sampler(answer);
  let screen = await mountScreen('/doubt/evidence', heldSnapshots.fixture);
  await settle(700);
  flushSync();
  await check('Good moments holds its skeleton while the snapshot history is still being read', () =>
    !pool() && panels().length === 0 && skeleton());
  heldSnapshots.release();
  await until(() => panels().length === 2 && !skeleton(), 'snapshot panels');
  await settle(700);
  let frames = (runs.evidenceCold = stop());
  let tracked = tracks(frames);
  await check('the pool, its control, the history heading and both panels arrive in one reveal, none whole on its first frame', () => {
    const arrivals = [...tracked.values()].filter((track) => track.first > 0);
    const firsts = new Set(arrivals.map((track) => track.first));
    return arrivals.length === 5 && firsts.size === 1 && arrivals.every(arrivedSmoothly);
  });

  stop = sampler(panels);
  /* A few frames of the panels at rest first, so the new one is counted
     as arriving rather than as there from the start. */
  await settle(50);
  const save = [...document.querySelectorAll<HTMLButtonElement>('#screens button')].find((button) =>
    button.textContent?.includes(m.doubt_save_snapshot())
  )!;
  save.click();
  await until(() => panels().length === 3, 'saved snapshot panel');
  await settle(700);
  frames = runs.evidenceSave = stop();
  tracked = tracks(frames);
  await check('a saved snapshot opens into the history through several frames', () => {
    const arrivals = [...tracked.values()].filter((track) => track.first > 0);
    return arrivals.length === 1 && arrivals.every(arrivedSmoothly);
  });
  /* The panels already there move down whole. Inside the gate, its
     `resize` clipped the one under the new panel to a fifth of itself in
     one frame while it lagged behind the growth. */
  await check('the panels a save moves down stay whole on every frame', () => {
    const stayed = [...tracked.values()].filter((track) => track.first === 0);
    return stayed.length === 2 && stayed.every(stayedWhole);
  });

  const heading = () =>
    [...document.querySelectorAll('#screens [data-section-heading]')].find(
      (box) => box.querySelector('h2')?.textContent === m.doubt_snapshots_title()
    );
  async function deleteFirstPanel(run: string) {
    stop = sampler(() => [...panels(), ...(heading() ? [heading()!] : [])]);
    const before = panels().length;
    await settle(50);
    panels()[0].querySelector<HTMLButtonElement>('.icon-btn')!.click();
    const confirm = await until(
      () => document.querySelector<HTMLButtonElement>('[data-confirm-delete-doubt-snapshot]'),
      'delete confirmation'
    );
    confirm.click();
    await until(() => panels().length === before - 1, 'deleted snapshot panel');
    await settle(900);
    return (runs[run] = stop());
  }
  frames = await deleteFirstPanel('evidenceDelete');
  tracked = tracks(frames);
  await check('a deleted snapshot closes up through several frames rather than vanishing', () => {
    const departures = [...tracked.values()].filter((track) => track.last < track.end);
    const stayed = [...tracked.values()].filter((track) => track.last === track.end);
    /* The two panels left and the heading over them. */
    return departures.length === 1 && departures.every(leftSmoothly) && stayed.length === 3 && stayed.every(stayedWhole);
  });
  /* Down to the last one, then the last: the section closes as one box,
     heading and panel together, so it is the box that is measured - the
     panel at its bottom is covered before the heading at its top, which
     is a mask moving, not either of them cut. */
  await deleteFirstPanel('evidenceDeleteSecond');
  frames = await deleteFirstPanel('evidenceDeleteLast');
  await check('deleting the last snapshot closes its whole section through several frames', () => {
    const painted = frames.map((frame) =>
      [...frame.samples.values()].reduce((sum, sample) => sum + sample.opacity * sample.visible, 0)
    );
    const start = painted[0];
    const between = painted.filter((px) => px > start * 0.02 && px < start * 0.95).length;
    const steepest = Math.max(...painted.slice(1).map((px, i) => painted[i] - px));
    return !heading() && start > 0 && painted.at(-1) === 0 && between >= 3 && steepest < start * 0.5;
  });
  await screen.remove();

  /* ---------- Tryouts ---------- */
  const g = await fixture('late-tryouts', 0);
  g.preferences!.a11yMotionReduce = false;
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
