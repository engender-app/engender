/* Reminders ring only on Android, so a browser has no screen for them: a
   deep link, a search result from an older build, the back stack or the demo
   bar's address all land on Settings. Stored reminders stay in the journal
   and ring once it is on Android. The app is a static SPA (ssr = false), so
   this runs in the browser and isAndroid() can be asked. */
import { redirect } from '@sveltejs/kit';
import { isAndroid } from '$lib/platform';

export function load() {
  if (!isAndroid()) redirect(307, '/settings');
}
