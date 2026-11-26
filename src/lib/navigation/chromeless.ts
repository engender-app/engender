/* Onboarding, In the room and the return moment hide the tab bar and rail.
   screen-transition.ts uses the narrower set of gates, onboarding and In the
   room to decide when the app gives way to a cut. The return moment stays
   inside Today and gets its normal field transition from Home.

   In the room retains its own back control. Hiding the tab bar there prevents
   accidental exits while someone is speaking. Keep both route tables here so
   the layout and tests use the same rules. */

import { parseDayParam } from '../data/dayParam';

/**
 * Whether one navigation is a cut rather than a movement.
 *
 * `from` is null on a cold start, which has nothing to come from.
 *
 * Setup is the one route on the narrow list above whose two legs are not
 * the same question, and redesign ticket 33 is where that showed. Arriving
 * is not a navigation: there is no app yet, and the shell redirects here
 * because `prefs.onboarded` is false. Leaving is - somebody pressed "Start
 * writing" and the app opened, which is the moment the whole flow is for,
 * and rule 12 already says the sun's handover to Home is one object at one
 * size rather than two suns. Cut, it was the app's largest surface changing
 * in a single frame at the end of setup's moving steps.
 *
 * This is ticket 35's lesson one route further on: one predicate answering
 * two questions is what produced that ticket's own yank, and the fix each
 * time is another question rather than a wider answer.
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
  /* The return moment (ADR-0062) is chromeless and
     nothing more: it is a step in DIRECTION.md rule 15's sense - one
     purpose, no navigation - and its foot carries the one way off, so a bar
     over it would be both a second way and a claim that this is a place
     rather than a moment. */
  return replacesAppNavigation(path) || path === '/coming-back';
}

/** Paints no tab bar, whoever is looking at it: the chromeless routes, and a
    new entry. A new entry is a step in DIRECTION.md rule 15's sense: one purpose, one way on and one way back, so the
    bar would be four more ways off it. It stays out of `chromelessPath`
    because that answer also decides whether Today's retained doors stay
    mounted, and a new entry is where the app goes from Today most often. */
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
