/* The install contract (ticket 03). A manifest is inert data, so nothing at
   runtime fails loudly when a field goes missing - the app simply stops
   being installable, or installs with a stale colour or a shortcut that
   404s. These assertions are the parts of it that have to stay true, read
   off the file the build copies verbatim into the release.

   What Chromium itself makes of the file is checked where a browser is
   available: tests/browser-tier/verify-build.mjs asks it whether the built
   app is installable. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const exists = (path: string) => existsSync(fileURLToPath(new URL(path, root)));

const manifest = JSON.parse(read('static/manifest.webmanifest'));
const disguised = JSON.parse(read('static/manifest-notes.webmanifest'));

describe('the web app manifest', () => {
  it('names the app and installs it as a standalone window', () => {
    expect(manifest.name).toBe('Gender Diary');
    expect(manifest.short_name).toBe('Gender Diary');
    // Not 'browser': a display mode of 'browser' is the one value that makes
    // Chromium refuse to install the app at all.
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('carries the theme colours the app paints its own first frame with', () => {
    /* app.html stamps a theme-color before any module parses, and the layout
       replaces it with the live palette's background once preferences load.
       The manifest is what the OS paints around the window and on the splash
       screen before either runs, so it has to agree with that first frame or
       an install flashes a colour the app never uses. */
    const firstFrame = read('src/app.html').match(/name="theme-color" content="(#[0-9A-Fa-f]{6})"/);
    expect(firstFrame).not.toBeNull();
    expect(manifest.theme_color).toBe(firstFrame![1]);
    expect(manifest.background_color).toBe(firstFrame![1]);
  });

  it('points at local icons that are in the repository', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      expect(exists(`static${icon.src}`)).toBe(true);
    }
  });

  it('offers a maskable icon as well as a plain one', () => {
    // Without a maskable icon, Android crops the plain one into whatever
    // shape the launcher uses and clips the flag's outer stripes.
    const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose ?? 'any');
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  it('exposes New entry as a shortcut into a route that exists', () => {
    expect(manifest.shortcuts).toHaveLength(1);
    const [shortcut] = manifest.shortcuts;
    expect(shortcut.name).toBe('New entry');
    expect(shortcut.url).toBe('/entry/new/today');
    // The route reads 'today' as a day parameter, so a long-press shortcut
    // opens the editor on the current epoch day without a date in the URL.
    expect(exists('src/routes/entry/new/[day]/+page.svelte')).toBe(true);
    expect(read('src/routes/entry/new/[day]/+page.svelte')).toContain("=== 'today'");
  });
});

/* The disguised install (ticket 25, F24). An installed app has no tab strip,
   so this file is the whole disguise there: whatever it says is what the
   launcher, the window switcher and the install prompt say. */
describe('the disguised manifest', () => {
  it('says nothing about a journal, a transition or this app', () => {
    const words = /gender|diary|transition|journal|trans|entry|entries|mood|hrt/i;
    for (const [field, value] of Object.entries(disguised)) {
      if (typeof value === 'string') expect(value, field).not.toMatch(words);
    }
    expect(disguised.name).toBe('Notes');
    expect(disguised.short_name).toBe('Notes');
    // No shortcuts at all rather than renamed ones: a long-press menu is one
    // more surface to keep neutral, and the disguise loses nothing without it.
    expect(disguised.shortcuts).toBeUndefined();
  });

  it('is the same app renamed, not a second app to install', () => {
    /* id, start_url and scope are what a browser matches an install against.
       Diverge on any of them and a disguised visit offers a fresh install
       next to the one already on the device, which is the opposite of the
       point: two apps where there was one, and one of them still named. */
    for (const key of ['id', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) {
      expect(disguised[key], key).toBe(manifest[key]);
    }
  });

  it('carries its own icons, in the repository, for both purposes', () => {
    expect(disguised.icons.length).toBe(manifest.icons.length);
    for (const icon of disguised.icons) {
      expect(icon.src).not.toBe('/icons/icon.svg');
      expect(exists(`static${icon.src}`)).toBe(true);
      // A flag left in the disguised icon would defeat the whole file.
      expect(read(`static${icon.src}`)).not.toContain('#5BCEFA');
    }
    const purposes = disguised.icons.map((icon: { purpose?: string }) => icon.purpose ?? 'any');
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  it('is what the document points at while disguised, from before first paint', () => {
    const appHtml = read('src/app.html');
    const manifestLink = '<link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest" />';
    const manifestLinkAt = appHtml.indexOf(manifestLink);
    const scriptAt = appHtml.indexOf('<script>');

    /* The head script only wins the race if the parser has already created
       the manifest link by the time the script runs. Move the link below the
       script and this test fails even though both files still name the
       neutral manifest somewhere. */
    expect(manifestLinkAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeGreaterThan(-1);
    expect(manifestLinkAt).toBeLessThan(scriptAt);
    expect(appHtml).toContain("const manifest = document.querySelector('link[rel=\"manifest\"]');");
    expect(appHtml).toContain(
      "manifest.href = manifest.href.replace('manifest.webmanifest', 'manifest-notes.webmanifest');"
    );

    // app.html swaps it before first paint; the layout keeps it in step when
    // the toggle moves after boot.
    expect(read('src/routes/+layout.svelte')).toContain("prefs.disguise ? 'manifest-notes.webmanifest' : 'manifest.webmanifest'");
  });
});
