/* LabRepository (PRD F30). */

import { db, save } from '../db.svelte';
import type { LabResult } from '../types';

export function labAnalytes(): string[] {
  return [...new Set(db.labResults.map((l) => l.analyte))];
}

export function resultsFor(analyte: string): LabResult[] {
  return db.labResults.filter((l) => l.analyte === analyte).sort((a, b) => a.epochDay - b.epochDay);
}

export function upsertLabResult(l: Partial<LabResult> & { analyte: string; value: number; epochDay: number }) {
  if (l.id) {
    const i = db.labResults.findIndex((x) => x.id === l.id);
    if (i >= 0) db.labResults[i] = { ...db.labResults[i], ...l } as LabResult;
  } else {
    db.labResults.push({ unit: '—', note: '', ...l, id: 'l' + Date.now() } as LabResult);
  }
  save();
}
