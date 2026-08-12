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
