import { publishFixture } from './mount';
import { freshOrigin } from './fresh-origin';
import { homeContracts } from './home-contracts';
import { calendarContracts } from './calendar-contracts';
import { directionContracts, directionNarrowContracts } from './direction-contracts';
import { safeSpaceContracts } from './safe-space-contracts';
import { lateReadsContracts } from './late-reads-contracts';
import { lookBackContracts } from './look-back-contracts';

publishFixture('screen-mount', async () => {
  await freshOrigin();
  if (location.search.includes('safe-space')) return { safeSpace: await safeSpaceContracts() };
  if (location.search.includes('look-back')) return { lookBack: await lookBackContracts() };
  if (location.search.includes('late-reads'))
    return { lateReads: await lateReadsContracts(location.search.includes('theme=dark') ? 'dark' : 'light') };
  if (location.search.includes('home')) return { home: await homeContracts() };
  if (location.search.includes('narrow')) return { narrow: await directionNarrowContracts() };
  const result: Record<string, unknown> = {};
  for (const [name, run] of Object.entries({
    direction: directionContracts,
    home: homeContracts,
    calendar: calendarContracts
  })) {
    try {
      result[name] = await run();
    } catch (error) {
      result[name] = { error: String((error as Error)?.stack ?? error) };
    }
  }
  return result;
});
