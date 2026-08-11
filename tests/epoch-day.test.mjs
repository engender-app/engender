/* Epoch-day round-trip check — no test harness exists yet (ticket 03 lands
   one), so this is a plain Node script. It imports the pure epoch-day
   arithmetic straight from src/lib/data/epochDay.ts, which has zero imports
   of its own, so plain Node can run it without the SvelteKit/paraglide
   build. Run under both timezones:

     TZ=America/Los_Angeles node tests/epoch-day.test.mjs
     TZ=Europe/Warsaw node tests/epoch-day.test.mjs

   The LA case is the regression ADR-0001 and this ticket exist for: west of
   UTC, the old UTC-anchored fmtDay/epochDayFromISO rendered the previous
   calendar day. */
import { todayEpochDay, epochDayFromLocalDate, localDateFromEpochDay } from '../src/lib/data/epochDay.ts';

let failures = 0;
const ok = (n) => console.log('PASS', n);
const fail = (n, detail) => { failures++; console.log('FAIL', n, '—', detail); };

/* 1. Known-good literal, independent of the implementation: 2024-01-01 is
      epoch day 19723 (1704067200000ms UTC / 86400000ms per day). */
{
  const day = epochDayFromLocalDate(new Date(2024, 0, 1));
  if (day === 19723) ok('epochDayFromLocalDate(2024-01-01) is 19723');
  else fail('epochDayFromLocalDate(2024-01-01) is 19723', `got ${day}`);
}

/* 2. Round-trip holds regardless of time-of-day, including the 22:00 hour
      that used to cross UTC midnight for anyone west of UTC. */
{
  const cases = [
    new Date(2024, 0, 15, 0, 0, 0),
    new Date(2024, 0, 15, 22, 0, 0),
    new Date(2024, 0, 15, 23, 59, 59),
  ];
  for (const d of cases) {
    const back = localDateFromEpochDay(epochDayFromLocalDate(d));
    const same =
      back.getFullYear() === d.getFullYear() && back.getMonth() === d.getMonth() && back.getDate() === d.getDate();
    if (same) ok(`round-trip holds for ${d.toString()}`);
    else fail(`round-trip holds for ${d.toString()}`, `got ${back.toDateString()}`);
  }
}

/* 3. The ticket's actual acceptance criterion: for the current wall-clock
      instant, localDateFromEpochDay(todayEpochDay()) is the device's
      calendar date. */
{
  const now = new Date();
  const local = localDateFromEpochDay(todayEpochDay());
  const same =
    local.getFullYear() === now.getFullYear() && local.getMonth() === now.getMonth() && local.getDate() === now.getDate();
  const tz = process.env.TZ ?? '(system default)';
  if (same) ok(`localDateFromEpochDay(todayEpochDay()) matches the device's calendar date under TZ=${tz}`);
  else fail(`localDateFromEpochDay(todayEpochDay()) matches the device's calendar date under TZ=${tz}`,
    `today=${now.toDateString()} got=${local.toDateString()}`);
}

console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);
