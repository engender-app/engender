/* Ticket 32's second acceptance criterion, and the only one a person cannot
   check by looking at the screen: opening the resource directory, and
   interacting inside it, makes no network request of any kind.

   The whole app already holds that line - `connect-src 'self'` in
   deploy/nginx/journal-headers.conf, and the About sheet says so in
   m.about_no_network_title(). What is new here is a screen whose content is
   phone numbers and web addresses, which is exactly the shape that invites
   someone to make it fetch a live copy, embed an org's logo, or check whether
   a line is still up. This test is what stops that arriving unnoticed.

   It reads sources rather than driving a browser because the Node tier has no
   browser (vitest.config.ts). A source grep is a weak test in general -
   tests/android-back-navigation-wiring.test.ts says as much - but the thing
   being guarded is literally the absence of a call, and absence is what a
   grep is good at. The browser tier's offline relaunch
   (tests/browser-tier/verify-build.mjs) is the belt to this pair of braces.

   The links the screen renders are not requests: a `tel:` or `https:` anchor
   sends nothing until a person taps it, and a tap hands the address to the
   dialler or the system browser rather than fetching anything in the app. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const rootPath = fileURLToPath(new URL('../', import.meta.url));

const SCREEN = 'src/routes/settings/resources/+page.svelte';
const MODULE_DIR = 'src/lib/resources';

function sources(): { path: string; text: string }[] {
  const paths = [
    SCREEN,
    ...readdirSync(join(rootPath, MODULE_DIR))
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => `${MODULE_DIR}/${name}`)
  ];
  return paths.map((path) => ({ path, text: readFileSync(join(rootPath, path), 'utf8') }));
}

/** Comments talk about the network on purpose; code must not touch it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('nothing on the resource screen fetches anything', () => {
  const callers = /\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket|navigator\.sendBeacon|import\s*\(/;
  const offenders = sources().filter(({ text }) => callers.test(code(text)));

  expect(offenders.map((s) => s.path)).toEqual([]);
});

/** An off-origin URL in an element attribute is a request the browser makes
    on its own, without anyone tapping anything - a logo, a font, an iframe. */
test('the screen loads no asset from anywhere but its own origin', () => {
  const screen = readFileSync(join(rootPath, SCREEN), 'utf8');
  const loaded = [...screen.matchAll(/\b(?:src|srcset|poster|data)=["']([^"']*)["']/g)].map((m) => m[1]);

  expect(loaded.filter((value) => /^[a-z]+:|^\/\//i.test(value))).toEqual([]);
});

/* A ratchet rather than a check of today's behaviour: as written the screen
   cannot fail it, because every outbound href is an expression over the data
   module. It fires the day someone writes an address straight into the
   template, which is how a number ends up in two places and only one of them
   gets corrected. */
test('no address is written into the template instead of coming from the directory', () => {
  const screen = readFileSync(join(rootPath, SCREEN), 'utf8');
  const hrefs = [...screen.matchAll(/\bhref=["']([^"']*)["']/g)].map((m) => m[1]);

  expect(hrefs.filter((value) => /^[a-z]+:/i.test(value))).toEqual([]);
});

/* The other half of the promise: a link that leaves has to leave, rather than
   navigating this tab and making the app itself fetch the third party. */
test('every outbound link opens outside the app', () => {
  const screen = readFileSync(join(rootPath, SCREEN), 'utf8');
  const anchors = [...screen.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  const outbound = anchors.filter((a) => /href=\{resource\.url\}/.test(a));

  expect(outbound.length).toBeGreaterThan(0);
  expect(outbound.filter((a) => !a.includes('target="_blank"'))).toEqual([]);
});
