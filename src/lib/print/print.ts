/* Opening the print dialog, on either platform (phase 5 ticket 17).

   `window.print()` is a Chrome method, not a WebView one. On the Android
   build it returns without printing and without failing, so both printing
   screens had a button that did nothing there - the clinician visit summary
   since phase 4, silently. Android's own print stack is reachable only from
   Java, which is what print/android-bridge.ts and PrintPlugin.java are for.

   Both paths print the same document: the plugin hands Android the live
   WebView, so the `@media print` rules decide the page in exactly the way
   they do on the web. Neither path renders anything twice, and neither one
   learns what the person did with the dialog - a print job's outcome is not
   something either platform reports back, and nothing here needs it. */

import { isAndroid } from '$lib/platform';
import { androidPrint } from './android-bridge';

/** Opens the platform's print dialog for the page as it stands.
    `jobName` names the job in Android's dialog and the file a Save as PDF
    produces; the web ignores it, since a browser names the job after the
    document title. */
export async function printCurrentPage(jobName: string): Promise<void> {
  if (!isAndroid()) {
    window.print();
    return;
  }
  await androidPrint.print({ jobName });
}
