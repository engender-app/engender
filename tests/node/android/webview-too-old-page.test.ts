/* The page a WebView below the floor is sent to (ADR-0023). Capacitor checks `minWebViewVersion` and, when the WebView is
   older, loads `server.errorPath` instead of the app. If that file is not in
   the bundle the person gets a blank white screen and nothing else, which is
   what shipped for two months after the page was deleted as "rubbish" while
   capacitor.config.ts still named it. webview-floor.test.ts checks the
   app's own syntax against the floor and never looked at this file.

   The page's two inline scripts are run here the way app-html-chrome.test.ts
   runs app.html's: read out of the file and executed in a sandbox holding
   only what they touch. What they leave behind is what a person on an old
   WebView sees: one language, and the app's real name only when the boot
   mirror says disguise is off. */

import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../../../capacitor.config.ts';
import { BOOT_CACHE_KEY } from '../../../src/lib/data/prefs/boot-cache.ts';

const errorPath = capacitorConfig.server?.errorPath ?? '';
const pageUrl = new URL(`../../../static/${errorPath}`, import.meta.url);

it('errorPath names a page that is in the bundle', () => {
  expect(errorPath, 'capacitor.config.ts has no server.errorPath, so an old WebView loads the app and shows a blank screen').not.toBe('');
  expect(existsSync(pageUrl), `static/${errorPath} is missing: an old WebView is sent there and shows a blank screen`).toBe(true);
});

const page = () => readFileSync(pageUrl, 'utf8');
const scripts = () => [...page().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

describe('what the page says before any script runs', () => {
  it('names no app, so a disguised journal is not given away', () => {
    const markup = page()
      .replace(/<script>[\s\S]*?<\/script>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(markup.toLowerCase()).not.toContain('engender');
  });

  it('carries both languages, each with its heading and the same three paragraphs', () => {
    for (const lang of ['en', 'pl']) {
      const section = page().match(new RegExp(`<section id="${lang}" lang="${lang}">([\\s\\S]*?)</section>`));
      expect(section, `no <section id="${lang}">`).not.toBeNull();
      expect(section![1].match(/<h1>/g)).toHaveLength(1);
      expect(section![1].match(/data-name/g)).toHaveLength(1);
      expect(section![1].match(/<p[ >]/g)).toHaveLength(3);
    }
  });

  it('uses no syntax the WebViews it exists for cannot parse', () => {
    /* Optional chaining and ?? are what Chrome 69 threw on at boot
       (testing 13: "Unexpected token ?"); this page has to run there. Only
       that blocker is pinned here, plus a parse in Node; the stylesheet is
       not checked, and the API 26 emulator is where the page was seen. */
    for (const script of scripts()) {
      expect(script).not.toMatch(/\?\.|\?\?/);
      expect(() => new Function(script)).not.toThrow();
    }
  });
});

interface Outcome {
  lang: string | undefined;
  title: string;
  names: string[];
  attributes: Record<string, string>;
}

/** Runs both scripts in order over one boot mirror, one saved app language
    and one device language, and reads back the document they leave. */
function open({
  boot,
  savedLocale = null,
  deviceLanguage = 'en-GB',
  storageThrows = false
}: {
  boot?: unknown;
  savedLocale?: string | null;
  deviceLanguage?: string;
  storageThrows?: boolean;
}): Outcome {
  const [head, body] = scripts();
  const attributes: Record<string, string> = {};
  const staticTitle = page().match(/<title>([^<]*)<\/title>/)![1];
  const names = [...page().matchAll(/<span data-name>([^<]*)<\/span>/g)].map((match) => ({ textContent: match[1] }));
  const document = {
    title: staticTitle,
    documentElement: {
      setAttribute: (name: string, value: string) => void (attributes[name] = String(value)),
      getAttribute: (name: string) => (name in attributes ? attributes[name] : null)
    },
    querySelectorAll: (selector: string) => (selector === '[data-name]' ? names : [])
  };
  const localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error('SecurityError');
      if (key === BOOT_CACHE_KEY) return boot === undefined ? null : JSON.stringify(boot);
      if (key === 'PARAGLIDE_LOCALE') return savedLocale;
      return null;
    }
  };
  const sandbox = { document, localStorage, navigator: { language: deviceLanguage }, JSON };
  runInNewContext(head, sandbox);
  runInNewContext(body, sandbox);
  return {
    lang: attributes['data-lang'],
    title: document.title,
    names: names.map((name) => name.textContent),
    attributes
  };
}

describe('what the page says once its scripts have run', () => {
  it('a first install, before any preference exists, names engender in the device language', () => {
    const shown = open({});
    expect(shown.lang).toBe('en');
    expect(shown.title).toBe('engender');
    expect(shown.names).toEqual(['engender', 'engender']);
    expect(shown.attributes['data-field']).toBe('flag');
  });

  it('a Polish phone gets Polish', () => {
    expect(open({ deviceLanguage: 'pl-PL' }).lang).toBe('pl');
    expect(open({ deviceLanguage: 'pl' }).lang).toBe('pl');
    expect(open({ deviceLanguage: 'de-DE' }).lang).toBe('en');
  });

  it("the app's own language setting wins over the phone's, the way app.html reads it", () => {
    expect(open({ savedLocale: 'pl', deviceLanguage: 'en-GB' }).lang).toBe('pl');
    expect(open({ savedLocale: 'en', deviceLanguage: 'pl-PL' }).lang).toBe('en');
  });

  it('under disguise the page says Notes or Notatki, never the real name, and paints no flag', () => {
    for (const [savedLocale, decoy] of [
      ['en', 'Notes'],
      ['pl', 'Notatki']
    ]) {
      const shown = open({ boot: { disguise: true }, savedLocale });
      expect(shown.title).toBe(decoy);
      expect(JSON.stringify(shown).toLowerCase()).not.toContain('engender');
      expect(shown.attributes['data-field']).toBeUndefined();
    }
  });

  it('with the mirror unreadable it cannot know about disguise, so it names nothing', () => {
    const shown = open({ storageThrows: true, deviceLanguage: 'pl-PL' });
    expect(shown.lang).toBe('pl');
    expect(JSON.stringify(shown).toLowerCase()).not.toContain('engender');
    expect(shown.attributes['data-field']).toBeUndefined();
  });

  it("follows the app's theme when one was chosen, and the system's otherwise", () => {
    expect(open({ boot: { theme: 'dark' } }).attributes['data-theme']).toBe('dark');
    expect(open({ boot: { theme: 'light' } }).attributes['data-theme']).toBe('light');
    expect(open({ boot: { theme: 'system' } }).attributes['data-theme']).toBeUndefined();
  });

  it('holds still when the app was told to reduce motion', () => {
    expect(open({ boot: { a11yMotionReduce: true } }).attributes['data-a11y-motion']).toBe('reduce');
    expect(open({}).attributes['data-a11y-motion']).toBeUndefined();
  });
});
