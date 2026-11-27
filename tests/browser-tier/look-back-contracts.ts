/* Look back after functional audit ticket 12, rendered over a real journal:
   the constellation plots with no mode, Tags carries the share ring with an
   "on good days" filter, Words and Highest days are gone, Look back offers
   one way into Wrapped and none while Wrapped is off, and the two "is off"
   notices open the screen where their switches live. Since Alicja's
   sign-off note, the mood strip draws on the door itself rather than
   behind a "Mood across days" tile, which leaves five tiles on a journal
   with no cost. Ticket 31's Cost reading, a sixth tile when the span holds
   a cost, is checked last, absent and then present. */
import { mountScreen, until } from './mount-screen';
import { fixture, assertions, today, type Result } from './screen-contracts/fixture';
import { startOfDayTimestamp } from '$lib/data/epochDay';
import { spanRangeQuery } from '$lib/data/lookBackSpan';
import { prefs } from '$lib/data/prefs/store.svelte';

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function lookBackContracts(): Promise<Result[]> {
  const results: Result[] = [];
  const check = assertions(results);
  const f = await fixture('look-back', 0);
  f.preferences!.activeScales = ['femininity', 'masculinity'];
  /* Seventy days, one entry each, so whichever completed period Wrapped
     offers today clears its floor. Two scales on every entry and no mode
     anywhere: the journal the constellation used to refuse. */
  for (let i = 1; i <= 70; i++) {
    const day = today - i;
    const good = i % 2 === 0;
    await f.journal.entries.upsertEntry({
      epochDay: day,
      timestamp: startOfDayTimestamp(day) + 9 * 3600000,
      mood: good ? 5 : 1,
      dims: { femininity: 40 + (i % 30), masculinity: 60 - (i % 30) },
      tags: [good ? 'e-calm' : 'g-misgendered'],
      ...(i % 10 === 0 ? { bodyRegions: { chest: 30 } } : {}),
      note: `Look back contract ${i}`
    });
  }
  const span = spanRangeQuery({ start: today - 80, end: today });
  let screen = await mountScreen(`/stats/plane${span}`, f);
  const root = () => screen.target;
  await check('the constellation plots a journal that has no mode', async () => {
    await until(() => root().querySelector('[data-chart-card="constellation"] svg circle'), 'constellation marks');
    return !root().querySelector('[data-chart-card="constellation"] .kit-chart-empty');
  });
  await screen.remove();

  screen = await mountScreen(`/stats/tags${span}`, f);
  const ring = () => root().querySelector('[data-chart-card="tag-share"] [data-chart="donut"]');
  const slices = () =>
    [...root().querySelectorAll('[data-chart-card="tag-share"] [data-donut-slice]')].map((s) => s.getAttribute('data-donut-slice'));
  await check('Tags carries the share ring the days reading had, beside its ranking', async () => {
    await until(ring, 'tag share ring');
    return slices().includes('e-calm') && slices().includes('g-misgendered') &&
      root().querySelector('[data-chart-card="tags-moved"]');
  });
  await check('Tags offers an "on good days" filter on the ring', async () => {
    const select = await until(
      () => root().querySelector<HTMLSelectElement>('[data-chart-card="tag-share"] select'),
      'tag share filter'
    );
    if (select.options.length !== 2 || ![...select.options].some((o) => o.value === 'good')) return false;
    select.value = 'good';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => slices().length === 1 && slices()[0] === 'e-calm', 'good-day ring');
    return true;
  });
  await screen.remove();

  for (const gone of ['words', 'highest', 'themes', 'days']) {
    screen = await mountScreen(`/stats/${gone}${span}`, f);
    await check(`/stats/${gone} is no reading any more`, () =>
      until(() => root().querySelector('[data-notice="stats-reading-unknown"]'), `${gone} unknown`));
    await screen.remove();
  }

  const wrappedLinks = () => root().querySelectorAll('a[href^="/wrapped"]').length;
  screen = await mountScreen('/stats', f);
  await until(() => root().querySelector('[data-lookback-readings] [data-reading]'), 'Look back tiles');
  await settle(400);
  await check('Look back has no Words, Highest days or affirming themes tile', () =>
    !root().querySelector('[data-reading="words"],[data-reading="highest"],[data-reading="themes"]'));
  const tiles = () => [...root().querySelectorAll('[data-lookback-readings] [data-reading]')].map((t) => t.getAttribute('data-reading'));
  await check('Look back draws five tiles, none of them Mood across days', () => {
    const drawn = tiles();
    return drawn.length === 5 && !drawn.includes('days');
  });
  await check('the mood strip draws on Look back itself, all five steps', () =>
    until(() => root().querySelectorAll('[data-chart-card="mood-days"] [data-strip-step]').length === 5, 'mood strip on the door'));
  await check('Look back draws exactly one way into Wrapped', () =>
    until(() => wrappedLinks() === 1, 'one Wrapped link'));
  await screen.remove();

  screen = await mountScreen('/stats', { ...f, preferences: { ...f.preferences, surfaceOverrides: { wrapped: false } } });
  await until(() => root().querySelector('[data-lookback-readings] [data-reading]'), 'Look back tiles, Wrapped off');
  await settle(400);
  await check('Look back draws no Wrapped link while Wrapped is off', () => wrappedLinks() === 0);
  await screen.remove();

  screen = await mountScreen('/wrapped/week', { ...f, preferences: { ...f.preferences, surfaceOverrides: { wrapped: false } } });
  await check('the Wrapped-off notice opens the notifications screen', async () => {
    const action = await until(
      () => root().querySelector<HTMLAnchorElement>('[data-notice="wrapped-off"] a[data-notice-action]'),
      'Wrapped off notice'
    );
    return action.getAttribute('href') === '/settings/notifications';
  });
  await screen.remove();

  screen = await mountScreen('/on-this-day', { ...f, preferences: { ...f.preferences, surfaceOverrides: { 'on-this-day': false } } });
  await check('the On-this-day-off notice opens the notifications screen', async () => {
    const action = await until(
      () => root().querySelector<HTMLAnchorElement>('[data-notice="on-this-day-off"] a[data-notice-action]'),
      'On this day off notice'
    );
    return action.getAttribute('href') === '/settings/notifications';
  });
  await screen.remove();

  Object.assign(prefs, { surfaceOverrides: {} });

  /* What it cost. Every check above ran on a
     journal with no cost in it, which is the reading's absent case: no
     tile, and its screen says the span holds none. */
  const costTile = () => root().querySelector<HTMLAnchorElement>('[data-lookback-readings] [data-reading="cost"]');
  screen = await mountScreen('/stats', f);
  await until(() => root().querySelector('[data-lookback-readings] [data-reading]'), 'Look back tiles, no costs');
  await settle(400);
  await check('a span with no cost in it has no Cost tile', () => tiles().length === 5 && !costTile());
  await screen.remove();
  screen = await mountScreen(`/stats/cost${span}`, f);
  await check('the Cost screen over a span with no cost says so in its card', () =>
    until(() => root().querySelector('[data-chart-card="cost"] .kit-chart-empty'), 'cost empty card'));
  await screen.remove();

  /* Two currencies, both refund states, three areas, one cost before the
     span and one wait with no day. */
  const pln = (amount: number, refunded = false) => ({ amount, currency: 'PLN', refunded });
  await f.journal.hairRemoval.upsertSession({ epochDay: today - 5, area: 'chin', method: 'laser', cost: pln(250, true) });
  await f.journal.hairRemoval.upsertSession({ epochDay: today - 4, area: 'chin', method: 'laser', cost: pln(250) });
  await f.journal.labs.upsertResult({ epochDay: today - 6, analyte: 'Estradiol', value: 150, unit: 'pg/mL', cost: pln(120.5) });
  await f.journal.appointments.upsertAppointment({
    epochDay: today - 7, procedureId: null, kind: 'endo', place: null, note: null, cost: { amount: 80, currency: 'EUR', refunded: false }
  });
  await f.journal.labs.upsertResult({ epochDay: today - 200, analyte: 'Estradiol', value: 140, unit: 'pg/mL', cost: pln(999) });
  await f.journal.appointments.upsertAppointment({
    epochDay: null, procedureId: null, kind: 'clinic', place: null, note: null, cost: pln(300)
  });

  screen = await mountScreen('/stats', f);
  await check('a span with costs draws a Cost tile with the most-used currency\'s total, naming the other', async () => {
    const tile = await until(costTile, 'Cost tile');
    const text = tile.textContent ?? '';
    return /620[.,]5/.test(text) && text.includes('EUR') && !/700[.,]5|1[ .,]?619/.test(text) &&
      (tile.getAttribute('href') ?? '').startsWith('/stats/cost?');
  });
  await screen.remove();

  screen = await mountScreen(`/stats/cost${span}`, f);
  const card = (code: string) => root().querySelector(`[data-cost-currency="${code}"]`);
  const figure = (code: string, handle: string) =>
    card(code)?.querySelector(`${handle} .wrapped-figure-value`)?.textContent?.replace(/\s/g, '') ?? '';
  await check('the Cost screen draws one card per currency and no figure across two', async () => {
    await until(() => card('PLN') && card('EUR'), 'two currency cards');
    const totals = [...root().querySelectorAll('[data-cost-total]')].map((t) => t.textContent ?? '');
    return totals.length === 2 && /620[.,]5/.test(totals[0]) && /80/.test(totals[1]) &&
      root().querySelector('[data-cost-apart]') !== null;
  });
  await check('each currency splits by area: hair removal and labs in PLN, appointments in EUR', () => {
    const areas = (code: string) => [...(card(code)?.querySelectorAll('[data-cost-area]') ?? [])].map((a) => a.getAttribute('data-cost-area'));
    return areas('PLN').join() === 'hairRemoval,lab' && areas('EUR').join() === 'appointment' &&
      /500/.test(figure('PLN', '[data-cost-area="hairRemoval"]')) && /120[.,]5/.test(figure('PLN', '[data-cost-area="lab"]'));
  });
  await check('each currency splits by refunded state, the two parts making its total', () =>
    /250/.test(figure('PLN', '[data-cost-refund="refunded"]')) && /370[.,]5/.test(figure('PLN', '[data-cost-refund="not-refunded"]')));
  await check('a currency with nothing refunded says so once rather than repeating its total', () =>
    !card('EUR')?.querySelector('[data-cost-refund]') && /not refunded|none refunded/i.test(card('EUR')?.textContent ?? ''));
  await check('the Cost screen counts the cost with no day rather than adding it to the span', () =>
    root().querySelector('[data-cost-undated]') !== null);
  await screen.remove();

  return results;
}
