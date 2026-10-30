/* What a record cost (functional audit ticket 30, CONTEXT: "Cost"): an
   amount, the currency it was paid in and whether it was refunded. A field
   on the records that cost money - hair-removal sessions, appointments,
   procedures, lab results and the medication stock held now - rather than a
   module of its own.

   The amount is stored in major units as typed (250.5, not 25050): every
   reader formats it through Intl for its own currency, and a total is only
   ever taken inside one currency (costTotalsByCurrency), so no conversion and
   no minor-unit table is needed. Amounts in two currencies are never added
   together anywhere in the app.

   No CHECK constraints (the audit's CHECK policy): assertValidCost is the one
   rule, used by every write path and, through archiveRowValidation.ts, by an
   archive's rows. */

export interface Cost {
  /** In the currency's major unit; null when no amount was written. */
  amount: number | null;
  /** An ISO 4217 code, upper case. Null exactly when `amount` is. */
  currency: string | null;
  /** Paid back, in whole: an insurer, NFZ, a crowdfunder. A refund can be
      noted without an amount. */
  refunded: boolean;
}

export const NO_COST: Cost = Object.freeze({ amount: null, currency: null, refunded: false });

/** A cost as a writer may pass it. Absent and null both mean none. */
export type CostInput = Partial<Cost> | null | undefined;

/** The currencies the editor offers, in this order; a record holding any
    other code keeps it and the editor adds it to the list. */
export const CURRENCY_CHOICES = ['PLN', 'EUR', 'GBP', 'USD', 'CHF', 'CZK', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD'] as const;

/** Far above any treatment, low enough that a typo of six extra digits is refused. */
const MAX_AMOUNT = 1e9;

const CODE = /^[A-Z]{3}$/;

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

/** At most two decimal places, the most the editor reads or writes back:
    an amount with a third would round when it is opened and saved. */
export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** A blank amount drops its currency, and a code is upper-cased. */
export function normalizeCost(input: CostInput): Cost {
  if (!input) return NO_COST;
  const amount = input.amount ?? null;
  const refunded = input.refunded === true;
  if (amount === null) return refunded ? { amount: null, currency: null, refunded } : NO_COST;
  return { amount, currency: input.currency ? input.currency.trim().toUpperCase() : null, refunded };
}

/** Throws before anything is written. */
export function assertValidCost(cost: Cost): void {
  const ok = cost.amount === null
    ? cost.currency === null
    : isValidAmount(cost.amount) && isCurrencyCode(cost.currency);
  if (!ok || typeof cost.refunded !== 'boolean') throw new Error(`invalid cost: ${JSON.stringify(cost)}`);
}

/** The three columns every costed table holds, in this order. */
export function costColumns(cost: Cost): [number | null, string | null, number] {
  return [cost.amount, cost.currency, cost.refunded ? 1 : 0];
}

export type CostRow = { cost_amount: number | null; cost_currency: string | null; cost_refunded: number };

export function costFromRow(row: CostRow): Cost {
  return { amount: row.cost_amount, currency: row.cost_currency, refunded: row.cost_refunded !== 0 };
}

/* One amount as people write it: digits with an optional decimal part of
   one or two digits after a comma or a dot, optionally grouped in threes by
   a space, a dot, a comma or an apostrophe that differs from the decimal
   mark. A trailing ",-" (Polish "250,-") means no decimal part. */
const PLAIN = /^\d+(?:[.,]\d{1,2})?$/;
const GROUPED = /^\d{1,3}([\s.,'])\d{3}(?:\1\d{3})*(?:([.,])\d{1,2})?$/;

/** The amount in `text`, or null when it is not exactly one plain amount. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(/[.,]-$/, '');
  let digits: string;
  if (PLAIN.test(trimmed)) {
    digits = trimmed.replace(',', '.');
  } else {
    const grouped = GROUPED.exec(trimmed);
    if (!grouped || grouped[1] === grouped[2]) return null;
    const decimal = grouped[2];
    const [whole, fraction] = decimal ? [trimmed.slice(0, trimmed.lastIndexOf(decimal)), trimmed.slice(trimmed.lastIndexOf(decimal) + 1)] : [trimmed, ''];
    digits = whole.replace(/\D/g, '') + (fraction ? `.${fraction}` : '');
  }
  const amount = Number(digits);
  return isValidAmount(amount) ? amount : null;
}

const MARKS: Record<string, string> = {
  'zł': 'PLN', zl: 'PLN', '€': 'EUR', euro: 'EUR', '£': 'GBP', '$': 'USD', 'us$': 'USD'
};

let knownCodes: Set<string> | null = null;
function allCodes(): Set<string> {
  knownCodes ??= new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : CURRENCY_CHOICES);
  return knownCodes;
}
function isKnownCode(code: string): boolean {
  return allCodes().has(code);
}

/** What the editor's currency select lists: the common choices first, then
    every other code the runtime knows, alphabetically, and `current` if it is
    none of those (a code from an archive). The default table cannot cover
    every region, so nobody is left without their currency. */
export function currencyChoices(current: string): string[] {
  const common: string[] = [...CURRENCY_CHOICES];
  const rest = [...allCodes()].filter((code) => !common.includes(code)).sort();
  const list = [...common, ...rest];
  return list.includes(current) ? list : [...common, current, ...rest];
}

function currencyOfMark(mark: string): string | null {
  const lower = mark.toLowerCase();
  if (MARKS[lower]) return MARKS[lower];
  const code = mark.toUpperCase();
  return CODE.test(code) && isKnownCode(code) ? code : null;
}

/** Hair removal's free-text cost before ticket 30, read by the recorded
    rule (ADR "Cost on records"): one amount (parseAmount), with at most one
    currency mark - a symbol (zł, €, £, $), or an ISO code - before or after
    it. A bare amount takes `fallbackCurrency`, the default currency of the
    device's locale. Anything else - words, a range, two amounts, an unknown
    mark - is not a clean parse and returns null, and the caller moves the
    text into the session's note unchanged. */
export function parseLegacyCostText(text: string, fallbackCurrency: string): { amount: number; currency: string } | null {
  const match = /^([^\d]*)(\d[\d\s.,'-]*)([^\d]*)$/.exec(text.trim());
  if (!match) return null;
  const before = match[1].trim();
  const after = match[3].trim();
  if (before && after) return null;
  const mark = before || after;
  const currency = mark ? currencyOfMark(mark) : fallbackCurrency;
  const amount = parseAmount(match[2]);
  return currency === null || amount === null ? null : { amount, currency };
}

/* Region to currency, for the default only. A region missing here falls
   through to the next locale, then to EUR. */
const EURO = ['AD', 'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC', 'ME',
  'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'XK'];
const REGION_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((region) => [region, 'EUR'])),
  PL: 'PLN', GB: 'GBP', US: 'USD', CH: 'CHF', LI: 'CHF', CZ: 'CZK', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', HU: 'HUF', RO: 'RON', BG: 'BGN', UA: 'UAH', IS: 'ISK',
  RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL', MD: 'MDL', BY: 'BYN', RU: 'RUB', TR: 'TRY', GE: 'GEL',
  IL: 'ILS', JP: 'JPY', CN: 'CNY', HK: 'HKD', TW: 'TWD', KR: 'KRW', SG: 'SGD', IN: 'INR', TH: 'THB',
  PH: 'PHP', ID: 'IDR', MY: 'MYR', VN: 'VND', ZA: 'ZAR', NG: 'NGN', KE: 'KES', EG: 'EGP', AE: 'AED',
  SA: 'SAR', BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU'
};

function regionOf(locale: string, maximize: boolean): string | undefined {
  try {
    const parsed = new Intl.Locale(locale);
    return (maximize ? parsed.maximize() : parsed).region;
  } catch {
    return undefined;
  }
}

/** The currency a new cost starts in: the first locale that names a region
    the table knows, else the likely region of the first locale ("pl" is
    Poland), else EUR. Callers pass `navigator.languages`. */
export function defaultCurrency(locales: readonly string[]): string {
  for (const locale of locales) {
    const region = regionOf(locale, false);
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  const likely = locales.length ? regionOf(locales[0], true) : undefined;
  return (likely && REGION_CURRENCY[likely]) || 'EUR';
}

/** The device's own default, where there is a navigator to ask. */
export function deviceDefaultCurrency(): string {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
  return defaultCurrency(nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : []);
}

/** `amount` in `currency`, as the locale writes money: "250 zł" for a whole
    amount, "250,50 zł" for one with a fraction. */
export function formatAmount(amount: number, currency: string, locale: string): string {
  try {
    // Never fewer than the two places an amount may hold (isValidAmount), so a
    // currency with no minor unit still shows JP¥250.5 as stored, not JP¥251.
    const natural = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    // trailingZeroDisplay is ES2023 Intl; this lib target does not type it yet.
    const options = {
      style: 'currency', currency, trailingZeroDisplay: 'stripIfInteger', maximumFractionDigits: Math.max(2, natural)
    } as Intl.NumberFormatOptions;
    return new Intl.NumberFormat(locale, options).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export interface CurrencyTotal {
  currency: string;
  /** Every amount in this currency, refunded ones included. */
  total: number;
  /** The part of `total` that was refunded. */
  refunded: number;
  /** How many records carried an amount in this currency. */
  count: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** One total per currency, by code. Never one figure across currencies:
    there is no rate to convert by, and adding 250 zł to 80 € says nothing.
    Records with no amount are left out. */
export function costTotalsByCurrency(costs: readonly Cost[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();
  for (const cost of costs) {
    if (cost.amount === null || cost.currency === null) continue;
    const total = byCurrency.get(cost.currency) ?? { currency: cost.currency, total: 0, refunded: 0, count: 0 };
    total.total += cost.amount;
    if (cost.refunded) total.refunded += cost.amount;
    total.count += 1;
    byCurrency.set(cost.currency, total);
  }
  return [...byCurrency.values()]
    .map((total) => ({ ...total, total: round(total.total), refunded: round(total.refunded) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
