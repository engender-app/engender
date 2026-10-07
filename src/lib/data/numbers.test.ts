import { describe, expect, it } from 'vitest';
import { formatNumber } from './numbers';

describe('localized numbers', () => {
  it('keeps one mood decimal in English and Polish', () => {
    expect(formatNumber(3.5, 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe('3.5');
    expect(formatNumber(3.5, 'pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe('3,5');
    expect(formatNumber(3, 'pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe('3,0');
  });
  it('formats fractional doses without adding precision', () => {
    expect(formatNumber(0.5, 'en-GB')).toBe('0.5');
    expect(formatNumber(0.5, 'pl-PL')).toBe('0,5');
    expect(formatNumber(0.125, 'pl-PL')).toBe('0,125');
  });
});
