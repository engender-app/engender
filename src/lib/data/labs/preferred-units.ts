import { normalizeUnit } from '../journal/labs';
import { preferredUnitForAnalyte, type PreferredLabUnits } from './units';

function sameUnit(a: string, b: string): boolean {
  return normalizeUnit(a).toLowerCase() === normalizeUnit(b).toLowerCase();
}

export function defaultUnitForAnalyte(analyte: string, preferredUnits: PreferredLabUnits): string {
  return preferredUnitForAnalyte(analyte, preferredUnits) ?? '';
}

export function nextUnitAfterAnalyteChange(params: {
  previousAnalyte: string;
  nextAnalyte: string;
  currentUnit: string;
  preferredUnits: PreferredLabUnits;
}): string {
  const previousPreferred = preferredUnitForAnalyte(params.previousAnalyte, params.preferredUnits);
  const nextPreferred = preferredUnitForAnalyte(params.nextAnalyte, params.preferredUnits);
  const current = normalizeUnit(params.currentUnit);

  if (!current) return nextPreferred ?? '';
  if (previousPreferred && sameUnit(current, previousPreferred)) return nextPreferred ?? '';
  return params.currentUnit;
}