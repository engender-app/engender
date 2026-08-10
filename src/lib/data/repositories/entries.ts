/* EntryRepository (PRD) — plus the query helpers Stats/Search/Calendar use.
   All reads are plain functions over the reactive db, so components wrap
   them in $derived and stay live. */

import { db, save, newId, todayEpochDay } from '../db.svelte';
import type { Entry } from '../types';
import { tagById } from './tags';

export function entriesNewestFirst(): Entry[] {
  return [...db.entries].sort((a, b) => b.epochDay - a.epochDay || b.timestamp - a.timestamp);
}

export function entriesForDay(epochDay: number): Entry[] {
  return db.entries.filter((e) => e.epochDay === epochDay).sort((a, b) => a.timestamp - b.timestamp);
}

export const getEntry = (id: number | string): Entry | undefined =>
  db.entries.find((e) => e.id === Number(id));

export function upsertEntry(entry: Partial<Entry> & { epochDay: number }): number {
  if (entry.id) {
    const i = db.entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) db.entries[i] = { ...db.entries[i], ...entry } as Entry;
  } else {
    entry.id = newId();
    entry.timestamp = entry.timestamp ?? Date.now();
    db.entries.push(entry as Entry);
  }
  save();
  return entry.id!;
}

export function deleteEntry(id: number) {
  db.entries = db.entries.filter((e) => e.id !== id);
  save();
}

export function quickLog(mood: number): number {
  return upsertEntry({ epochDay: todayEpochDay(), mood, note: '', dims: {}, tags: [], photos: [] });
}

/** Metric value for a day, 0–100 scale, averaged over its entries. */
export function dayMetricValue(epochDay: number, metric: string): number | null {
  const vals = entriesForDay(epochDay)
    .map((e) => (metric === 'mood' ? (e.mood != null ? e.mood * 20 : null) : (e.dims?.[metric] ?? null)))
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

const fold = (s: string) =>
  s.toLowerCase()
    .replace(/[ąàáâä]/g, 'a').replace(/[ćç]/g, 'c').replace(/[ęèéêë]/g, 'e')
    .replace(/[łl]/g, 'l').replace(/[ńñ]/g, 'n').replace(/[óòôö]/g, 'o')
    .replace(/[śš]/g, 's').replace(/[żźž]/g, 'z');

/** FTS5 stand-in: prefix-friendly, diacritics-insensitive note + tag match. */
export function searchEntries(query: string): Entry[] {
  const q = fold(query.trim());
  if (!q) return [];
  return entriesNewestFirst().filter((e) => {
    if (fold(e.note || '').includes(q)) return true;
    return e.tags.some((id) => {
      const t = tagById(id);
      return t ? fold(t.label).includes(q) : false;
    });
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
  id: string;
  label: string;
  count: number;
  withAvg: number;
  withoutAvg: number;
}

export function tagInsights(rangeDays: number, metric: string): TagInsight[] {
  const today = todayEpochDay();
  const inRange = db.entries.filter((e) => e.epochDay >= today - rangeDays + 1);
  const val = (e: Entry) =>
    metric === 'mood' ? (e.mood != null ? e.mood * 20 : null) : (e.dims?.[metric] ?? null);
  const allTagIds = new Set(inRange.flatMap((e) => e.tags));
  const rows: TagInsight[] = [];
  for (const id of allTagIds) {
    const t = tagById(id);
    if (!t || t.hidden) continue;
    const withT = inRange.filter((e) => e.tags.includes(id)).map(val).filter((v): v is number => v != null);
    const without = inRange.filter((e) => !e.tags.includes(id)).map(val).filter((v): v is number => v != null);
    if (withT.length < 3 || !without.length) continue; // <3 entries → too noisy
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    rows.push({ id, label: t.label, count: withT.length, withAvg: avg(withT), withoutAvg: avg(without) });
  }
  return rows.sort((a, b) => Math.abs(b.withAvg - b.withoutAvg) - Math.abs(a.withAvg - a.withoutAvg));
}
