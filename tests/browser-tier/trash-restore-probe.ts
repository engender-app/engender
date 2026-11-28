/* Trash Restore under a held, a failed and a landed write. The real Trash screen over an encrypted journal, with the
   journal's restoreEntry wrapped so the driving script can hold a write
   open, make it reject, or let it through. trash-restore.mjs drives it. */
import { flushSync } from 'svelte';
import { fixture, today } from './screen-contracts/fixture';
import { mountScreen } from './mount-screen';
import { mountInto } from './mount';
import Trash from '../../src/routes/settings/trash/+page.svelte';
import { bootState } from '$lib/stores/boot.svelte';
import { clearToasts, toasts } from '$lib/stores/toasts.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
import { stillArriving } from '$lib/motion/screenArrival';

type Mode = 'land' | 'hold' | 'fail';

const f = await fixture('trash-restore', 0);
const realRestore = f.journal.entries.restoreEntry.bind(f.journal.entries);
let mode: Mode = 'land';
let calls = 0;
let held: Array<() => void> = [];
f.journal.entries.restoreEntry = async (id: number) => {
  calls += 1;
  if (mode === 'fail') throw new Error('probe: restore refused');
  if (mode === 'hold') await new Promise<void>((resolve) => held.push(resolve));
  await realRestore(id);
};

let mounted: { remove: () => Promise<void> } | undefined;
let ids: number[] = [];

async function show(options: { motion: 'reduce' | 'full'; count: number; theme?: 'light' | 'dark' }) {
  await mounted?.remove();
  mode = 'land';
  calls = 0;
  held = [];
  clearToasts();
  for (const entry of await f.journal.entries.trashedEntries()) await realRestore(entry.id);
  ids = [];
  for (let i = 0; i < options.count; i++) {
    const id = await f.journal.entries.upsertEntry({ epochDay: today - i, mood: 3, note: `Trashed ${i + 1}` });
    await f.journal.entries.deleteEntry(id);
    ids.push(id);
  }
  f.preferences!.a11yMotionReduce = options.motion === 'reduce';
  f.preferences!.theme = options.theme ?? 'light';
  mounted = await mountScreen('/', f);
  await mounted.remove();
  bootState.accessMode = 'passphrase';
  mounted = mountInto(Trash, {}, document.querySelector('.app-main') as HTMLElement);
  flushSync();
  return { ids: [...ids].reverse(), reduced: prefs.a11yMotionReduce };
}

/* The box a row takes up in the list: its wrapper where one carries it,
   or the kit row itself. */
function rowBox(id: number): HTMLElement | null {
  const row = document.querySelector<HTMLElement>(`[data-restore-entry="${id}"]`)?.closest<HTMLElement>('.kit-row') ?? null;
  if (!row) return null;
  return row.parentElement?.classList.contains('rows-divide') ? row.parentElement : row;
}

function box(node: Element | null) {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return { top: rect.top, bottom: rect.bottom, height: rect.height, opacity: Number(style.opacity), clip: style.clipPath, marginTop: style.marginTop, position: style.position };
}

let frames: unknown[] = [];
let sampling = false;

/* Every animation frame until stop(): each row's box by entry id (never by
   index - a removed row would hand its index to the next one), the list,
   the empty state and the gate around them. */
function sample() {
  frames = [];
  sampling = true;
  const start = performance.now();
  const read = () => {
    if (!sampling) return;
    frames.push({
      t: Math.round(performance.now() - start),
      rows: Object.fromEntries(ids.map((id) => [id, box(rowBox(id))])),
      list: box(document.querySelector('[data-list-card]')?.parentElement ?? null),
      empty: box(document.querySelector('.empty-state')?.parentElement ?? null),
      order: [...(document.querySelector('.screen-part')?.children ?? [])].map((node) => node.querySelector('[data-list-card]') ? 'list' : node.querySelector('.empty-state') ? 'empty' : node.tagName),
      part: box(document.querySelector('.screen-part'))
    });
    requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
}

function stop() {
  sampling = false;
  return frames;
}

Object.assign(window, {
  trashRestore: {
    show,
    sample,
    stop,
    setMode: (next: Mode) => { mode = next; },
    release: () => { for (const resolve of held.splice(0)) resolve(); },
    calls: () => calls,
    /* Past the screen's arrival window, with nothing animating: the state a
       person tapping Restore is in. */
    settled: () => !stillArriving() && document.getAnimations().length === 0,
    toasts: () => toasts.map((item) => ({ message: item.message, kind: item.kind })),
    trashed: async () => (await f.journal.entries.trashedEntries()).map((entry) => entry.id)
  }
});
document.body.dataset.ready = 'true';
