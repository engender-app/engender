/* Onboarding, In the room and the return moment hide the tab bar and rail.
   screen-transition.ts uses the narrower set of gates, onboarding and In the
   room to decide when the app gives way to a cut. The return moment stays
   inside Today and gets its normal field transition from Home.

   In the room retains its own back control. Hiding the tab bar there prevents
   accidental exits while someone is speaking. Keep both route tables here so
   the layout and tests use the same rules. */

import { parseDayParam } from '../data/dayParam';

/**
 * A cold start cuts because from is null. Arrival at setup is a redirect
 * before the app opens. Leaving setup moves so its sun hands over to Home
 * at the same size. This predicate describes the transition, separately from
 * whether a route shows chrome.
 */
export function cutsInsteadOfMoving(from: string | null, to: string): boolean {
  if (from === null) return true;
  /* Setup handing over to the app, by either of its two doors: the finish's
     "Start writing" and every step's "Straight to the app" are the same
     act, and complete() is literally one function for both. */
  if (from.startsWith('/onboarding') && !to.startsWith('/onboarding')) return false;
  return replacesAppNavigation(from) || replacesAppNavigation(to);
}

/** Renders instead of the app: no chrome, and no navigation to animate. */
export function replacesAppNavigation(path: string): boolean {
  // Onboarding by prefix, since every step of it is chromeless; the room by
  // exact match, since the screens around it - appointments and the prep
  // list it is a view over - both keep their bar.
  return path.startsWith('/onboarding') || path === '/health/appointments/in-the-room';
}

/** Renders without the shell's chrome, whoever is looking at it. */
export function chromelessPath(path: string): boolean {
  /* The return step is chromeless. Its footer holds the only exit. */
  return replacesAppNavigation(path) || path === '/coming-back';
}

/** Hide the tab bar on chromeless routes and new entry. A new entry keeps
    chromelessPath false so Today's retained doors stay mounted. */
export function barlessPath(path: string, today: number = Number.MAX_SAFE_INTEGER): boolean {
  if (chromelessPath(path)) return true;
  const day = /^\/entry\/new\/([^/]+)\/?$/.exec(path)?.[1];
  /* Only a day the editor opens. Anything else is the route's unavailable
     notice, which keeps the app's chrome and Back. */
  if (day === undefined) return false;
  let value: string;
  try {
    value = decodeURIComponent(day);
  } catch {
    return false;
  }
  const epochDay = parseDayParam(value, today);
  return epochDay !== null && epochDay <= today;
}
