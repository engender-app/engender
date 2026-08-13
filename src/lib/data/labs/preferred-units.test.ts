import { describe, expect, test } from 'vitest';
import { defaultUnitForAnalyte, nextUnitAfterAnalyteChange } from './preferred-units';

describe('manual labs preferred-unit defaults', () => {
  const preferred = {
    estradiol: 'pmol/L',
    testosterone: 'nmol/L'
  };

  test('new rows default to preferred unit for the selected analyte', () => {
    expect(defaultUnitForAnalyte('estradiol', preferred)).toBe('pmol/L');
  });

  test('new rows stay blank for analytes without a preferred unit', () => {
    expect(defaultUnitForAnalyte('prolactin', preferred)).toBe('');
  });

  test('changing analyte updates unit when the unit is blank', () => {
    const unit = nextUnitAfterAnalyteChange({
      previousAnalyte: 'estradiol',
      nextAnalyte: 'testosterone',
      currentUnit: '',
      preferredUnits: preferred
    });

    expect(unit).toBe('nmol/L');
  });

  test('changing analyte updates unit when the current unit still equals the previous preferred default', () => {
    const unit = nextUnitAfterAnalyteChange({
      previousAnalyte: 'estradiol',
      nextAnalyte: 'testosterone',
      currentUnit: 'pmol/L',
      preferredUnits: preferred
    });

    expect(unit).toBe('nmol/L');
  });

  test('changing analyte keeps manually edited unit values', () => {
    const unit = nextUnitAfterAnalyteChange({
      previousAnalyte: 'estradiol',
      nextAnalyte: 'testosterone',
      currentUnit: 'pg/mL',
      preferredUnits: preferred
    });

    expect(unit).toBe('pg/mL');
  });
});