/* Contract and behavioral tests for stock running out notice (ticket 02).
   Verifies:
   - Projection trigger criteria (<= 7 days remaining, 0 units / exhausted).
   - Depleting stocks multi-drug urgency sorting.
   - Home notice presentation, action link to /care, and dismiss controls.
   - 24-hour reminder snooze behavior and restoration past 24 hours.
   - "Don't show again" setting preference toggle.
   - Stock restocking reconciliation / reactive dismissal.
   - Settings registry integration and localization parity. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clearStockNoticeSnooze,
  depletingStocks,
  isStockDepletingSoon,
  isStockNoticeSnoozed,
  snoozeStockNotice
} from '../src/lib/data/stockProjection.ts';
import type { MedicationStock } from '../src/lib/data/types.ts';
import { UNPROMPTED_ROWS } from '../src/lib/unprompted/registry.ts';
import { NO_COST } from '../src/lib/data/cost.ts';
import { NO_ACKNOWLEDGEMENTS, type AcknowledgementStore, type Acknowledgements } from '../src/lib/data/acknowledgements.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const home = read('src/routes/+page.svelte');
const homeMarkup = home.replace(/<script[\s\S]*?<\/script>/g, '');
const care = read('src/routes/care/+page.svelte');
const enMessages = JSON.parse(read('messages/en.json'));
const plMessages = JSON.parse(read('messages/pl.json'));


describe('Stock projection and depletion logic (ticket 02)', () => {
  const TODAY = 20000;

  it('triggers when remaining days are <= threshold (7 days)', () => {
    // 5 days remaining
    const projection5Days = {
      remaining: 5,
      dailyRate: 1,
      runOutEpochDay: TODAY + 5,
      excludedDoses: 0
    };
    expect(isStockDepletingSoon(projection5Days, TODAY)).toBe(true);

    // Exactly 7 days remaining
    const projection7Days = {
      remaining: 7,
      dailyRate: 1,
      runOutEpochDay: TODAY + 7,
      excludedDoses: 0
    };
    expect(isStockDepletingSoon(projection7Days, TODAY)).toBe(true);

    // 8 days remaining (beyond threshold) -> false
    const projection8Days = {
      remaining: 8,
      dailyRate: 1,
      runOutEpochDay: TODAY + 8,
      excludedDoses: 0
    };
    expect(isStockDepletingSoon(projection8Days, TODAY)).toBe(false);
  });

  it('triggers when stock is completely exhausted (0 or negative units)', () => {
    const projectionZero = {
      remaining: 0,
      dailyRate: 1,
      runOutEpochDay: TODAY,
      excludedDoses: 0
    };
    expect(isStockDepletingSoon(projectionZero, TODAY)).toBe(true);

    const projectionNegative = {
      remaining: -3,
      dailyRate: 1,
      runOutEpochDay: TODAY,
      excludedDoses: 0
    };
    expect(isStockDepletingSoon(projectionNegative, TODAY)).toBe(true);
  });

  it('does not trigger when daily rate is zero/null (never consumed)', () => {
    const projectionNoRate = {
      remaining: 10,
      dailyRate: null,
      runOutEpochDay: null,
      excludedDoses: 0
    };
    expect(isStockDepletingSoon(projectionNoRate, TODAY)).toBe(false);
  });

  it('depletingStocks prioritizes the most urgent stock (lowest days remaining)', () => {
    const stockA: MedicationStock = {
      id: 'stock-a',
      drug: 'Spironolactone',
      quantity: 10,
      unit: 'tablets',
      recordedEpochDay: TODAY - 10,
      reminderEverCreated: false,
      reminderDismissed: false,
      openedEpochDay: null,
      inUseWindowDays: null,
      inUseEndEpochDay: null,
      leadTimeDays: null,
      dosesPerUnit: null,
      expiryEpochDay: null,
      pharmacyNote: null,
      cost: NO_COST
    };
    const stockB: MedicationStock = {
      id: 'stock-b',
      drug: 'Estradiol Valerate',
      quantity: 2,
      unit: 'vials',
      recordedEpochDay: TODAY - 10,
      reminderEverCreated: false,
      reminderDismissed: false,
      openedEpochDay: null,
      inUseWindowDays: null,
      inUseEndEpochDay: null,
      leadTimeDays: null,
      dosesPerUnit: null,
      expiryEpochDay: null,
      pharmacyNote: null,
      cost: NO_COST
    };
    const stockC: MedicationStock = {
      id: 'stock-c',
      drug: 'Progesterone',
      quantity: 30,
      unit: 'capsules',
      recordedEpochDay: TODAY - 10,
      reminderEverCreated: false,
      reminderDismissed: false,
      openedEpochDay: null,
      inUseWindowDays: null,
      inUseEndEpochDay: null,
      leadTimeDays: null,
      dosesPerUnit: null,
      expiryEpochDay: null,
      pharmacyNote: null,
      cost: NO_COST
    };

    const rows = [
      { entry: stockA, projection: { remaining: 5, dailyRate: 1, runOutEpochDay: TODAY + 5, excludedDoses: 0 } },
      { entry: stockB, projection: { remaining: 1, dailyRate: 1, runOutEpochDay: TODAY + 1, excludedDoses: 0 } },
      { entry: stockC, projection: { remaining: 20, dailyRate: 1, runOutEpochDay: TODAY + 20, excludedDoses: 0 } }
    ];

    const depleting = depletingStocks(rows, TODAY);
    expect(depleting.length).toBe(2);
    expect(depleting[0].entry.drug).toBe('Estradiol Valerate');
    expect(depleting[0].daysRemaining).toBe(1);
    expect(depleting[1].entry.drug).toBe('Spironolactone');
    expect(depleting[1].daysRemaining).toBe(5);
  });

  it('manages 24-hour snooze suppression and restores after 24 hours', () => {
    let value: Acknowledgements = NO_ACKNOWLEDGEMENTS;
    const store: AcknowledgementStore = { read: () => value, write: (next) => (value = next) };
    const now = 1700000000000;

    expect(isStockNoticeSnoozed(store, now)).toBe(false);

    snoozeStockNotice(store, now);
    expect(isStockNoticeSnoozed(store, now)).toBe(true);
    expect(isStockNoticeSnoozed(store, now + 12 * 3600_000)).toBe(true);
    expect(isStockNoticeSnoozed(store, now + 24 * 3600_000 - 100)).toBe(true);

    // After 24h, snooze expires
    expect(isStockNoticeSnoozed(store, now + 24 * 3600_000 + 1)).toBe(false);

    // Explicit clear
    snoozeStockNotice(store, now);
    clearStockNoticeSnooze(store);
    expect(isStockNoticeSnoozed(store, now)).toBe(false);
  });
});

describe('Home stock notice rendering and interaction', () => {
  it('gating derives on preference, depleting stock query, and snooze state', () => {
    expect(home).toContain("let showStockNotice = $derived(surfaceOn(prefs.surfaceOverrides, 'stock-notice') && !!urgentDepletingStock && !isStockNoticeSnoozedState);");
    expect(home).toContain('j.stock.getProjections(today)');
    expect(home).toContain('depletingStocks(stockProjectionsQuery.rows, today)[0]');
  });

  it('renders Notice on Home with alert icon, action to /care, and dismiss control', () => {
    expect(homeMarkup).toContain('data-stock-notice');
    expect(homeMarkup).toContain('key="stock-low"');
    expect(homeMarkup).toContain('icon="alert"');
    expect(home).toContain("href: '/care'");
    expect(home).toContain('stockDismissSheetOpen = true');
  });

  it('provides dismiss sheet with 24h snooze and permanent disable actions', () => {
    expect(homeMarkup).toContain('data-stock-dismiss-sheet');
    expect(homeMarkup).toContain('data-stock-snooze');
    expect(homeMarkup).toContain('data-stock-dont-show');
    expect(home).toContain('snoozeStockNotice(acknowledgementStore)');
    expect(home).toContain("withSurface(prefs.surfaceOverrides, 'stock-notice', false)");
  });
});

describe('Settings live-tiles registry integration', () => {
  it('registers stock-notice in live-tiles registry', () => {
    const row = UNPROMPTED_ROWS.find((r) => r.key === 'stock-notice');
    expect(row).toBeDefined();
    expect(row?.surface?.defaultOn).toBe(true);
    expect(row?.title()).toBe(enMessages.tile_stock_title);
  });
});

describe('Localization keys for stock notice', () => {
  const requiredKeys = [
    'tile_stock_title',
    'notice_stock_low_title',
    'notice_stock_reorder_title',
    'notice_stock_reorder_body',
    'notice_stock_projected_body',
    'notice_stock_out_body',
    'notice_stock_manage',
    'notice_stock_dismiss_action',
    'notice_stock_dismiss_title',
    'remind_in_24_hours',
    'notice_stock_dont_show_btn',
    'reminder_snoozed_toast',
    'care_mark_reorder_by',
    'stock_lead_time_label',
    'stock_lead_time_placeholder',
    'stock_lead_time_hint'
  ];

  for (const key of requiredKeys) {
    it(`contains ${key} in both en.json and pl.json`, () => {
      expect(enMessages[key]).toBeTruthy();
      expect(plMessages[key]).toBeTruthy();
    });
  }
});

describe('The reorder-by day, on screen (ticket 16)', () => {
  it('names the same day everywhere: Home reads actionableEpochDay through the shared sentence', () => {
    expect(home).toContain("import { stockNotice } from '$lib/data/vocabulary/stockLabel';");
    expect(home).toContain('stockNotice(');
    expect(home).toContain('urgentDepletingStock.actionableEpochDay');
    // The countdown this ticket retires must not come back.
    expect(home).not.toContain('notice_stock_low_body');
  });

  it('the care spine reads the same actionableEpochDay and relabels its mark', () => {
    // One lane per running drug (phase 11 ticket 10), so both halves are
    // now per lane: the mark's day is that lane's own stock row, and the
    // label reads that row's own lead time.
    expect(care).toContain('runOutEpochDay: lane.runOut?.actionableEpochDay ?? null');
    expect(care).toContain('leadTimeDays !== null ? m.care_mark_reorder_by() : m.care_mark_run_out()');
  });

  it('the stock surface carries a lead-time field, typed as an optional day count', () => {
    // Ticket 09 (ADR-0084): the stock editor is a sheet off Care now, not
    // its own screen at /settings/stock.
    const stockSheet = read('src/routes/care/+page.svelte');
    expect(stockSheet).toContain('m.stock_lead_time_label()');
    expect(stockSheet).toContain('m.stock_lead_time_hint()');
    expect(stockSheet).toContain('leadTimeDays');
  });
});
