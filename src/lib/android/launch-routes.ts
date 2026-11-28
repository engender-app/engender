/* Keep the TypeScript launch-route allowlist in step with
   `ReminderScheduler.sanitizeLaunchRoute` so taps land in both runtimes. Both suites read
   `fixtures/launch-routes.json`. Add accepted cases and rejected near-misses before
   changing both lists. Reminder rules, check-in and quiet hours use the same shared-fixture
   pattern. */

export function isValidAndroidLaunchRoute(route: string): boolean {
  return (
    /^\/settings\/reminders(?:\/[a-z0-9-]+)?$/.test(route) ||
    // A medication reminder's notification.
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
