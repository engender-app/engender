import { describe, expect, it } from 'vitest';
import { costReading } from './costReading';
import type { CostRecord, CostSource } from './journal/costs';

let next = 0;
const record = (
  source: CostSource,
  epochDay: number | null,
  amount: number | null,
  currency: string | null,
  refunded = false
): CostRecord => ({ source, id: `r${next++}`, epochDay, cost: { amount, currency, refunded } });

const span = { start: 100, end: 130 };

describe('costReading', () => {
  it('totals the span per currency, never across two', () => {
    const reading = costReading(
      [
        record('hairRemoval', 100, 250, 'PLN'),
        record('appointment', 110, 80.5, 'EUR'),
        record('lab', 130, 120.25, 'PLN')
      ],
      span
    );
    expect(reading.currencies.map((c) => [c.currency, c.total])).toEqual([
      ['PLN', 370.25],
      ['EUR', 80.5]
    ]);
  });

  it('leaves out costs outside the span and undated ones, and counts the undated', () => {
    const reading = costReading(
      [
        record('hairRemoval', 99, 250, 'PLN'),
        record('hairRemoval', 131, 250, 'PLN'),
        record('appointment', null, 300, 'PLN'),
        record('procedure', null, 9000, 'PLN'),
        record('lab', 120, 50, 'PLN')
      ],
      span
    );
    expect(reading.currencies).toHaveLength(1);
    expect(reading.currencies[0].total).toBe(50);
    expect(reading.undated).toBe(2);
  });

  it('splits each currency by area, in the areas order, with each area its own refunded part', () => {
    const reading = costReading(
      [
        record('stock', 101, 40, 'PLN'),
        record('hairRemoval', 102, 250, 'PLN', true),
        record('hairRemoval', 103, 250, 'PLN'),
        record('procedure', 104, 12000, 'PLN', true),
        record('appointment', 105, 100, 'PLN')
      ],
      span
    );
    expect(reading.currencies[0].byArea).toEqual([
      { source: 'hairRemoval', total: 500, refunded: 250, count: 2 },
      { source: 'appointment', total: 100, refunded: 0, count: 1 },
      { source: 'procedure', total: 12000, refunded: 12000, count: 1 },
      { source: 'stock', total: 40, refunded: 0, count: 1 }
    ]);
  });

  it('splits each currency by refunded state, the two parts making its total', () => {
    const reading = costReading(
      [
        record('lab', 110, 0.1, 'EUR', true),
        record('lab', 111, 0.2, 'EUR'),
        record('appointment', 112, 99.99, 'EUR', true)
      ],
      span
    );
    const [eur] = reading.currencies;
    expect(eur.total).toBe(100.29);
    expect(eur.refunded).toBe(100.09);
    expect(eur.notRefunded).toBe(0.2);
    expect(eur.count).toBe(3);
  });

  it('puts the currency with the most costs first, then by code', () => {
    const reading = costReading(
      [
        record('lab', 110, 1, 'USD'),
        record('lab', 110, 1, 'EUR'),
        record('lab', 111, 1, 'PLN'),
        record('lab', 112, 1, 'PLN')
      ],
      span
    );
    expect(reading.currencies.map((c) => c.currency)).toEqual(['PLN', 'EUR', 'USD']);
  });

  it('is empty for a span with no amount in it: a refund noted without an amount is no money', () => {
    const reading = costReading([record('appointment', 110, null, null, true), record('lab', 10, 5, 'PLN')], span);
    expect(reading.currencies).toEqual([]);
  });
});
