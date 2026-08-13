import { describe, expect, test } from 'vitest';
import {
  ALLOWED_PREFERRED_UNITS,
  canonicalizeLabMeasurement,
  convertLabValue,
  normalizePreferredUnitSelection,
  preferredUnitForAnalyte,
  sanitizePreferredLabUnits,
  type PreferredLabUnits
} from './units';

describe('labs preferred-unit catalogue', () => {
  test('defines allowed units for each supported analyte', () => {
    expect(ALLOWED_PREFERRED_UNITS.estradiol).toEqual(['pg/mL', 'pmol/L']);
    expect(ALLOWED_PREFERRED_UNITS.testosterone).toEqual(['ng/dL', 'nmol/L']);
    expect(ALLOWED_PREFERRED_UNITS.prolactin).toEqual(['ng/mL', 'mIU/L']);
  });

  test('normalizes stored preferred-unit selections to allowed canonical values', () => {
    expect(normalizePreferredUnitSelection('estradiol', '  PMOL/l ')).toBe('pmol/L');
    expect(normalizePreferredUnitSelection('testosterone', 'ng/dl')).toBe('ng/dL');
    expect(normalizePreferredUnitSelection('estradiol', 'mg/L')).toBeNull();
  });

  test('drops unknown analytes and invalid units from stored preferences', () => {
    const sanitized = sanitizePreferredLabUnits({
      estradiol: 'PMOL/L',
      testosterone: 'ng/dL',
      prolactin: 'invalid',
      shbg: 'nmol/L'
    } as unknown as PreferredLabUnits);

    expect(sanitized).toEqual({ estradiol: 'pmol/L', testosterone: 'ng/dL' });
  });

  test('returns no preferred unit for unsupported analytes', () => {
    const preferred: PreferredLabUnits = { estradiol: 'pmol/L' };
    expect(preferredUnitForAnalyte('shbg', preferred)).toBeNull();
  });
});

describe('labs unit conversion', () => {
  test('converts estradiol values between pg/mL and pmol/L', () => {
    const converted = convertLabValue('estradiol', 100, 'pg/mL', 'pmol/L');
    expect(converted).not.toBeNull();
    expect(converted!).toBeCloseTo(367.1, 4);

    const back = convertLabValue('estradiol', converted!, 'pmol/L', 'pg/mL');
    expect(back).toBeCloseTo(100, 4);
  });

  test('converts testosterone values between ng/dL and nmol/L', () => {
    const converted = convertLabValue('testosterone', 100, 'ng/dL', 'nmol/L');
    expect(converted).not.toBeNull();
    expect(converted!).toBeCloseTo(3.467, 3);

    const back = convertLabValue('testosterone', converted!, 'nmol/L', 'ng/dL');
    expect(back).toBeCloseTo(100, 4);
  });

  test('returns null when conversion is not defined for that analyte or unit', () => {
    expect(convertLabValue('estradiol', 100, 'pg/mL', 'ng/dL')).toBeNull();
    expect(convertLabValue('shbg', 100, 'nmol/L', 'pmol/L')).toBeNull();
  });

  test('canonical duplicate comparison shape is stable across convertible units', () => {
    const raw = canonicalizeLabMeasurement('estradiol', 121.3, 'pg/mL');
    const converted = canonicalizeLabMeasurement('estradiol', 445.2923, 'pmol/L');

    expect(raw.unit).toBe('pg/mL');
    expect(converted.unit).toBe('pg/mL');
    expect(raw.value).toBeCloseTo(converted.value, 4);
  });
});