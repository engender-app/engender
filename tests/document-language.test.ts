import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { baseLocale, locales } from '../src/lib/paraglide/runtime.js';

/* The document language contract (pre-production audit U1).

   A screen reader picks up pronunciation from the lang attribute on
   <html>. The static shell must ship a valid BCP-47 tag so that even a
   browser that never runs JavaScript - or one where the layout effect
   has not mounted yet - never encounters the placeholder that was here
   before this ticket. The runtime half (the layout effect that stamps
   the resolved locale) cannot be tested in Node; the browser tier and
   a manual language switch cover it. */

const appHtml = readFileSync(
  fileURLToPath(new URL('../src/app.html', import.meta.url)),
  'utf8'
);

describe('document language', () => {
  it('ships a valid language tag, not a template placeholder', () => {
    const lang = appHtml.match(/<html[^>]*\slang="([^"]*)"/)?.[1];
    expect(lang).toBeDefined();
    expect(lang).not.toContain('%');
    expect(locales).toContain(lang);
  });

  it('falls back to the base locale', () => {
    const lang = appHtml.match(/<html[^>]*\slang="([^"]*)"/)?.[1];
    expect(lang).toBe(baseLocale);
  });
});
