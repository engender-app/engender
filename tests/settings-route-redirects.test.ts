/* Phase 8 features ticket 33 (ADR-0036): the 23 hub-row route bases moved
   off /settings/<slug> onto their HubGroupKey-named address, and each old
   address got a redirect stub so a stale bookmark still lands one call
   away. This is the registry those stubs are checked against - a stub
   with the wrong target, or a missing stub, fails a assertion here rather
   than only showing up as a 404 someone hits by accident.

   Redesign ticket 43 adds one that never lived under /settings at all:
   `/timeline` stopped being a screen when its rail moved onto the
   milestones screen, and the address it was linked from keeps working the
   same way. Same rule, same shape of stub, so it is checked here rather
   than in a file of its own.

   Redesign ticket 61 adds `/body/sizes`, and repoints `/settings/sizes` at
   the merged screen rather than at that new stub: the size log and the
   measurements screen became one screen, and ADR-0036's promise is that a
   stale bookmark lands one call away, not two.

   Redesign ticket 51 (ADR-0084) runs two of ADR-0036's own stubs backwards:
   modes and entry templates are reference areas, and both moved onto
   Settings rather than off it. The old /settings/presentations and
   /settings/entry-templates stubs are gone - those are the real screens
   now - and /transition/presentations and /practice/entry-templates carry
   the stub instead, pointing back in.

   Redesign ticket 62 does the same to the third of them, and one step
   further: /transition/words is not a screen at all any more, since the
   reading it held draws on the Look back door, so its stub points at
   /stats. Its ignore list stayed behind as a reference area, which is the
   real screen at /settings/words now, so that stub is gone too.

   Phase 11 ticket 15 adds two more that never lived under /settings either:
   /doubt/moments and /doubt/readings, folded into /transition/letters and
   /stats. Same rule, same shape of stub.

   Phase 11 ticket 04 brings in the last one that was doing this by hand.
   Deepening ticket 09 had merged the live-tiles screen into
   /settings/notifications and left a client-side `replaceRoute` in a
   `+page.svelte` behind it, which is a redirect no assertion here could
   see. It is an ordinary stub now, so the address is held to the same rule
   as the other twenty-seven.

   Phase 11 ticket 09 (ADR-0084) moves the medication module the same way:
   regimen, labs and the hormone curve get their own `/care/*` address, the
   stock editor's old screen and the deleted exposure screen both redirect
   to `/care` itself rather than to a stub for something that no longer
   exists, and `/doses` joins the dose log under `/care/doses` too.

   Phase 11 all-four-doors ticket 13 adds `health/side-effects`, on the same
   pattern ticket 61 set for `body/sizes`: side effects merged onto
   /practice/personal-effects rather than moving to a screen of their own,
   so the old screen's address is a stub now, and `settings/side-effects`
   is repointed at the merged screen directly rather than at that stub -
   one hop, not two.

   Phase 11 ticket 16 (ADR-0084) runs the same reversal as ticket 51's two:
   eras is a reference area, so it moves onto Settings rather than off it.
   The `settings/eras` entry above is gone - that is the real screen now -
   and `transition/eras` carries the stub instead, pointing back in.

   Phase 11 ticket 17 folds the memo browser and the metric reference into
   the voice screen's own Recordings tab and its own sheet: `media/voice/
   memos` and `practice/voice/metrics` both join this table as stubs for
   addresses that used to be real screens, and `settings/voice/memos` and
   `settings/voice/metrics` are repointed straight at the final
   destinations rather than at the other two stubs - one hop, not two,
   ticket 61's own rule.

   Node tier, no driver: `redirect()` throws rather than returning, so a
   stub's `load()` is called directly and the thrown redirect is read
   apart - no browser, no server, the same discipline liveTiles.ts's tests
   already use for a pure function. */

import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

const REDIRECTS: [string, () => unknown, string][] = [
  /* Ticket 09 (ADR-0084): the medication module moves off Settings and off
     /doses onto Care's own address - the five old addresses, and /doses
     itself, are the six this ticket's stubs cover. */
  ['settings/regimen', () => import('../src/routes/settings/regimen/+page.ts'), '/care/regimen'],
  ['settings/labs', () => import('../src/routes/settings/labs/+page.ts'), '/care/labs'],
  ['settings/hormone-curve', () => import('../src/routes/settings/hormone-curve/+page.ts'), '/care/curve'],
  ['settings/stock', () => import('../src/routes/settings/stock/+page.ts'), '/care'],
  ['settings/exposure', () => import('../src/routes/settings/exposure/+page.ts'), '/care'],
  ['doses', () => import('../src/routes/doses/+page.ts'), '/care/doses'],
  ['settings/measurements', () => import('../src/routes/settings/measurements/+page.ts'), '/body/measurements'],
  ['settings/sizes', () => import('../src/routes/settings/sizes/+page.ts'), '/body/measurements'],
  ['body/sizes', () => import('../src/routes/body/sizes/+page.ts'), '/body/measurements'],
  ['settings/hair-progress', () => import('../src/routes/settings/hair-progress/+page.ts'), '/body/hair-progress'],
  ['settings/hair-removal', () => import('../src/routes/settings/hair-removal/+page.ts'), '/body/hair-removal'],
  ['settings/cycle-events', () => import('../src/routes/settings/cycle-events/+page.ts'), '/health/cycle-events'],
  [
    'settings/side-effects',
    () => import('../src/routes/settings/side-effects/+page.ts'),
    '/practice/personal-effects'
  ],
  [
    'health/side-effects',
    () => import('../src/routes/health/side-effects/+page.ts'),
    '/practice/personal-effects'
  ],
  ['settings/surgery', () => import('../src/routes/settings/surgery/+page.ts'), '/health/surgery'],
  ['settings/dilation', () => import('../src/routes/settings/dilation/+page.ts'), '/health/dilation'],
  /* Phase 11 all-four-doors ticket 12 (ADR-0066): the prep list is a section
     of the visit screen now rather than a screen beside it, so its own
     address is a stub. `settings/appointment-prep` is repointed at the visit
     screen directly rather than at that stub, the same one-hop rule ticket 61
     set for `body/sizes`. */
  [
    'settings/appointment-prep',
    () => import('../src/routes/settings/appointment-prep/+page.ts'),
    '/health/appointments'
  ],
  [
    'health/appointment-prep',
    () => import('../src/routes/health/appointment-prep/+page.ts'),
    '/health/appointments'
  ],
  [
    'settings/clinician-summary',
    () => import('../src/routes/settings/clinician-summary/+page.ts'),
    '/health/clinician-summary'
  ],
  ['settings/milestones', () => import('../src/routes/settings/milestones/+page.ts'), '/transition/milestones'],
  ['settings/roadmap', () => import('../src/routes/settings/roadmap/+page.ts'), '/transition/roadmap'],
  ['settings/letters', () => import('../src/routes/settings/letters/+page.ts'), '/transition/letters'],
  ['settings/tryouts', () => import('../src/routes/settings/tryouts/+page.ts'), '/transition/tryouts'],
  ['settings/voice', () => import('../src/routes/settings/voice/+page.ts'), '/practice/voice?tab=record'],
  ['settings/wear', () => import('../src/routes/settings/wear/+page.ts'), '/practice/wear'],
  [
    'settings/personal-effects',
    () => import('../src/routes/settings/personal-effects/+page.ts'),
    '/practice/personal-effects'
  ],
  ['settings/resources', () => import('../src/routes/settings/resources/+page.ts'), '/practice/resources'],
  ['settings/photos', () => import('../src/routes/settings/photos/+page.ts'), '/media/photos'],
  [
    'settings/voice/memos',
    () => import('../src/routes/settings/voice/memos/+page.ts'),
    '/practice/voice?tab=recordings'
  ],
  [
    'media/voice/memos',
    () => import('../src/routes/media/voice/memos/+page.ts'),
    '/practice/voice?tab=recordings'
  ],
  [
    'settings/voice/metrics',
    () => import('../src/routes/settings/voice/metrics/+page.ts'),
    '/practice/voice?metric=pitch'
  ],
  [
    'practice/voice/metrics',
    () => import('../src/routes/practice/voice/metrics/+page.ts'),
    '/practice/voice?metric=pitch'
  ],
  ['timeline', () => import('../src/routes/timeline/+page.ts'), '/transition/milestones'],
  [
    'transition/presentations',
    () => import('../src/routes/transition/presentations/+page.ts'),
    '/settings/presentations'
  ],
  [
    'practice/entry-templates',
    () => import('../src/routes/practice/entry-templates/+page.ts'),
    '/settings/entry-templates'
  ],
  ['transition/words', () => import('../src/routes/transition/words/+page.ts'), '/stats'],
  ['transition/eras', () => import('../src/routes/transition/eras/+page.ts'), '/settings/eras'],
  ['settings/live-tiles', () => import('../src/routes/settings/live-tiles/+page.ts'), '/settings/notifications'],
  /* Phase 11 ticket 15: two of Safe space's ways down stopped being screens
     of their own. "Letters and photos" was showing the same unlocked letters
     the letters screen shows in its Open section, one door apart, and the
     readings were a Look back page sitting on the Safe space door. Same rule
     as every stub above - a bookmark, a shared link or a person who typed
     the address lands one call away from what they were reaching for. The
     rows on `/doubt` itself do not come through here: they point straight at
     the destination (safeSpaceWays.test.ts holds that). */
  ['doubt/moments', () => import('../src/routes/doubt/moments/+page.ts'), '/transition/letters'],
  ['doubt/readings', () => import('../src/routes/doubt/readings/+page.ts'), '/stats'],
  /* Phase 11 all-four-doors ticket 18: the starred shelf and the saved-
     questions list both stopped being screens of their own and became
     search's own opening state / filter sheet - the query string carries
     which one a stale link meant. */
  ['search/starred', () => import('../src/routes/search/starred/+page.ts'), '/search?starred=1'],
  ['search/questions', () => import('../src/routes/search/questions/+page.ts'), '/search?questions=1']
];

describe('every moved route keeps a 307 redirect at its old address', () => {
  it.each(REDIRECTS)('%s redirects to %s', async (_route, importStub, target) => {
    const mod = (await importStub()) as { load: (event?: unknown) => unknown };
    try {
      mod.load();
      expect.fail('load() did not redirect');
    } catch (e) {
      if (!isRedirect(e)) throw e;
      expect(e.status).toBe(307);
      expect(e.location).toBe(target);
    }
  });

  it('a letter deep link keeps its id', async () => {
    const mod = (await import('../src/routes/settings/letters/[id]/+page.ts')) as {
      load: (event: { params: { id: string } }) => unknown;
    };
    try {
      mod.load({ params: { id: 'abc-123' } });
      expect.fail('load() did not redirect');
    } catch (e) {
      if (!isRedirect(e)) throw e;
      expect(e.status).toBe(307);
      expect(e.location).toBe('/transition/letters/abc-123');
    }
  });

  it('a tryout deep link keeps its id', async () => {
    const mod = (await import('../src/routes/settings/tryouts/[id]/+page.ts')) as {
      load: (event: { params: { id: string } }) => unknown;
    };
    try {
      mod.load({ params: { id: 't-9' } });
      expect.fail('load() did not redirect');
    } catch (e) {
      if (!isRedirect(e)) throw e;
      expect(e.status).toBe(307);
      expect(e.location).toBe('/transition/tryouts/t-9');
    }
  });

  it('the photo export deep link', async () => {
    const mod = (await import('../src/routes/settings/photos/export/+page.ts')) as { load: () => unknown };
    try {
      mod.load();
      expect.fail('load() did not redirect');
    } catch (e) {
      if (!isRedirect(e)) throw e;
      expect(e.status).toBe(307);
      expect(e.location).toBe('/media/photos/export');
    }
  });
});
