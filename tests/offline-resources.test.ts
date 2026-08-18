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

test('the only off-origin addresses on the screen are ones a person has to tap', () => {
  const screen = readFileSync(join(rootPath, SCREEN), 'utf8');
  const hrefs = [...screen.matchAll(/\bhref=(?:["']([^"']*)["']|\{([^}]*)\})/g)].map((m) => m[1] ?? m[2]);
  // Written-out addresses would freeze the directory into the template; every
  // outbound href has to come from the data module through an expression.
  const literal = hrefs.filter((value) => /^[a-z]+:/i.test(value));

  expect(literal).toEqual([]);
});
