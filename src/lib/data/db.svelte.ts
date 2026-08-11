/* The demo data store: a deeply reactive $state object persisted to
   localStorage. Phase 1 replaces this module's internals with the SQLite
   drivers; the repository modules keep their signatures.

   Preferences left here in ticket 06 - they are in SQLite now, reached
   through prefs/store.svelte.ts. Everything below is entry data, which
   ticket 07 takes.

   The built-in vocabulary is reconciled into whatever loads, every time,
   rather than seeded only into an empty journal (ticket 05). What a fresh
   one starts as is the only thing the demo flag decides. */

import { emptyDb, seedVocabulary } from './firstRun';
import { personaDb } from './demo/persona';
import type { DB } from './types';

const KEY = 'gender-diary-demo-v1';
const browser = typeof localStorage !== 'undefined';

function initial(): DB {
  return __DEMO__ ? personaDb() : emptyDb();
}

function load(): DB {
  if (browser) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as DB;
        if (s.version === 1) return seedVocabulary(s);
      }
    } catch {
      /* corrupted → reseed */
    }
  }
  return seedVocabulary(initial());
}

export const db = $state<DB>(load());

export function save() {
  if (browser) {
    try {
      localStorage.setItem(KEY, JSON.stringify($state.snapshot(db)));
    } catch {
      /* storage full / private mode */
    }
  }
}

/** Swaps the whole store at once. Only the demo controls need this today
    (demo/controls.ts); ticket 14's Replace import is the real caller. */
export function replaceAll(next: DB) {
  db.version = next.version;
  db.dimensions = next.dimensions;
  db.customPresets = next.customPresets;
  db.tagGroups = next.tagGroups;
  db.entries = next.entries;
  db.milestones = next.milestones;
  db.reminders = next.reminders;
  db.labResults = next.labResults;
  save();
}

let nextId = 100000;
export const newId = () => nextId++;
