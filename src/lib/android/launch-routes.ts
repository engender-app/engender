/* Extracted from +layout.svelte for the same reason as back-navigation.ts:
   a pure function trapped in the component had no import path, so only its
   Java mirror, ReminderScheduler.sanitizeLaunchRoute, was ever tested
   directly. The two are pinned together by the shared fixture at
   src/lib/android/fixtures/launch-routes.json - a route shape accepted by
   one and rejected by the other is a tap that lands nowhere. */

export function isValidAndroidLaunchRoute(route: string): boolean {
  return (
    /^\/settings\/reminders(?:\/[a-z0-9-]+)?$/.test(route) ||
    /^\/entry\/new\/\d+$/.test(route) ||
    // The quick-log widget's mood buttons.
    /^\/entry\/new\/today\?seedMood=[1-5]$/.test(route) ||
    // The tally widget's two buttons.
    /^\/\?tally=(?:misgendered|correctly_gendered)$/.test(route) ||
    // The doubt-entry widget's single tap target.
    route === '/doubt' ||
    /^\/wrapped\/(?:week|month|year)$/.test(route) ||
    /^\/on-this-day(?:\?lookback=(?:month|sixMonths|year))?$/.test(route)
  );
}
