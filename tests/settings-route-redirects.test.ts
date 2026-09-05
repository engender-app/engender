/* Phase 8 features ticket 33 (ADR-0036): the 23 hub-row route bases moved
   off /settings/<slug> onto their HubGroupKey-named address, and each old
   address got a redirect stub so a stale bookmark still lands one call
   away. This is the registry those stubs are checked against - a stub
   with the wrong target, or a missing stub, fails a assertion here rather
   than only showing up as a 404 someone hits by accident.

   Node tier, no driver: `redirect()` throws rather than returning, so a
   stub's `load()` is called directly and the thrown redirect is read
   apart - no browser, no server, the same discipline liveTiles.ts's tests
   already use for a pure function. */

import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

const REDIRECTS: [string, () => unknown, string][] = [
  ['settings/measurements', () => import('../src/routes/settings/measurements/+page.ts'), '/body/measurements'],
  ['settings/sizes', () => import('../src/routes/settings/sizes/+page.ts'), '/body/sizes'],
  ['settings/hair-progress', () => import('../src/routes/settings/hair-progress/+page.ts'), '/body/hair-progress'],
  ['settings/hair-removal', () => import('../src/routes/settings/hair-removal/+page.ts'), '/body/hair-removal'],
  ['settings/cycle-events', () => import('../src/routes/settings/cycle-events/+page.ts'), '/health/cycle-events'],
  ['settings/side-effects', () => import('../src/routes/settings/side-effects/+page.ts'), '/health/side-effects'],
  ['settings/surgery', () => import('../src/routes/settings/surgery/+page.ts'), '/health/surgery'],
  ['settings/dilation', () => import('../src/routes/settings/dilation/+page.ts'), '/health/dilation'],
  [
    'settings/appointment-prep',
    () => import('../src/routes/settings/appointment-prep/+page.ts'),
    '/health/appointment-prep'
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
  [
    'settings/presentations',
    () => import('../src/routes/settings/presentations/+page.ts'),
    '/transition/presentations'
  ],
  ['settings/eras', () => import('../src/routes/settings/eras/+page.ts'), '/transition/eras'],
  ['settings/words', () => import('../src/routes/settings/words/+page.ts'), '/transition/words'],
  ['settings/voice', () => import('../src/routes/settings/voice/+page.ts'), '/practice/voice?tab=record'],
  [
    'settings/entry-templates',
    () => import('../src/routes/settings/entry-templates/+page.ts'),
    '/practice/entry-templates'
  ],
  ['settings/wear', () => import('../src/routes/settings/wear/+page.ts'), '/practice/wear'],
  [
    'settings/personal-effects',
    () => import('../src/routes/settings/personal-effects/+page.ts'),
    '/practice/personal-effects'
  ],
  ['settings/resources', () => import('../src/routes/settings/resources/+page.ts'), '/practice/resources'],
  ['settings/photos', () => import('../src/routes/settings/photos/+page.ts'), '/media/photos'],
  ['settings/voice/memos', () => import('../src/routes/settings/voice/memos/+page.ts'), '/media/voice/memos'],
  ['settings/voice/metrics', () => import('../src/routes/settings/voice/metrics/+page.ts'), '/practice/voice/metrics']
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
