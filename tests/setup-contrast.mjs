/* Every piece of type on every step of setup, measured against what is
   actually behind it (phase 10 redesign ticket 33, DIRECTION.md rule 11).

   Rule 11 computes the eight field/ink pairs from the hexes, and
   palette-contrast.test.ts holds them at the 3:1 large-text floor. That is
   the palette's arithmetic; this is the screen's. A step draws the question
   on a flag colour and everything else on the page, and the two things a
   table cannot answer are what an element's effective background really is
   once a fill, a wash or a role has been resolved, and which of the two
   floors applies once a browser has laid the type out at whatever size the
   cascade actually gave it.

   So this walks the real DOM of every step in every palette and both
   themes, resolves each text node's background by climbing until something
   paints, and reports the worst ratio per step with the element that owns
   it. Large text answers to 3:1 and anything smaller to 4.5:1 (WCAG 1.4.3);
   the boundary is 24px, or 18.66px at weight 700 or more, which is the same
   floor tests/direction-contract.test.ts uses.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/setup-contrast.mjs [--palettes trans,agender] [--themes light,dark]
   Writes .claude/setup-contrast.json and prints the worst ratio per step. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const PALETTES = flag(
  'palettes',
  'trans,nonbinary,genderfluid,bisexual,lesbian,pansexual,rainbow,agender'
).split(',');
const THEMES = flag('themes', 'light,dark').split(',');
const ORDER = [
  'welcome',
  'name',
  'flag',
  'scales',
  'areas',
  'lock',
  'permissions',
  'disguise',
  'done'
];

/* Read in the page: every element with text of its own, the colour it is
   drawn in, the first background above it that paints, and the ratio. */
const MEASURE = () => {
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const chan = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /* A translucent layer over what is behind it, which is what a wash and a
     scrim are: composited rather than ignored, or a 12% accent fill would
     be read as the surface under it. */
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  });
  const behind = (el) => {
    let stack = [];
    /* The field paints nothing (redesign ticket 33): its colour is a
       sibling block a window tall whose bottom edge is a clip, which is
       what lets the edge move without the box being resized. So climbing
       the ancestors from the question would walk straight past the flag
       colour and land on the page - measured genderfluid's white question
       at 1.07:1 against a light page it is not drawn on. Anything inside
       the field is measured against the field. */
    if (el.closest('[data-setup-field]')) {
      const field = parse(
        getComputedStyle(document.querySelector('.setup-paint')).backgroundColor
      );
      if (field) stack.push(field);
    }
    for (let node = el; node && stack.every((b) => b.a < 1); node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (!bg || bg.a === 0) continue;
      stack.push(bg);
      if (bg.a === 1) break;
    }
    /* The page itself, where nothing above it painted anything solid. */
    let base = parse(getComputedStyle(document.body).backgroundColor) ?? {
      r: 255,
      g: 255,
      b: 255,
      a: 1
    };
    for (const layer of stack.reverse()) base = over(layer, base);
    return base;
  };

  const results = [];
  for (const el of document.querySelectorAll('.screen-setup *')) {
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (!own) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.9) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const ink = parse(style.color);
    if (!ink) continue;
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    results.push({
      what: `${el.tagName.toLowerCase()}.${(el.className.toString().split(' ')[0] || '-')}`,
      text: el.textContent.trim().slice(0, 28),
      size: Math.round(size * 10) / 10,
      weight,
      floor: large ? 3 : 4.5,
      ratio: Math.round(ratio(ink, behind(el)) * 100) / 100
    });
  }
  return results;
};

const outFile = resolve(here, '../.claude/setup-contrast.json');
await mkdir(dirname(outFile), { recursive: true });

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent =
    '[data-toast]{display:none !important}' +
    '.demo-bar{display:none !important}' +
    'body.has-demo-bar{display:block !important;height:auto !important}';
  addEventListener('DOMContentLoaded', () => document.head.append(style));
});

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const wear = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) =>
      document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

const findings = {};
let worst = { ratio: Infinity };

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await wear(palette, theme);
    await settle('/');
    await page.locator('#demo-jump').evaluate((el) => {
      el.value = 'first-run';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('[data-next]');
    for (const step of ORDER) {
      await page.waitForTimeout(450);
      if (step === 'name') await page.locator('#ob-name').fill('Ola');
      const measured = await page.evaluate(MEASURE);
      const failed = measured.filter((m) => m.ratio < m.floor);
      const low = measured.reduce((a, b) => (b.ratio < a.ratio ? b : a), { ratio: Infinity });
      findings[`${palette}-${theme}-${step}`] = { lowest: low, failed };
      if (low.ratio < worst.ratio) worst = { ...low, where: `${palette} ${theme} ${step}` };
      if (failed.length) {
        for (const f of failed) {
          console.log(
            `UNDER FLOOR  ${palette} ${theme} ${step}: ${f.what} "${f.text}" ${f.ratio}:1 ` +
              `against a ${f.floor}:1 floor (${f.size}px/${f.weight})`
          );
        }
      }
      if (step !== 'done') await page.locator('[data-next]').click();
    }
    console.log(`${palette} ${theme}: measured ${ORDER.length} steps`);
  }
}

await writeFile(outFile, JSON.stringify({ worst, findings }, null, 2));
console.log(
  `\nworst anywhere: ${worst.ratio}:1 on ${worst.where} (${worst.what} "${worst.text}", ` +
    `${worst.size}px/${worst.weight}, floor ${worst.floor})`
);
const under = Object.values(findings).filter((f) => f.failed.length).length;
console.log(under ? `${under} step/palette pairs under the floor` : 'every step clears its floor');
await page.close();
await app.close();
await browser.close();
