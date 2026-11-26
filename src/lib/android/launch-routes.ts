/* Extracted from +layout.svelte for the same reason as back-navigation.ts:
   a pure function trapped in the component had no import path, so only its
   Java mirror, ReminderScheduler.sanitizeLaunchRoute, was ever tested
   directly. The two are pinned together by the shared fixture at
   src/lib/android/fixtures/launch-routes.json - a route shape accepted by
   one and rejected by the other is a tap that lands nowhere.

   This is the rule ADR-0028 used to hold, and it covers every twin of Java
   and TypeScript logic, not only this one. Java cannot import TypeScript, so
   both sides are written by hand, and one JSON file of cases is what both
   suites run (launch-routes.test.ts here, ReminderSchedulerLaunchRouteFixtureTest
   on the Java side, which build.gradle points at the same folder, so there is
   no second copy). To add a deep-linkable route, add its cases to the fixture
   first, accepted ones and rejected near-misses, then edit both allowlists.
   reminder-rule.json, check-in-rule.json and quiet-hours.json in the same
   folder follow the same pattern. */

export function isValidAndroidLaunchRoute(route: string): boolean {
  return (
    /^\/settings\/reminders(?:\/[a-z0-9-]+)?$/.test(route) ||
    // A medication reminder's notification (functional audit ticket 20).
    /^\/care\/doses\?add=1&reminder=[a-z0-9-]+$/.test(route) ||
    /^\/entry\/new\/\d+$/.test(route) ||
    // The quick-log widget's mood buttons.
    /^\/entry\/new\/today\?seedMood=[1-5]$/.test(route) ||
    // The Safe Space widget's single tap target.
    route === '/doubt' ||
    /^\/wrapped\/(?:week|month|year)$/.test(route) ||
    /^\/on-this-day(?:\?lookback=(?:month|sixMonths|year))?$/.test(route)
  );
}
