import { describe, expect, test } from 'vitest';
import { epochDayFromDateInputValue } from '../epochDay';
import { journalWithBuiltIns } from '../journal/test-support';

import {
  applyPreferredUnitDefaults,
  buildDuplicateKeys,
  isPermissionDenied,
  makeReviewRows,
  parseLabNumeric,
  parseOcrLabRows,
  validateRowsForSave
} from './ocr';

describe('OCR lab parser', () => {
  test('extracts multiple EN and PL rows with alias mapping', () => {
    const rows = parseOcrLabRows(`
Date: 2026-08-12
Estradiol 123,4 pg/mL
Testosteron 0,92 ng/mL
PRL 18.5 ng/mL
`);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.analyte)).toEqual(['estradiol', 'testosterone', 'prolactin']);
    expect(rows.map((row) => row.value)).toEqual([123.4, 0.92, 18.5]);
    expect(rows.every((row) => row.date === '2026-08-12')).toBe(true);
  });

  test('maps Polish and English aliases for target analytes', () => {
    const rows = parseOcrLabRows(`
Data: 12.08.2026
prolaktyna 22,1 ng/mL
oestradiol 141,0 pg/mL
testosterone 0.8 ng/mL
`);
    expect(rows.map((row) => row.analyte)).toEqual(['prolactin', 'estradiol', 'testosterone']);
  });

  test('accepts decimal comma and decimal point', () => {
    expect(parseLabNumeric('123,4')).toBe(123.4);
    expect(parseLabNumeric('123.4')).toBe(123.4);
    expect(parseLabNumeric('12 3,4')).toBeNull();
  });

  test('keeps unresolved analyte with low-confidence warning', () => {
    const rows = parseOcrLabRows('Androstenedione 3,2 ng/mL');
    expect(rows).toHaveLength(1);
    expect(rows[0].analyte).toBe('androstenedione');
    expect(rows[0].lowConfidence).toBe(true);
  });

  test('marks missing-unit rows as low confidence', () => {
    const rows = parseOcrLabRows('Estradiol 121,3');
    expect(rows).toHaveLength(1);
    expect(rows[0].lowConfidence).toBe(true);
  });

  test('returns no rows when OCR text has no usable values', () => {
    expect(parseOcrLabRows('Laboratory report\nNo quantitative rows found')).toEqual([]);
  });
});

describe('OCR review helpers', () => {
  test('marks duplicates and defaults them to skip', () => {
    const epochDay = epochDayFromDateInputValue('2026-08-12');
    if (epochDay === null) throw new Error('fixture date must be valid');
    const duplicates = buildDuplicateKeys([
      { epochDay, analyte: 'estradiol', value: 123.4, unit: 'pg/mL' }
    ]);
    const review = makeReviewRows(
      [
        {
          analyte: 'estradiol',
          unresolvedAnalyte: false,
          value: 123.4,
          unit: 'pg/mL',
          date: '2026-08-12',
          note: '',
          lowConfidence: false,
          line: 'Estradiol 123,4 pg/mL'
        }
      ],
      duplicates
    );

    expect(review).toHaveLength(1);
    expect(review[0].duplicate).toBe(true);
    expect(review[0].include).toBe(false);
  });

  test('duplicate detection still matches convertible values across unit differences', () => {
    const epochDay = epochDayFromDateInputValue('2026-08-12');
    if (epochDay === null) throw new Error('fixture date must be valid');
    const duplicates = buildDuplicateKeys([
      { epochDay, analyte: 'estradiol', value: 123.4, unit: 'pg/mL' }
    ]);

    const preferred = applyPreferredUnitDefaults(
      [
        {
          analyte: 'estradiol',
          unresolvedAnalyte: false,
          value: 123.4,
          unit: 'pg/mL',
          date: '2026-08-12',
          note: '',
          lowConfidence: false,
          line: 'Estradiol 123,4 pg/mL'
        }
      ],
      { estradiol: 'pmol/L' }
    );

    const review = makeReviewRows(preferred, duplicates);

    expect(review).toHaveLength(1);
    expect(review[0].unit).toBe('pmol/L');
    expect(review[0].duplicate).toBe(true);
    expect(review[0].include).toBe(false);
  });

  test('applies preferred unit defaults in OCR review when conversion is possible', () => {
    const converted = applyPreferredUnitDefaults(
      [
        {
          analyte: 'estradiol',
          unresolvedAnalyte: false,
          value: 123.4,
          unit: 'pg/mL',
          date: '2026-08-12',
          note: '',
          lowConfidence: false,
          line: 'Estradiol 123,4 pg/mL'
        }
      ],
      { estradiol: 'pmol/L' }
    );

    expect(converted[0].unit).toBe('pmol/L');
    expect(converted[0].value).toBeCloseTo(453.0014, 4);
    expect(converted[0].lowConfidence).toBe(false);
  });

  test('keeps source unit and marks low confidence when preferred conversion is not possible', () => {
    const converted = applyPreferredUnitDefaults(
      [
        {
          analyte: 'estradiol',
          unresolvedAnalyte: false,
          value: 123.4,
          unit: 'ng/dL',
          date: '2026-08-12',
          note: '',
          lowConfidence: false,
          line: 'Estradiol 123,4 ng/dL'
        }
      ],
      { estradiol: 'pmol/L' }
    );

    expect(converted[0].unit).toBe('ng/dL');
    expect(converted[0].value).toBe(123.4);
    expect(converted[0].lowConfidence).toBe(true);
  });

  test('blocks save when included rows miss date', () => {
    const validation = validateRowsForSave([
      {
        include: true,
        analyte: 'estradiol',
        value: '123,4',
        unit: 'pg/mL',
        date: '',
        note: '',
        lowConfidence: false,
        duplicate: false
      }
    ]);
    expect(validation.ok).toBe(false);
    expect(validation.firstError).toBe('missing-date');
  });

  test('permission-denied detection recognizes clear platform errors', () => {
    expect(isPermissionDenied(new Error('camera permission denied'))).toBe(true);
    expect(isPermissionDenied(new Error('user cancelled'))).toBe(false);
  });

  test('end-to-end review rows save through journal labs upsert', async () => {
    const { journal } = await journalWithBuiltIns();

    await journal.labs.upsertResult({
      epochDay: epochDayFromDateInputValue('2026-08-12')!,
      analyte: 'estradiol',
      value: 123.4,
      unit: 'pg/mL'
    });

    const parsed = parseOcrLabRows(`
Date: 2026-08-12
Estradiol 123,4 pg/mL
PRL 18,5 ng/mL
`);

    const existing = await journal.labs.getResults('estradiol');
    const duplicateKeys = buildDuplicateKeys(
      existing.map((row) => ({
        epochDay: row.epochDay,
        analyte: row.analyte,
        value: row.value,
        unit: row.unit
      }))
    );
    const review = makeReviewRows(parsed, duplicateKeys);

    expect(review[0].duplicate).toBe(true);
    expect(review[0].include).toBe(false);
    expect(review[1].include).toBe(true);
    expect(validateRowsForSave(review).ok).toBe(true);

    for (const row of review) {
      if (!row.include) continue;
      await journal.labs.upsertResult({
        epochDay: epochDayFromDateInputValue(row.date)!,
        analyte: row.analyte,
        value: parseLabNumeric(row.value)!,
        unit: row.unit,
        note: row.note
      });
    }

    const estradiol = await journal.labs.getResults('estradiol');
    const prolactin = await journal.labs.getResults('prolactin');
    expect(estradiol).toHaveLength(1);
    expect(prolactin).toHaveLength(1);
    expect(prolactin[0].value).toBe(18.5);
  });
});
