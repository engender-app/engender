import { createEncryptedWebSqlite } from '$lib/data/sqlite/mc-driver';
import { boot } from '$lib/data/sqlite/boot';
import { openJournal } from '$lib/data/journal/journal';
import { opfsPhotoFiles } from '$lib/data/photos/opfs-file-store';
import { openPreferences } from '$lib/data/prefs/preferences';
import { attachPreferences } from '$lib/data/prefs/store.svelte';
import { PREFERENCE_DEFAULTS } from '$lib/data/prefs/catalogue';
import { todayEpochDay, startOfDayTimestamp } from '$lib/data/epochDay';
import { PROBE_DATA_KEY } from '../fresh-origin';
import type { ScreenFixture } from '../mount-screen';

export const today = todayEpochDay();
export async function fixture(name: string, count = 6): Promise<ScreenFixture> {
  const { driver, fileOps } = createEncryptedWebSqlite(`screen-${name}.sqlite3`, PROBE_DATA_KEY);
  const opened = await boot({ createDriver: () => driver, fileOps });
  if (opened.phase === 'error') throw opened.error;
  const journal = openJournal(opened.driver, opfsPhotoFiles());
  await journal.reconcileBuiltIns();
  for (let i = 0; i < count; i++) {
    await journal.entries.upsertEntry({
      epochDay: i < 2 ? today - 1 : today - i,
      timestamp: startOfDayTimestamp(i < 2 ? today - 1 : today - i) + (i + 1) * 3600000,
      mood: i === 0 ? 1 : 5,
      dims: { euphoria_dysphoria: i === 0 ? -100 : 100 },
      note: `Contract entry ${i + 1}`,
      starred: i === 0
    });
  }
  await attachPreferences(await openPreferences(opened.driver));
  return {
    journal,
    hasEntries: count > 0,
    preferences: {
      ...PREFERENCE_DEFAULTS,
      theme: 'light',
      language: 'en',
      palette: 'trans',
      activeScales: ['euphoria_dysphoria'],
      a11yMotionReduce: true,
      name: 'Reader',
      pinnedRows: ['milestones', 'letters', 'wear']
    }
  };
}

export interface Result {
  name: string;
  passed: boolean;
  error?: string;
}
export function assertions(results: Result[]) {
  return async (name: string, work: () => unknown | Promise<unknown>) => {
    try {
      if (!(await work())) throw new Error('rendered contract did not hold');
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: String((error as Error)?.stack ?? error) });
    }
  };
}
export function node(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`missing rendered element: ${selector}`);
  return found;
}
export function style(root: ParentNode, selector: string, pseudo?: string) {
  return getComputedStyle(node(root, selector), pseudo);
}

/** Holds chosen entry-data areas while reference hydration remains synchronous. */
export function heldReads(source: ScreenFixture, areas: string[]) {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const journal = new Proxy(source.journal, {
    get(target, key, receiver) {
      const area = Reflect.get(target, key, receiver);
      if (!areas.includes(String(key))) return area;
      return new Proxy(area, {
        get(operations, method) {
          const operation = Reflect.get(operations, method);
          return typeof operation === 'function'
            ? async (...args: unknown[]) => {
                await ready;
                return operation(...args);
              }
            : operation;
        }
      });
    }
  });
  return { fixture: { ...source, journal }, release };
}
