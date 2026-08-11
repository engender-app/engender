/* The demo data store: a deeply reactive $state object persisted to
   localStorage. Phase 1 replaces this module's internals with the SQLite
   drivers; the repository modules keep their signatures.

   Preferences left here in ticket 06 - they are in SQLite now, reached
   through prefs/store.svelte.ts. Everything below is entry data, which
   ticket 07 takes. */

import { demoPreferences, seed } from './demo/seed';
import { prefs } from './prefs/store.svelte';
import { PREFERENCE_DEFAULTS } from './prefs/catalogue';
import type { DB } from './types';

const KEY = 'gender-diary-demo-v1';
const browser = typeof localStorage !== 'undefined';

function load(): DB {
  if (browser) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as DB;
        if (s.version === 1) return s;
      }
    } catch {
      /* corrupted → reseed */
    }
  }
  return seed();
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

function replace(next: DB) {
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

export function resetDemo() {
  if (browser) localStorage.removeItem(KEY);
  Object.assign(prefs, demoPreferences());
  replace(seed());
}

/** True first-run state, used by the demo bar's "Onboarding (first run)".
    Only the preferences onboarding itself decides are reset, so a reviewer
    who picked a theme or palette keeps it across the jump. */
export function markFirstRun() {
  const s = seed();
  s.entries = [];
  s.milestones = [];
  s.labResults = [];
  prefs.onboarded = PREFERENCE_DEFAULTS.onboarded;
  prefs.name = PREFERENCE_DEFAULTS.name;
  prefs.lastBackupAt = PREFERENCE_DEFAULTS.lastBackupAt;
  replace(s);
}

let nextId = 100000;
export const newId = () => nextId++;
