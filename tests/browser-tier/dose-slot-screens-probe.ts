import { mountScreen, until } from './mount-screen';
import { fixture, today } from './screen-contracts/fixture';
import { publishFixture } from './mount';
import { startOfDayTimestamp } from '$lib/data/epochDay';
import { fmtDay } from '$lib/data/dates';
import { m } from '$lib/paraglide/messages';
import { setLocale } from '$lib/paraglide/runtime';
import { LIVE_TILE_PREF_KEY } from '$lib/data/liveTiles';
import { hubRowLine } from '$lib/data/vocabulary/hubLabels';
import { freshOrigin } from './fresh-origin';

publishFixture('dose-slot-screens', async () => {
  await freshOrigin();
  const params = new URLSearchParams(location.search);
  const offset = params.get('dose') === 'today' ? 0 : -1;
  const locale = params.get('locale') === 'pl' ? 'pl' : 'en';
  await setLocale(locale, { reload: false });
  const f = await fixture('dose-slot-readers', 1);
  f.preferences = { ...f.preferences, language: locale,
    theme: params.get('theme') === 'light' ? 'light' : 'dark',
    palette: params.get('palette') ?? 'trans', disguise: params.has('disguise'), pinnedRows: ['care'],
    [LIVE_TILE_PREF_KEY['dose-panel']]: true, [LIVE_TILE_PREF_KEY['patch-schedule-tile']]: true };
  const episodeId = await f.journal.regimen.upsertEpisode({ drug: 'Weekly patch proof', ester: null,
    dose: 100, doseUnit: 'mcg', route: 'patch', interval: 'weekly', startEpochDay: today - 14,
    endEpochDay: null, endReason: null });
  await f.journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 7 },
    dosesPerDay: 1, doseAmounts: [{ dose: 100, doseUnit: 'mcg' }], autoLogFromEpochDay: null });
  await f.journal.doses.upsertDose({ timestamp: startOfDayTimestamp(today + offset) + 12 * 3600000,
    route: 'patch', dose: 100, doseUnit: 'mcg', applicationSite: 'abdomen' });
  const next = today + 7;
  const date = fmtDay(next, { weekday: 'long', day: 'numeric', month: 'long' });
  const rowText = hubRowLine('care', { kind: 'next', epochDay: next,
    what: { area: 'dose', runOutEpochDay: null } }, today, Date.now());
  const results: { route: string; text: string }[] = [];
  for (const route of ['/', '/care', '/more']) {
    const screen = await mountScreen(route, f);
    try {
      const selector = route === '/' ? '[data-pinned-row="care"]'
        : route === '/care' ? '[data-care-regimen-days]' : '[data-list-row="care"]';
      const expected = route === '/care' ? m.care_next_dose({ when: date }) : rowText;
      const row = await until(() => {
        const row = screen.target.querySelector(selector);
        return row?.textContent?.includes(expected) ? row : null;
      }, `${route} next uncovered slot`);
      results.push({ route, text: row.textContent! });
      if (route === '/') {
        await until(() => screen.target.querySelector('[data-dose-panel-tile]')?.textContent?.includes(m.tile_dose_next({ date })), 'dose panel next uncovered slot');
        if (screen.target.querySelector('[data-patch-schedule-tile]')) throw new Error('covered patch slot still prompts another dose');
      }
      if (params.get('view') === route) {
        (window as unknown as { doseSlotView: typeof screen }).doseSlotView = screen;
        return { results, today, next, offset, locale };
      }
    } finally {
      if (params.get('view') !== route) await screen.remove();
    }
  }
  return { results, today, next, offset, locale };
});
