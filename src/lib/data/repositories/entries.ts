/* EntryRepository (PRD) — plus the query helpers Stats/Search/Calendar use.
   All reads are plain functions over the reactive db, so components wrap
   them in $derived and stay live. */

import { db, save, newId } from '../db.svelte';
import { EMPTY_ENTRY_ERROR, entryIsEmpty } from '../entryContent';
import { todayEpochDay } from '../epochDay';
import { foldText as fold } from '../fold';
import type { DraftPhoto, Entry, Photo } from '../types';
import { tagById } from './tags';

export function entriesNewestFirst(): Entry[] {
  return [...db.entries].sort((a, b) => b.epochDay - a.epochDay || b.timestamp - a.timestamp);
}

export function entriesForDay(epochDay: number): Entry[] {
  return db.entries.filter((e) => e.epochDay === epochDay).sort((a, b) => a.timestamp - b.timestamp);
}

export const getEntry = (id: number | string): Entry | undefined =>
  db.entries.find((e) => e.id === Number(id));

export interface EntryInput extends Partial<Omit<Entry, 'photos'>> {
  epochDay: number;
  photos?: (Photo | DraftPhoto)[];
}

/** The entry invariant (entryContent.ts), enforced here rather than in
    the editor, so no path bypasses it. */
function assertHasContent(e: Entry) {
  const empty = entryIsEmpty({
    mood: e.mood,
    note: e.note,
    dimCount: Object.keys(e.dims).length,
    tagCount: e.tags.length,
    photoCount: e.photos.length
  });
  if (empty) throw new Error(EMPTY_ENTRY_ERROR);
}

function withPhotoIds(photos: (Photo | DraftPhoto)[]): Photo[] {
  return photos.map((p) => ('id' in p ? p : { ...p, id: crypto.randomUUID() }));
}

export function upsertEntry(entry: EntryInput): number {
  const photos = entry.photos && withPhotoIds(entry.photos);
  if (entry.id) {
    const i = db.entries.findIndex((e) => e.id === entry.id);
    if (i < 0) throw new Error(`unknown entry: ${entry.id}`);
    // Dimension values merge per dimension, never as a whole object:
    // replacing `dims` wholesale is how editing an old entry under a
    // narrower preset silently dropped the dimensions the preset lacks.
    const next: Entry = {
      ...db.entries[i],
      ...entry,
      dims: { ...db.entries[i].dims, ...entry.dims },
      photos: photos ?? db.entries[i].photos
    };
    assertHasContent(next);
    db.entries[i] = next;
    save();
    return next.id;
  }
  const created: Entry = {
    mood: null,
    note: '',
    tags: [],
    ...entry,
    dims: { ...entry.dims },
    photos: photos ?? [],
    id: newId(),
    timestamp: entry.timestamp ?? Date.now()
  };
  assertHasContent(created);
  db.entries.push(created);
  save();
  return created.id;
}

export function deleteEntry(id: number) {
  db.entries = db.entries.filter((e) => e.id !== id);
  save();
}

export function quickLog(mood: number): number {
  return upsertEntry({ epochDay: todayEpochDay(), mood, note: '', dims: {}, tags: [], photos: [] });
}

/** A day's metric, averaged over its entries, in native units: mood on 1
    to 5, a dimension within its own range (ADR-0012). It used to return
    mood x 20 while seriesForRange returned raw mood, so "the metric" meant
    two different numbers depending on which function was asked. Turning
    this into colour is metricRange.ts's job, not this one's. */
export function dayMetricValue(epochDay: number, metric: string): number | null {
  const vals = entriesForDay(epochDay)
    .map((e) => (metric === 'mood' ? e.mood : (e.dims?.[metric] ?? null)))
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function streakDays(): number {
  const days = new Set(db.entries.map((e) => e.epochDay));
  let n = 0;
  let d = todayEpochDay();
  if (!days.has(d)) d--; // the streak survives until today is over
  while (days.has(d)) {
    n++;
    d--;
  }
  return n;
}

/** FTS5 stand-in: prefix-friendly, diacritics-insensitive note + tag match.

    `tagLabel` is passed in rather than read off the row: a built-in tag
    stores a key, not a word (ticket 05), so what someone types has to be
    matched against what they were shown. ADR-0005 puts tag matching above
    this seam for the same reason. */
export function searchEntries(query: string, tagLabel: (id: string) => string): Entry[] {
  const q = fold(query.trim());
  if (!q) return [];
  return entriesNewestFirst().filter((e) => {
    if (fold(e.note || '').includes(q)) return true;
    return e.tags.some((id) => fold(tagLabel(id)).includes(q));
  });
}

export interface SeriesPoint {
  day: number;
  value: number;
  count: number;
}

export function seriesForRange(rangeDays: number, metric: string): SeriesPoint[] {
  const today = todayEpochDay();
  const byDay = new Map<number, number[]>();
  for (const e of db.entries) {
    if (e.epochDay < today - rangeDays + 1 || e.epochDay > today) continue;
    const v = metric === 'mood' ? e.mood : (e.dims?.[metric] ?? null);
    if (v == null) continue;
    if (!byDay.has(e.epochDay)) byDay.set(e.epochDay, []);
    byDay.get(e.epochDay)!.push(v);
  }
  return [...byDay.entries()]
    .map(([day, vals]) => ({ day, value: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }))
    .sort((a, b) => a.day - b.day);
}

export interface TagInsight {
  /** No label: built-in tags are keyed, and the wording comes from
      vocabulary.ts at display time (ticket 05). */
  id: string;
  count: number;
  withAvg: number;
  withoutAvg: number;
}

export function tagInsights(rangeDays: number, metric: string): TagInsight[] {
  const today = todayEpochDay();
  const inRange = db.entries.filter((e) => e.epochDay >= today - rangeDays + 1);
  const val = (e: Entry) => (metric === 'mood' ? e.mood : (e.dims?.[metric] ?? null));
  const allTagIds = new Set(inRange.flatMap((e) => e.tags));
  const rows: TagInsight[] = [];
  for (const id of allTagIds) {
    const t = tagById(id);
    if (!t || t.hidden) continue;
    const withT = inRange.filter((e) => e.tags.includes(id)).map(val).filter((v): v is number => v != null);
    const without = inRange.filter((e) => !e.tags.includes(id)).map(val).filter((v): v is number => v != null);
    if (withT.length < 3 || !without.length) continue; // <3 entries → too noisy
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    rows.push({ id, count: withT.length, withAvg: avg(withT), withoutAvg: avg(without) });
  }
  return rows.sort((a, b) => Math.abs(b.withAvg - b.withoutAvg) - Math.abs(a.withAvg - a.withoutAvg));
}
