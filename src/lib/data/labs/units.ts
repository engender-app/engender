import { normalizeUnit } from '../journal/labs';

export type PreferredUnitAnalyte = 'estradiol' | 'testosterone' | 'prolactin';
export type PreferredLabUnits = Partial<Record<PreferredUnitAnalyte, string>>;

export const PREFERRED_UNIT_ANALYTES: readonly PreferredUnitAnalyte[] = [
  'estradiol',
  'testosterone',
  'prolactin'
];

export const ALLOWED_PREFERRED_UNITS: Record<PreferredUnitAnalyte, readonly string[]> = {
  estradiol: ['pg/mL', 'pmol/L'],
  testosterone: ['ng/dL', 'nmol/L'],
  prolactin: ['ng/mL', 'mIU/L']
};

const FACTORS: Record<PreferredUnitAnalyte, Record<string, number>> = {
  estradiol: {
    'pg/ml': 1,
    'pmol/l': 1 / 3.671
  },
  testosterone: {
    'ng/dl': 1,
    'nmol/l': 28.842
  },
  prolactin: {
    'ng/ml': 1,
    'miu/l': 1 / 21.2
  }
};

function asAnalyte(analyte: string): PreferredUnitAnalyte | null {
  const normalized = analyte.trim().toLowerCase();
  return PREFERRED_UNIT_ANALYTES.find((item) => item === normalized) ?? null;
}

function canonicalUnitFor(analyte: PreferredUnitAnalyte, unit: string): string | null {
  const normalized = normalizeUnit(unit).toLowerCase();
  return ALLOWED_PREFERRED_UNITS[analyte].find((allowed) => allowed.toLowerCase() === normalized) ?? null;
}

export function normalizePreferredUnitSelection(analyte: string, selectedUnit: string): string | null {
  const known = asAnalyte(analyte);
  if (!known) return null;
  return canonicalUnitFor(known, selectedUnit);
}

export function sanitizePreferredLabUnits(input: PreferredLabUnits): PreferredLabUnits {
  const sanitized: PreferredLabUnits = {};
  for (const analyte of PREFERRED_UNIT_ANALYTES) {
    const selected = input[analyte];
    if (!selected) continue;
    const canonical = normalizePreferredUnitSelection(analyte, selected);
    if (canonical) sanitized[analyte] = canonical;
  }
  return sanitized;
}

export function preferredUnitForAnalyte(analyte: string, preferred: PreferredLabUnits): string | null {
  const known = asAnalyte(analyte);
  if (!known) return null;
  const selected = preferred[known];
  return selected ? normalizePreferredUnitSelection(known, selected) : null;
}

export function convertLabValue(analyte: string, value: number, fromUnit: string, toUnit: string): number | null {
  const known = asAnalyte(analyte);
  if (!known) return null;
  const from = canonicalUnitFor(known, fromUnit);
  const to = canonicalUnitFor(known, toUnit);
  if (!from || !to) return null;
  if (from === to) return value;

  const factors = FACTORS[known];
  const fromFactor = factors[from.toLowerCase()];
  const toFactor = factors[to.toLowerCase()];
  if (!fromFactor || !toFactor) return null;

  return (value * fromFactor) / toFactor;
}

export function canonicalizeLabMeasurement(analyte: string, value: number, unit: string): { value: number; unit: string } {
  const known = asAnalyte(analyte);
  if (!known) return { value, unit: normalizeUnit(unit) };

  const canonicalUnit = canonicalUnitFor(known, unit);
  if (!canonicalUnit) return { value, unit: normalizeUnit(unit) };

  const baseUnit = ALLOWED_PREFERRED_UNITS[known][0];
  const converted = convertLabValue(known, value, canonicalUnit, baseUnit);
  return { value: converted ?? value, unit: baseUnit };
}