/* Guard the bundled resource directory against in-app network requests,
   including remote logos and status checks. This Node test checks source.
   The browser tier also exercises offline relaunch in verify-build.mjs.
   A deliberate tap opens a link through the system dialer or browser. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const rootPath = fileURLToPath(new URL('../', import.meta.url));

const SCREEN = 'src/routes/support/resources/+page.svelte';
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

/* One country at a time since bug session 18: the switch used to
   jump down one page and name each country twice. Both regions stay
   compiled in, so the directory is complete offline either way; within a
   region, helplines and support come first and reading after. */
test('a country switch shows one region, talk first and reading after', () => {
  const screen = readFileSync(join(rootPath, SCREEN), 'utf8');

  expect(screen).toContain('name={m.resources_jump_label()}');
  expect(screen).toContain('<Segmented');
  expect(screen).toContain("resourcesFor(region).filter((resource) => resource.kind !== 'info')");
  expect(screen).toContain("resourcesFor(region).filter((resource) => resource.kind === 'info')");
  expect(screen.indexOf('m.resources_talk()')).toBeLessThan(screen.indexOf('m.resources_read()'));
});
