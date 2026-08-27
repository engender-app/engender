/* The disguised identity, at both levels it can be checked at.

   Most of this file calls the rule: `tabIdentity` and `appWordmark` are
   pure, so the cross product of the two flags that decide them is four
   cases and they are all here.

   The last test is a source grep, and deliberately one. What it guards is
   not behaviour but reach - that no surface anywhere in `src/` has written
   the decoy's name out for itself again - and there is no call that can
   answer "and nowhere else". A grep is the right instrument for a
   negative over a whole tree; it is the wrong one for everything above
   it, which is why the rest of this file stopped being greps. */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DECOY_NAME, appWordmark, tabIdentity } from './identity.ts';

describe('the wordmark a surface prints', () => {
  it('is the decoy name under disguise, whatever the app is called', () => {
    expect(appWordmark(true, 'enGender')).toBe('Notes');
    expect(appWordmark(true, 'enGender')).toBe(DECOY_NAME);
  });

  it('is the app name the caller was given otherwise', () => {
    /* The name is a parameter because it is a catalogue lookup and this
       tier may not import paraglide (ADR-0016). */
    expect(appWordmark(false, 'enGender')).toBe('enGender');
  });
});

describe('what the tab says', () => {
  const chromeIcon = 'favicon.svg';

  it('says the app name over the running app', () => {
    expect(tabIdentity({ disguised: false, blanked: false, appName: 'enGender', icon: chromeIcon })).toEqual({
      title: 'enGender',
      icon: 'favicon.svg'
    });
  });

  it('says the decoy name over the running app when disguised', () => {
    expect(
      tabIdentity({ disguised: true, blanked: false, appName: 'enGender', icon: 'favicon-notes.svg' })
    ).toEqual({
      title: 'Notes',
      icon: 'favicon-notes.svg'
    });
  });

  it('pretends to be an unused tab when quick exit blanks it', () => {
    /* Undisguised, the quick-exit face is a blank page, so the tab says
       what a blank page says - and takes the neutral icon with it, since
       an empty tab wearing the app's flag is not empty. */
    expect(tabIdentity({ disguised: false, blanked: true, appName: 'enGender', icon: chromeIcon })).toEqual({
      title: 'New tab',
      icon: 'favicon-notes.svg'
    });
  });

  it('keeps the decoy name when quick exit blanks a disguised tab', () => {
    /* Disguised, quick exit shows the decoy notes screen, so the tab says
       what the page shows rather than dropping to "New tab" and telling
       anyone watching that something was closed. */
    expect(
      tabIdentity({ disguised: true, blanked: true, appName: 'enGender', icon: 'favicon-notes.svg' })
    ).toEqual({
      title: 'Notes',
      icon: 'favicon-notes.svg'
    });
  });
});

describe('where the decoy name is allowed to appear', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));

  const sources = (dir: string): string[] =>
    readdirSync(root + dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === 'paraglide'
          ? []
          : sources(`${dir}/${entry.name}`)
        : [`${dir}/${entry.name}`]
    );

  /* Comments are stripped before the search rather than the search being
     narrowed to one quoting style: half a dozen files explain the
     disguise in prose, and a check that only caught `'Notes'` would miss
     a new surface writing "Notes" or a bare text node - which is exactly
     the surface this is here to catch. `DecoyNotes` and the rest of the
     identifiers are safe on the word boundary. */
  const withoutComments = (source: string) =>
    source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('is this module and nothing else', () => {
    /* ADR-0035 asks for the disguise check to live in one place, and the
       cost of a surface forgetting it is not cosmetic: it shows the real
       app name to whoever the person was hiding it from.

       `src/` only. The name is also in static/manifest-notes.webmanifest,
       which is the launcher entry rather than a surface and is held to the
       catalogue by tests/web-manifest.test.ts. */
    const naming = sources('src')
      .filter((path) => !path.endsWith('.test.ts'))
      /* Demo seed prose, not a surface: fullFixture writes journal
         content, and "Notes on trying out X" is an English sentence that
         happens to start with the word. */
      .filter((path) => path !== 'src/lib/data/demo/fullFixture.ts')
      .filter((path) => /\bNotes\b/.test(withoutComments(readFileSync(root + path, 'utf8'))));
    expect(naming).toEqual(['src/lib/disguise/identity.ts']);
  });

  it('is asked by every surface that says the app name out loud', () => {
    /* The other half of the check above: nobody hardcodes the decoy name,
       and these four do print a name, so they have to be getting it from
       here. The rail's wordmark is why this test exists - it was the one
       of the five sites nothing asserted at all, so a disguise that
       stopped reaching the desktop rail would have shipped green. */
    for (const path of ['src/lib/components/AppNav.svelte', 'src/routes/+page.svelte']) {
      /* The call, not its argument list: matching the arguments would fail
         a rename that kept the behaviour, which is the polarity this
         ticket exists to remove. */
      expect(readFileSync(root + path, 'utf8'), path).toContain('appWordmark(');
    }
    expect(readFileSync(root + 'src/routes/+layout.svelte', 'utf8')).toContain('tabIdentity({');
    expect(readFileSync(root + 'src/lib/components/DecoyNotes.svelte', 'utf8')).toContain('DECOY_NAME');
  });
});
