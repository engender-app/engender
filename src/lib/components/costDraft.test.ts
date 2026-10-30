import assert from 'node:assert/strict';
import { test } from 'vitest';
import { blankCostDraft, costDraftFrom, costDraftOk, costFromDraft } from './costDraft.ts';
import { NO_COST } from '../data/cost.ts';

test('a blank draft starts in the default currency with nothing written', () => {
  assert.deepEqual(blankCostDraft('PLN'), { amount: '', currency: 'PLN', refunded: false });
  assert.deepEqual(costFromDraft(blankCostDraft('PLN')), NO_COST);
});

test('a stored cost opens with its amount in the locale and its own currency', () => {
  assert.deepEqual(costDraftFrom({ amount: 250.5, currency: 'EUR', refunded: true }, 'PLN', 'pl-PL'), { amount: '250,5', currency: 'EUR', refunded: true });
  assert.deepEqual(costDraftFrom({ amount: 1500, currency: 'GBP', refunded: false }, 'PLN', 'en-GB'), { amount: '1500', currency: 'GBP', refunded: false });
  assert.deepEqual(costDraftFrom(NO_COST, 'PLN', 'pl-PL'), blankCostDraft('PLN'));
  assert.deepEqual(costDraftFrom({ amount: null, currency: null, refunded: true }, 'PLN', 'pl-PL'), { amount: '', currency: 'PLN', refunded: true });
});

test('a draft saves as the amount it parses to, and a blank amount saves no currency', () => {
  assert.deepEqual(costFromDraft({ amount: '250,50', currency: 'PLN', refunded: false }), { amount: 250.5, currency: 'PLN', refunded: false });
  assert.deepEqual(costFromDraft({ amount: '  ', currency: 'PLN', refunded: true }), { amount: null, currency: null, refunded: true });
});

test('only an amount that does not parse holds the save back', () => {
  assert.equal(costDraftOk({ amount: '', currency: 'PLN', refunded: false }), true);
  assert.equal(costDraftOk({ amount: '1 200,00', currency: 'PLN', refunded: false }), true);
  assert.equal(costDraftOk({ amount: '200-300', currency: 'PLN', refunded: false }), false);
  assert.equal(costDraftOk({ amount: 'free', currency: 'PLN', refunded: false }), false);
});
