/* LabRepository (PRD F30). */

import { db, save } from '../db.svelte';
import type { LabResult } from '../types';

/** The analytes offered before any result exists. Lowercase scientific
    names shown as-is, like every stored analyte (CONTEXT: "Analyte" -
    free-text, never interpreted). */
export const ANALYTE_PRESETS = ['estradiol', 'testosterone', 'prolactin'];

/** In-use analytes only - what the trend picker offers, since a trend
    needs data. */
export function labAnalytes(): string[] {
  return [...new Set(db.labResults.map((l) => l.analyte))];
}

/** Presets plus in-use, for the editor: a preset is offerable with no
    data yet, and a custom analyte someone logged once stays offerable. */
export function getAnalytes(): string[] {
  return [...new Set([...ANALYTE_PRESETS, ...labAnalytes()])];
}

export function resultsFor(analyte: string): LabResult[] {
  return db.labResults.filter((l) => l.analyte === analyte).sort((a, b) => a.epochDay - b.epochDay);
}

export function upsertLabResult(l: Partial<LabResult> & { analyte: string; value: number; epochDay: number }) {
  if (l.id) {
    const i = db.labResults.findIndex((x) => x.id === l.id);
    if (i < 0) throw new Error(`unknown lab result: ${l.id}`);
    db.labResults[i] = { ...db.labResults[i], ...l } as LabResult;
  } else {
    db.labResults.push({ unit: '—', note: '', ...l, id: crypto.randomUUID() } as LabResult);
  }
  save();
}

export function deleteResult(id: string) {
  db.labResults = db.labResults.filter((l) => l.id !== id);
  save();
}
