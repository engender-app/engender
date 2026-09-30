/* No screen opens the on-screen keyboard by itself.

   A text field that takes the focus while nobody touched it raises the
   keyboard on a phone and covers half the screen. The new-entry editor
   used to focus its note and the search screen had `autofocus`, so both
   opened with the keyboard up. So: open every static route plus the
   new-entry editor, let it settle, and fail if the focused element is one
   a keyboard would come up for. Sheets have their own rule and their own
   probe (sheet-focus-check.mjs).

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/no-auto-keyboard.mjs [--root <built tree>] */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--root');
const root = at >= 0 ? args[at + 1] : resolve(here, '..');

const today = Math.floor(Date.now() / 86_400_000);
const ROUTES = [
  `/entry/new/${today}`,
  '/search',
  '/',
  '/more',
  '/calendar',
  '/tally',
  '/settings/tags',
  '/settings/words',
  '/settings/affirmations',
  '/settings/eras',
  '/transition/letters',
  '/transition/tryouts',
  '/health/appointments',
  '/media/documents',
  '/body/measurements'
];

const OPENS_KEYBOARD = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const typed = el instanceof HTMLInputElement &&
    !el.readOnly && !['button','checkbox','radio','range','color','file','submit','reset','hidden','image'].includes(el.type);
  const area = el instanceof HTMLTextAreaElement && !el.readOnly;
  const editable = el.isContentEditable;
  return typed || area || editable ? el.outerHTML.slice(0, 120) : null;
})()`;

const browser = await launchChromium();
const app = await previewBuild(root);
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(() => {
  if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
});

const failures = [];
for (const route of ROUTES) {
  await settlePage(page, base, route, 'light');
  await page.waitForTimeout(800);
  const focused = await page.evaluate(OPENS_KEYBOARD);
  console.log(`${focused ? 'FAIL' : 'ok  '} ${route}${focused ? `  ${focused}` : ''}`);
  if (focused) failures.push(route);
}

await browser.close();
await app.close();
if (failures.length) {
  console.error(`${failures.length} screen(s) open with a keyboard: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('no screen opens a keyboard by itself');
