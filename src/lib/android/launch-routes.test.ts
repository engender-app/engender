import { describe, it, expect } from 'vitest';
import { isValidAndroidLaunchRoute } from './launch-routes';
import fixture from './fixtures/launch-routes.json';

/* Shared with ReminderSchedulerLaunchRouteFixtureTest.java against the same
   file (ADR-0028): a route accepted here and rejected there, or the other
   way around, is a tap that lands nowhere. */
describe('isValidAndroidLaunchRoute against the shared fixture', () => {
  for (const { route, accepted } of fixture as Array<{ route: string; accepted: boolean }>) {
    it(`${accepted ? 'accepts' : 'rejects'} ${JSON.stringify(route)}`, () => {
      expect(isValidAndroidLaunchRoute(route)).toBe(accepted);
    });
  }
});
