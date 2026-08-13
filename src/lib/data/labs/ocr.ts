import { dateInputValueFromEpochDay, epochDayFromDateInputValue } from '../epochDay';
import { normalizeUnit } from '../journal/labs';
import { foldText } from '../fold';
import {
  canonicalizeLabMeasurement,
  convertLabValue,
  preferredUnitForAnalyte,
  type PreferredLabUnits
} from './units';

export interface OcrCandidateRow {
  analyteText: string;
  valueText: string;
  unitText: string;
  dateText: string;
  line: string;
  lineConfidence: number;
}

export interface OcrParsedRow {
  analyte: string;
  unresolvedAnalyte: boolean;
  value: number;
  unit: string;
  date: string;
  note: string;
  lowConfidence: boolean;
  line: string;
}

export interface OcrReviewRow {
  include: boolean;
  analyte: string;
  value: string;
  unit: string;
  date: string;
  note: string;
  lowConfidence: boolean;
  duplicate: boolean;
}

export interface OcrSaveValidation {
  ok: boolean;
  firstError: 'missing-analyte' | 'invalid-value' | 'missing-date' | 'invalid-date' | null;
}

const ANALYTE_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: 'estradiol',
    aliases: ['estradiol', 'e2', 'oestradiol', 'estradiolum', 'estradiol e2']
  },
  {
    canonical: 'testosterone',
    aliases: ['testosterone', 'testosteron', 'testost.']
  },
  {
    canonical: 'prolactin',
    aliases: ['prolactin', 'prolaktyna', 'prl']
  }
];

const DATE_PATTERNS = [
  /\b(\d{4})[-/.](\d{2})[-/.](\d{2})\b/,
  /\b(\d{2})[-/.](\d{2})[-/.](\d{4})\b/
];

function canonicalAnalyte(raw: string): { analyte: string; unresolved: boolean } {
  const folded = foldText(raw).replace(/\s+/g, ' ').trim();
  for (const group of ANALYTE_ALIASES) {
    for (const alias of group.aliases) {
      if (foldText(alias) === folded) return { analyte: group.canonical, unresolved: false };
    }
  }
  return { analyte: raw.trim().toLowerCase(), unresolved: true };
}

export function parseLabNumeric(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function normalizeDate(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [a, b, c] = match.slice(1);
    const iso = pattern === DATE_PATTERNS[0] ? `${a}-${b}-${c}` : `${c}-${b}-${a}`;
    const epochDay = epochDayFromDateInputValue(iso);
    if (epochDay !== null && dateInputValueFromEpochDay(epochDay) === iso) return iso;
  }
  return '';
}

function findDocumentDate(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const date = normalizeDate(line);
    if (date) return date;
  }
  return '';
}

function candidateFromLine(line: string): OcrCandidateRow | null {
  const compact = line.trim().replace(/\s+/g, ' ');
  if (!compact) return null;
  const match = /^(.+?)\s+(-?\d+(?:[.,]\d+)?)\s*([A-Za-z%/][A-Za-z0-9%/._-]*)?(?:\s+.*)?$/u.exec(compact);
  if (!match) return null;
  return {
    analyteText: match[1].trim(),
    valueText: match[2].trim(),
    unitText: (match[3] ?? '').trim(),
    dateText: normalizeDate(compact),
    line: compact,
    lineConfidence: 0.8
  };
}

export function parseOcrLabRows(text: string): OcrParsedRow[] {
  const documentDate = findDocumentDate(text);
  const rows: OcrParsedRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const candidate = candidateFromLine(line);
    if (!candidate) continue;
    const value = parseLabNumeric(candidate.valueText);
    if (value === null) continue;
    const mapped = canonicalAnalyte(candidate.analyteText);
    rows.push({
      analyte: mapped.analyte,
      unresolvedAnalyte: mapped.unresolved,
      value,
      unit: candidate.unitText,
      date: candidate.dateText || documentDate,
      note: '',
      lowConfidence: mapped.unresolved || candidate.lineConfidence < 0.7 || !candidate.unitText,
      line: candidate.line
    });
  }
  return rows;
}

function duplicateKey(row: Pick<OcrReviewRow, 'date' | 'analyte' | 'value' | 'unit'>): string | null {
  const epochDay = epochDayFromDateInputValue(row.date);
  const value = parseLabNumeric(row.value);
  if (epochDay === null || value === null || !row.analyte.trim()) return null;
  const analyte = row.analyte.trim().toLowerCase();
  const canonical = canonicalizeLabMeasurement(analyte, value, row.unit);
  const rounded = Math.round(canonical.value * 1_000_000) / 1_000_000;
  return `${epochDay}|${analyte}|${rounded}|${canonical.unit}`;
}

export function buildDuplicateKeys(rows: Array<{ epochDay: number; analyte: string; value: number; unit: string }>): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const analyte = row.analyte.trim().toLowerCase();
    const canonical = canonicalizeLabMeasurement(analyte, row.value, row.unit);
    const rounded = Math.round(canonical.value * 1_000_000) / 1_000_000;
    keys.add(`${row.epochDay}|${analyte}|${rounded}|${canonical.unit}`);
  }
  return keys;
}

export function applyPreferredUnitDefaults(parsed: OcrParsedRow[], preferredUnits: PreferredLabUnits): OcrParsedRow[] {
  return parsed.map((row) => {
    const preferred = preferredUnitForAnalyte(row.analyte, preferredUnits);
    if (!preferred) return row;

    const current = normalizeUnit(row.unit);
    if (!current || current.toLowerCase() === preferred.toLowerCase()) {
      return { ...row, unit: current || preferred };
    }

    const converted = convertLabValue(row.analyte, row.value, current, preferred);
    if (converted === null) {
      return { ...row, unit: current, lowConfidence: true };
    }

    return { ...row, value: converted, unit: preferred };
  });
}

export function makeReviewRows(parsed: OcrParsedRow[], duplicates: Set<string>): OcrReviewRow[] {
  return parsed.map((row) => {
    const draft: OcrReviewRow = {
      include: true,
      analyte: row.analyte,
      value: String(row.value).replace('.', ','),
      unit: row.unit,
      date: row.date,
      note: row.note,
      lowConfidence: row.lowConfidence,
      duplicate: false
    };
    draft.duplicate = duplicateKey(draft) !== null && duplicates.has(duplicateKey(draft)!);
    if (draft.duplicate) draft.include = false;
    return draft;
  });
}

export function validateRowsForSave(rows: OcrReviewRow[]): OcrSaveValidation {
  for (const row of rows) {
    if (!row.include) continue;
    if (!row.analyte.trim()) return { ok: false, firstError: 'missing-analyte' };
    if (parseLabNumeric(row.value) === null) return { ok: false, firstError: 'invalid-value' };
    if (!row.date.trim()) return { ok: false, firstError: 'missing-date' };
    if (epochDayFromDateInputValue(row.date) === null) return { ok: false, firstError: 'invalid-date' };
  }
  return { ok: true, firstError: null };
}

export function isPermissionDenied(error: unknown): boolean {
  const text = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  return text.includes('permission') && (text.includes('denied') || text.includes('refused'));
}
