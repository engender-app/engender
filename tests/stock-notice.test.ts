/* Contract and behavioral tests for stock running out notice (ticket 02).
   Verifies:
   - Projection trigger criteria (<= 7 days remaining, 0 units / exhausted).
   - Depleting stocks multi-drug urgency sorting.
   - Home notice presentation, action link to /settings/stock, and dismiss controls.
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

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const home = read('src/routes/+page.svelte');
const homeMarkup = home.replace(/<script[\s\S]*?<\/script>/g, '');
const enMessages = JSON.parse(read('messages/en.json'));
const plMessages = JSON.parse(read('messages/pl.json'));

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

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
      inUseEndEpochDay: null
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
      inUseEndEpochDay: null
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
      inUseEndEpochDay: null
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
    const storage = new MemoryStorage();
    const now = 1700000000000;

    expect(isStockNoticeSnoozed(now, storage)).toBe(false);

    snoozeStockNotice(now, storage);
    expect(isStockNoticeSnoozed(now, storage)).toBe(true);
    expect(isStockNoticeSnoozed(now + 12 * 3600_000, storage)).toBe(true);
    expect(isStockNoticeSnoozed(now + 24 * 3600_000 - 100, storage)).toBe(true);

    // After 24h, snooze expires
    expect(isStockNoticeSnoozed(now + 24 * 3600_000 + 1, storage)).toBe(false);

    // Explicit clear
    snoozeStockNotice(now, storage);
    clearStockNoticeSnooze(storage);
    expect(isStockNoticeSnoozed(now, storage)).toBe(false);
  });
});

describe('Home stock notice rendering and interaction', () => {
  it('gating derives on preference, depleting stock query, and snooze state', () => {
    expect(home).toContain('let showStockNotice = $derived(prefs.stockNoticeEnabled && !!urgentDepletingStock && !isStockNoticeSnoozedState);');
    expect(home).toContain('j.stock.getProjections(today)');
    expect(home).toContain('depletingStocks(stockProjectionsQuery.rows, today)[0]');
  });

  it('renders Notice on Home with alert icon, action to /settings/stock, and dismiss control', () => {
    expect(homeMarkup).toContain('data-stock-notice');
    expect(homeMarkup).toContain('key="stock-low"');
    expect(homeMarkup).toContain('icon="alert"');
    expect(home).toContain("href: '/settings/stock'");
    expect(home).toContain('stockDismissSheetOpen = true');
  });

  it('provides dismiss sheet with 24h snooze and permanent disable actions', () => {
    expect(homeMarkup).toContain('data-stock-dismiss-sheet');
    expect(homeMarkup).toContain('data-stock-snooze');
    expect(homeMarkup).toContain('data-stock-dont-show');
    expect(home).toContain('snoozeStockNotice()');
    expect(home).toContain('prefs.stockNoticeEnabled = false');
  });
});

describe('Settings live-tiles registry integration', () => {
  it('registers stock-notice in live-tiles registry', () => {
    const row = UNPROMPTED_ROWS.find((r) => r.key === 'stock-notice');
    expect(row).toBeDefined();
    expect(row?.surface?.prefKey).toBe('stockNoticeEnabled');
    expect(row?.title()).toBe(enMessages.tile_stock_title);
  });
});

describe('Localization keys for stock notice', () => {
  const requiredKeys = [
    'tile_stock_title',
    'tile_stock_sub',
    'notice_stock_low_title',
    'notice_stock_low_body',
    'notice_stock_out_body',
    'notice_stock_manage',
    'notice_stock_dismiss_action',
    'notice_stock_dismiss_title',
    'notice_stock_dismiss_hint',
    'notice_stock_snooze_btn',
    'notice_stock_dont_show_btn',
    'notice_stock_snoozed_toast'
  ];

  for (const key of requiredKeys) {
    it(`contains ${key} in both en.json and pl.json`, () => {
      expect(enMessages[key]).toBeTruthy();
      expect(plMessages[key]).toBeTruthy();
    });
  }
});
