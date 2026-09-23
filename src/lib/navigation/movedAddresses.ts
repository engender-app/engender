/* Audit item A3 (ADR-0036, ADR-0043): every address a screen used to live
   at keeps answering after the screen moves, one redirect away. The map
   from old address to new used to exist twice - once as 52 near-identical
   +page.ts stubs and once again in the redirect test's own prose - so a
   moved screen meant editing both. This is the one place it lives now;
   each stub re-exports `load` from here and the test walks this table
   instead of restating it. */
import { redirect } from '@sveltejs/kit';

type MovedEvent = {
  params: Record<string, string>;
  url: URL;
  route: { id: string | null };
};

export type MovedTarget = string | ((event: MovedEvent) => string);

export const MOVED_ADDRESSES: Record<string, MovedTarget> = {
  '/body/sizes': '/body/measurements',
  '/doses': '/care/doses',
  '/doubt/moments': '/transition/letters',
  '/doubt/readings': '/stats',
  '/health/appointment-prep': '/health/appointments',
  '/health/side-effects': '/care/changes',
  '/media/voice/memos': '/voice?tab=recordings',
  '/practice/entry-templates': '/settings/entry-templates',
  '/practice/personal-effects': '/care/changes',
  '/practice/resources': '/support/resources',
  '/practice/voice/metrics': '/voice?metric=pitch',
  '/practice/wear': '/body/wear',
  '/search/questions': '/search?questions=1',
  '/search/starred': '/search?starred=1',
  '/settings/appointment-prep': '/health/appointments',
  '/settings/clinician-summary': '/health/clinician-summary',
  '/settings/cycle-events': '/health/cycle-events',
  '/settings/dilation': '/health/dilation',
  '/settings/entry-templates': '/settings?raise=templates',
  '/settings/exposure': '/care',
  '/settings/hair-progress': '/body/hair-progress',
  '/settings/hair-removal': '/body/hair-removal',
  '/settings/hormone-curve': '/care/curve',
  '/settings/journey-anchor': '/transition/milestones',
  '/settings/labs': '/care/labs',
  '/settings/letters': '/transition/letters',
  '/settings/live-tiles': '/settings/notifications',
  '/settings/measurements': '/body/measurements',
  '/settings/milestones': '/transition/milestones',
  '/settings/personal-effects': '/care/changes',
  '/settings/photos': '/media/photos',
  '/settings/photos/export': '/media/photos/export',
  '/settings/presentations': '/settings?raise=modes',
  '/settings/regimen': '/care/regimen',
  '/settings/resources': '/support/resources',
  '/settings/roadmap': '/transition/roadmap',
  '/settings/side-effects': '/care/changes',
  '/settings/sizes': '/body/measurements',
  '/settings/stock': '/care',
  '/settings/surgery': '/health/surgery',
  '/settings/tryouts': '/transition/tryouts',
  '/settings/voice': '/voice?tab=record',
  '/settings/voice/memos': '/voice?tab=recordings',
  '/settings/voice/metrics': '/voice?metric=pitch',
  '/settings/wear': '/body/wear',
  '/timeline': '/transition/milestones',
  '/transition/eras': '/settings/eras',
  '/transition/presentations': '/settings/presentations',
  '/transition/words': '/stats',
  /* Id-preserving: the parent screen moved, a deep link to one of its
     items keeps the id rather than landing on the list. */
  '/settings/letters/[id]': (event) => `/transition/letters/${event.params.id}`,
  '/settings/tryouts/[id]': (event) => `/transition/tryouts/${event.params.id}`,
  /* All-four-doors ticket 21: the only stub whose own query string is the
     thing worth keeping, since it is what picked the tab or sheet. */
  '/practice/voice': (event) => `/voice${event.url.search}`
};

export function load(event: MovedEvent) {
  const target = MOVED_ADDRESSES[event.route.id ?? ''];
  if (target === undefined) {
    throw new Error(`movedAddresses: no row for route ${event.route.id}`);
  }
  redirect(307, typeof target === 'string' ? target : target(event));
}
