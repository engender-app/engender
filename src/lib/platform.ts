/* Web or the Android shell.

   The demo bar's phone-frame toggle used to answer this, which meant the
   answer was a review control: nothing could tell a real Android install
   from a reviewer looking at a 390px frame, and the toggle could not exist
   in a production build (ticket 05). The frame is a viewport preview now
   and nothing outside the demo module reads it.

   Capacitor injects `window.Capacitor` into the WebView it hosts, and only
   the Android build is hosted, so asking it is the honest question until
   @capacitor/core is a dependency here. A browser has no such global, and
   that is the whole test - no user-agent sniffing, which would guess wrong
   for a phone browser. */

interface CapacitorGlobal {
  getPlatform?: () => string;
}

export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.getPlatform?.() === 'android';
}
