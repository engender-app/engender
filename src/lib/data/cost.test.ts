import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  assertValidCost,
  costTotalsByCurrency,
  defaultCurrency,
  currencyChoices,
  formatAmount,
  NO_COST,
  normalizeCost,
  parseAmount,
  parseLegacyCostText
} from './cost.ts';

test('an amount is read with a comma or a dot, and grouped thousands', () => {
  assert.equal(parseAmount('250'), 250);
  assert.equal(parseAmount('250,50'), 250.5);
  assert.equal(parseAmount('250.5'), 250.5);
  assert.equal(parseAmount(' 1 500,00 '), 1500);
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('1,500.25'), 1500.25);
  assert.equal(parseAmount('1.500,25'), 1500.25);
  assert.equal(parseAmount('250,-'), 250);
  assert.equal(parseAmount('0'), 0);
});

test('anything that is not one plain amount reads as no amount', () => {
  for (const text of ['', ' ', '-5', '200-300', '1,5,5', '1.500.5', 'free', '12a', '1,500,25', '1 50', '1.5.2026', 'Infinity']) {
    assert.equal(parseAmount(text), null, text);
  }
});

test('a legacy cost with a currency mark before or after it becomes an amount in that currency', () => {
  assert.deepEqual(parseLegacyCostText('250 zł', 'EUR'), { amount: 250, currency: 'PLN' });
  assert.deepEqual(parseLegacyCostText('250zl', 'EUR'), { amount: 250, currency: 'PLN' });
  assert.deepEqual(parseLegacyCostText('PLN 300,50', 'EUR'), { amount: 300.5, currency: 'PLN' });
  assert.deepEqual(parseLegacyCostText('€80', 'PLN'), { amount: 80, currency: 'EUR' });
  assert.deepEqual(parseLegacyCostText('80 eur', 'PLN'), { amount: 80, currency: 'EUR' });
  assert.deepEqual(parseLegacyCostText('£45.50', 'PLN'), { amount: 45.5, currency: 'GBP' });
  assert.deepEqual(parseLegacyCostText('$120', 'PLN'), { amount: 120, currency: 'USD' });
  assert.deepEqual(parseLegacyCostText('CHF 90', 'PLN'), { amount: 90, currency: 'CHF' });
  assert.deepEqual(parseLegacyCostText('1 200,- zł', 'EUR'), { amount: 1200, currency: 'PLN' });
});

test('a bare legacy number takes the fallback currency', () => {
  assert.deepEqual(parseLegacyCostText('  250 ', 'PLN'), { amount: 250, currency: 'PLN' });
  assert.deepEqual(parseLegacyCostText('99.90', 'GBP'), { amount: 99.9, currency: 'GBP' });
});

test('a legacy cost that is not one clean amount does not parse', () => {
  for (const text of ['free', 'covered by NFZ', '200-300 zł', '250 zł + 50 zł tip', 'zł', '250 zł zł', '€ 80 £', 'about 200', '250 PLN?', '']) {
    assert.equal(parseLegacyCostText(text, 'PLN'), null, text);
  }
});

test('the default currency follows the first locale that names a region, then the likely region of the first', () => {
  assert.equal(defaultCurrency(['pl-PL']), 'PLN');
  assert.equal(defaultCurrency(['en-GB', 'pl-PL']), 'GBP');
  assert.equal(defaultCurrency(['en-US']), 'USD');
  assert.equal(defaultCurrency(['de-AT']), 'EUR');
  assert.equal(defaultCurrency(['ja-JP']), 'JPY');
  assert.equal(defaultCurrency(['en', 'en-IE']), 'EUR');
  assert.equal(defaultCurrency(['pl']), 'PLN');
  assert.equal(defaultCurrency(['en']), 'USD');
  assert.equal(defaultCurrency([]), 'EUR');
  assert.equal(defaultCurrency(['not a locale']), 'EUR');
});

test('normalizing drops a currency with no amount and upper-cases a code', () => {
  assert.deepEqual(normalizeCost(undefined), NO_COST);
  assert.deepEqual(normalizeCost(null), NO_COST);
  assert.deepEqual(normalizeCost({ amount: null, currency: 'PLN', refunded: false }), NO_COST);
  assert.deepEqual(normalizeCost({ amount: 12.5, currency: 'pln', refunded: true }), { amount: 12.5, currency: 'PLN', refunded: true });
  assert.deepEqual(normalizeCost({ amount: null, currency: null, refunded: true }), { amount: null, currency: null, refunded: true });
});

test('a cost is refused when its amount is not a non-negative number or its currency is not a code', () => {
  assertValidCost(NO_COST);
  assertValidCost({ amount: 0, currency: 'PLN', refunded: false });
  for (const cost of [
    { amount: -1, currency: 'PLN', refunded: false },
    { amount: Number.NaN, currency: 'PLN', refunded: false },
    { amount: Number.POSITIVE_INFINITY, currency: 'PLN', refunded: false },
    { amount: 1e12, currency: 'PLN', refunded: false },
    { amount: 49.999, currency: 'PLN', refunded: false },
    { amount: 49.990000001, currency: 'PLN', refunded: false },
    { amount: 10, currency: null, refunded: false },
    { amount: 10, currency: 'zł', refunded: false },
    { amount: 10, currency: 'PL', refunded: false }
  ]) {
    assert.throws(() => assertValidCost(cost), /invalid cost/, JSON.stringify(cost));
  }
});

test('totals never add two currencies together', () => {
  const totals = costTotalsByCurrency([
    { amount: 250, currency: 'PLN', refunded: false },
    { amount: 80, currency: 'EUR', refunded: false },
    { amount: 0.1, currency: 'PLN', refunded: true },
    { amount: 0.2, currency: 'PLN', refunded: false },
    { amount: null, currency: null, refunded: true },
    NO_COST
  ]);
  assert.deepEqual(totals, [
    { currency: 'EUR', total: 80, refunded: 0, count: 1 },
    { currency: 'PLN', total: 250.3, refunded: 0.1, count: 3 }
  ]);
});

test('a whole amount is written without decimals, a fraction with its two', () => {
  assert.equal(formatAmount(250, 'PLN', 'pl-PL'), '250\u00a0zł');
  assert.equal(formatAmount(250.5, 'PLN', 'pl-PL'), '250,50\u00a0zł');
  assert.equal(formatAmount(9800, 'EUR', 'en-GB'), '€9,800');
  // JPY has no minor unit, but an amount typed with one is shown as stored.
  assert.equal(formatAmount(250.5, 'JPY', 'en-GB'), 'JP¥250.5');
});

test('the currency list offers the common ones first, then every other code, and keeps a stored one', () => {
  const list = currencyChoices('PLN');
  assert.deepEqual(list.slice(0, 3), ['PLN', 'EUR', 'GBP']);
  assert.ok(list.includes('MAD'));
  assert.equal(new Set(list).size, list.length);
  assert.ok(currencyChoices('XYZ').includes('XYZ'));
});
