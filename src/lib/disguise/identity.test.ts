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
    expect(tabIdentity({ disguised: false, blanked: false, icon: chromeIcon })).toEqual({
      title: 'enGender',
      icon: 'favicon.svg'
    });
  });

  it('says the decoy name over the running app when disguised', () => {
    expect(tabIdentity({ disguised: true, blanked: false, icon: 'favicon-notes.svg' })).toEqual({
      title: 'Notes',
      icon: 'favicon-notes.svg'
    });
  });

  it('pretends to be an unused tab when quick exit blanks it', () => {
    /* Undisguised, the quick-exit face is a blank page, so the tab says
       what a blank page says - and takes the neutral icon with it, since
       an empty tab wearing the app's flag is not empty. */
    expect(tabIdentity({ disguised: false, blanked: true, icon: chromeIcon })).toEqual({
      title: 'New tab',
      icon: 'favicon-notes.svg'
    });
  });

  it('keeps the decoy name when quick exit blanks a disguised tab', () => {
    /* Disguised, quick exit shows the decoy notes screen, so the tab says
       what the page shows rather than dropping to "New tab" and telling
       anyone watching that something was closed. */
    expect(tabIdentity({ disguised: true, blanked: true, icon: 'favicon-notes.svg' })).toEqual({
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

  it('is this module and nothing else', () => {
    /* ADR-0035 asks for the disguise check to live in one place, and the
       cost of a surface forgetting it is not cosmetic: it shows the real
       app name to whoever the person was hiding it from. The literal is
       quoted, so the prose above it that names the disguise in double
       quotes is not a hit, and the tests above name it on purpose. */
    const naming = sources('src')
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => readFileSync(root + path, 'utf8').includes("'Notes'"));
    expect(naming).toEqual(['src/lib/disguise/identity.ts']);
  });
});
