import { publishFixture } from './mount';
import { freshOrigin } from './fresh-origin';
import { homeContracts } from './home-surfaces.test';
import { calendarContracts } from './calendar-surfaces.test';
import { directionContracts, directionNarrowContracts } from './direction-contract.test';

publishFixture('screen-mount', async () => {
  await freshOrigin();
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
