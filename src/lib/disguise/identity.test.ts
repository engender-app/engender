/* The disguised identity, at both levels it can be checked at.

   Most of this file calls the rule: `tabIdentity` and `appWordmark` are
   pure, so the disguise preference decides the two
   cases below.

   The last test is a source grep, and deliberately one. What it guards is
   not behaviour but reach - that no surface anywhere in `src/` has written
   the decoy's name out for itself again - and there is no call that can
   answer "and nowhere else". A grep is the right instrument for a
   negative over a whole tree; it is the wrong one for everything above
   it, which is why the rest of this file stopped being greps. */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { appWordmark, tabIdentity } from './identity.ts';

describe('the wordmark a surface prints', () => {
  it('is the decoy name under disguise, whatever the app is called', () => {
    expect(appWordmark(true, 'engender', 'Notes')).toBe('Notes');
    expect(appWordmark(true, 'engender', 'Notatki')).toBe('Notatki');
  });

  it('is the app name the caller was given otherwise', () => {
    /* The name is a parameter because it is a catalogue lookup and this tier may not import
       paraglide. */
    expect(appWordmark(false, 'engender', 'Notatki')).toBe('engender');
  });
});

describe('what the tab says', () => {
  const chromeIcon = 'favicon-trans.svg';

  it('says the app name over the running app', () => {
    expect(tabIdentity({ disguised: false, appName: 'engender', decoyName: 'Notes', icon: chromeIcon })).toEqual({
      title: 'engender',
      icon: 'favicon-trans.svg'
    });
  });

  it('says the decoy name over the running app when disguised', () => {
    expect(
      tabIdentity({ disguised: true, appName: 'engender', decoyName: 'Notes', icon: 'favicon-notes.svg' })
    ).toEqual({
      title: 'Notes',
      icon: 'favicon-notes.svg'
    });
  });
});

describe('the Recents preview', () => {
  /* hid the Recents card under disguise by making the whole window secure, which also
     refused screenshots with the capture switch on. Disguise now hides only the card; the
     window flag follows the capture choice. Both are decided natively before the first
     frame, so the read has to be the native one: the live launcher alias, the same read the
     widgets and notifications make. CaptureDecisionTest holds the decision,
     DisguiseCaptureTest the window. */
  const java = (path: string) =>
    readFileSync(fileURLToPath(new URL(`../../../android/app/src/main/java/dev/engender/app/${path}`, import.meta.url)), 'utf8');

  it('is hidden while the launcher is disguised, and the window stays capturable', () => {
    const plugin = java('screencapture/ScreenCapturePlugin.java');
    expect(plugin).toMatch(/recentsPreviewShown\(boolean allowed, boolean disguised\)\s*\{\s*return allowed && !disguised;/);
    expect(plugin).toMatch(/windowSecure\(int sdk, boolean allowed, boolean disguised\)\s*\{\s*return !allowed \|\| \(disguised && sdk < Build\.VERSION_CODES\.TIRAMISU\);/);
  });

  it('is named in the disguise sheet, beside the preview that follows the setting', () => {
    const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');
    expect(source('src/lib/components/DisguiseSetting.svelte')).toContain('<DisguisePreview on={disguiseAnswer ?? prefs.disguise} />');
    expect(source('src/lib/components/DisguisePreview.svelte')).toContain('m.disguise_android_gap_note()');
    for (const locale of ['en', 'pl']) {
      const note = (JSON.parse(source(`messages/${locale}.json`)) as Record<string, string>).disguise_android_gap_note;
      expect(note, locale).toMatch(locale === 'en' ? /Recents/ : /w używanych aplikacjach/);
    }
  });

  it('is decided by those reads on create, on return and on a change', () => {
    const main = java('MainActivity.java');
    expect(main.match(/ScreenCapturePlugin\.applyWindowFlags\(this\)/g)).toHaveLength(2);
    expect(main).not.toMatch(/ScreenCapturePlugin\.isAllowed\(/);
    expect(java('screencapture/ScreenCapturePlugin.java')).toMatch(/applyWindowFlags\(activity\)/);
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
     the surface this is here to catch. Identifiers are safe on the word boundary. */
  const withoutComments = (source: string) =>
    source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('is supplied by catalogues after the pre-paint script', () => {
    /* Keep the disguise check in identity.ts (ADR-0101). The
       cost of a surface forgetting it is not cosmetic: it shows the real
       app name to whoever the person was hiding it from.

       `src/` only. The name is also in static/manifest-notes.webmanifest,
       which is the launcher entry rather than a surface and is held to the
       catalogue by tests/node/ui/web-manifest.test.ts. */
    const naming = sources('src')
      .filter((path) => !path.endsWith('.test.ts'))
      /* Demo seed prose, not a surface: fullFixture writes journal
         content, and "Notes on trying out X" is an English sentence that
         happens to start with the word. */
      .filter((path) => path !== 'src/lib/data/demo/fullFixture.ts')
      .filter((path) => /\bNotes\b/.test(withoutComments(readFileSync(root + path, 'utf8'))));
    expect(naming).toEqual(['src/app.html']);
  });

  it('is asked by every surface that says the app name out loud', () => {
    /* The other half of the check above: nobody hardcodes the decoy name, and the outside
       surfaces do print a name, so they have to be getting it from here. removed the in-app
       reads (AppNav, the home hero), so only surfaces a person can see before unlocking, or
       on paper, remain: a disguise that stopped reaching a lock screen would show the real
       name to the person it was hiding from, and ship green. */
    for (const path of [
      'src/lib/components/PrintLetterhead.svelte',
      'src/lib/components/JournalGate.svelte',
      'src/lib/components/AndroidKeyGate.svelte',
      'src/lib/components/SessionUnlock.svelte'
    ]) {
      /* The call, not its argument list: matching the arguments would fail
         a rename that kept the behaviour. */
      expect(readFileSync(root + path, 'utf8'), path).toContain('appWordmark(');
    }
    expect(readFileSync(root + 'src/routes/+layout.svelte', 'utf8')).toContain('tabIdentity({');
  });

  it('keeps the printed letterhead behind its disguise branch', () => {
    /* PrintLetterhead is the one outside surface that is absent rather
       than renamed under disguise. */
    expect(readFileSync(root + 'src/lib/components/PrintLetterhead.svelte', 'utf8')).toMatch(
      /\{#if !prefs\.disguise\}/
    );
  });
});

describe('catalogued app names', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.name === 'paraglide' ? [] : entry.isDirectory() ? files(`${dir}/${entry.name}`)
      : /\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [`${dir}/${entry.name}`] : []);
  const sources = files(`${root}src`).map(path => ({ path, text: readFileSync(path, 'utf8') }));

  /* Unlocked screens print the plain name since (the in-app disguise reads are gone); these
     are the only files allowed to. Any other file, a gate or a printed page included, goes
     through appWordmark or tabIdentity. */
  const inApp = new Set([
    `${root}src/lib/components/AppNav.svelte`,
    `${root}src/lib/components/PermissionList.svelte`,
    `${root}src/lib/data/vocabulary/archiveErrorLabels.ts`,
    `${root}src/routes/+page.svelte`,
    `${root}src/routes/settings/+page.svelte`
  ]);

  it('routes every direct app-name lookup through the identity helpers', () => {
    for (const { path, text } of sources) {
      if (inApp.has(path)) continue;
      let remaining = text.replace(/<!--[^]*?-->|\/\*[^]*?\*\//g, '')
        .replace(/appWordmark\(prefs\.disguise, m\.app_name\(\), m\.disguise_name\(\)\)/g, '');
      if (path.endsWith('/src/routes/+layout.svelte')) {
        remaining = remaining.replace(/tabIdentity\(\{[^]*?\}\)/g, '');
      }
      expect(remaining, path).not.toMatch(/m\.app_name\b/);
    }
  });

  for (const locale of ['en', 'pl']) {
    const catalogue = JSON.parse(readFileSync(`${root}messages/${locale}.json`, 'utf8')) as Record<string, string>;
    it(`${locale}: only the identity entry contains the literal app name`, () => {
      expect(Object.keys(catalogue).filter(key => /engender/i.test(catalogue[key]))).toEqual(['app_name']);
    });

    it(`${locale}: every named sentence receives the wordmark at its call site`, () => {
      const keys = Object.keys(catalogue).filter(key => catalogue[key].includes('{appName}'));
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const uses = sources.flatMap(({ path, text }) => [...text.matchAll(new RegExp(`m\\.${key}\\b`, 'g'))]
          .map(match => ({ path, call: text.slice(match.index) })));
        expect(uses.length, key).toBeGreaterThan(0);
        for (const { path, call } of uses) {
          expect(call, `${path}: ${key}`).toMatch(/^m\.\w+\(\{\s*appName:\s*(?:appWordmark\(prefs\.disguise, m\.app_name\(\), m\.disguise_name\(\)\)|m\.app_name\(\))/);
        }
      }
    });
  }
});
