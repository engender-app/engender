/* Throwaway measurement probe for an /impeccable critique (Assessment B).
   Seeds the same two procedures tests/surgery-rail-gallery.mjs seeds and
   reports boxes, contrast ratios, 320px overflow and rail geometry as
   JSON. Delete after use. */
import { preview } from 'vite';
import { launchChromium, fillDate } from './browser-harness.mjs';
import { tinyPhoto } from './photo-fixture.mjs';

const SETTLED = 700;

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return page;
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function addProcedure(page, { name, day }) {
  await goto(page, '/health/surgery');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#surgery-name');
  await page.fill('#surgery-name', name);
  if (day) await fillDate(page, '#surgery-date', day);
  await page.locator('[data-save-procedure]').click();
  await page.waitForSelector('[data-save-procedure]', { state: 'detached' });
  await page.waitForTimeout(SETTLED);
}

async function open(page, name) {
  await goto(page, '/health/surgery');
  await page.locator('[data-procedure-card]', { hasText: name }).first().locator('button').first().click();
  await page.waitForSelector('[data-recovery-log]');
  await page.waitForTimeout(SETTLED);
}

async function addConsult(page, name, day) {
  await open(page, name);
  await page.locator('[data-add-consult]').click();
  await page.waitForSelector('#surgery-consult-date');
  await fillDate(page, '#surgery-consult-date', day);
  await page.locator('[data-save-consult]').click();
  await page.waitForTimeout(SETTLED);
}

async function addPhoto(page, name, day, fill) {
  await open(page, name);
  const before = await page.locator('[data-procedure-photo]').count();
  await page.locator('[data-add-photo]').click();
  await page.waitForSelector('#surgery-photo-date');
  await fillDate(page, '#surgery-photo-date', day);
  const bytes = await tinyPhoto(page, fill);
  page.once('filechooser', (chooser) =>
    chooser.setFiles({ name: 'healing.png', mimeType: 'image/png', buffer: bytes })
  );
  await page.locator('[data-pick-procedure-photo]').click();
  await page.waitForFunction(
    (want) => document.querySelectorAll('[data-procedure-photo]').length >= want,
    before + 1,
    { timeout: 60000 }
  );
  await page.waitForTimeout(SETTLED);
}

async function setProcedureDate(page, name, day) {
  await goto(page, '/health/surgery');
  await page.locator('[data-procedure-card]', { hasText: name }).first().locator('[data-edit-procedure]').click();
  await page.waitForSelector('#surgery-date');
  await fillDate(page, '#surgery-date', day);
  await page.locator('[data-save-procedure]').click();
  await page.waitForSelector('[data-save-procedure]', { state: 'detached' });
  await page.waitForTimeout(SETTLED);
}

async function seed(page) {
  await addProcedure(page, { name: 'facial surgery', day: iso(-18) });
  await addProcedure(page, { name: 'top surgery', day: iso(-18) });
  await addConsult(page, 'facial surgery', iso(-160));
  await addConsult(page, 'facial surgery', iso(-52));
  await addConsult(page, 'top surgery', iso(-460));
  await addConsult(page, 'top surgery', iso(-420));
  await addPhoto(page, 'facial surgery', iso(-16), '#c94f7c');
  await addPhoto(page, 'facial surgery', iso(-11), '#b8687f');
  await addPhoto(page, 'facial surgery', iso(-4), '#8f6f9e');
  await setProcedureDate(page, 'top surgery', iso(-400));
  await goto(page, '/health/surgery');
  await page.waitForTimeout(SETTLED);
}

/* Everything measured in the page, in one evaluate. Colours are resolved by
   painting the computed string into a 1x1 canvas, because getComputedStyle
   hands back unresolved color-mix()/oklab() for this app's tinted grounds. */
const MEASURE = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  /** [r,g,b,a] with a in 0..1, or null when the canvas parser refused it. */
  function paint(str) {
    if (!str || str === 'none') return null;
    ctx.fillStyle = '#123456';
    ctx.fillStyle = str;
    const accepted = ctx.fillStyle;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (accepted === '#123456' && !/123456|18,\s*52,\s*86/.test(str)) return null;
    return [r, g, b, a / 255];
  }

  const over = (fg, bg) => {
    const a = fg[3];
    return [
      Math.round(fg[0] * a + bg[0] * (1 - a)),
      Math.round(fg[1] * a + bg[1] * (1 - a)),
      Math.round(fg[2] * a + bg[2] * (1 - a)),
      1,
    ];
  };

  /** The painted ground behind an element: walk ancestors compositing until
      opaque, ending on the canvas/body colour. */
  function groundOf(el) {
    let stack = [];
    let node = el;
    while (node && node !== document.documentElement.parentNode) {
      const cs = getComputedStyle(node);
      const c = paint(cs.backgroundColor);
      if (c && c[3] > 0) {
        stack.push({ node, rgba: c });
        if (c[3] >= 0.999) break;
      }
      node = node.parentElement;
    }
    let out = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i -= 1) out = over(stack[i].rgba, out);
    return { rgba: out, from: stack.length ? stack[0].node.className || stack[0].node.tagName : 'canvas' };
  }

  const lum = ([r, g, b]) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  };

  function textMeasure(el, label) {
    if (!el) return { label, error: 'element not found' };
    const cs = getComputedStyle(el);
    const ground = groundOf(el);
    let fg = paint(cs.color);
    if (!fg) return { label, error: `colour unresolved: ${cs.color}`, ground: ground.rgba };
    if (fg[3] < 0.999) fg = over(fg, ground.rgba);
    return {
      label,
      text: (el.textContent || '').trim().slice(0, 30),
      fontPx: parseFloat(cs.fontSize),
      weight: cs.fontWeight,
      fg: `rgb(${fg[0]},${fg[1]},${fg[2]})`,
      bg: `rgb(${ground.rgba[0]},${ground.rgba[1]},${ground.rgba[2]})`,
      bgFrom: String(ground.from),
      ratio: ratio(fg, ground.rgba),
    };
  }

  const box = (el, label) => {
    if (!el) return { label, error: 'element not found' };
    const r = el.getBoundingClientRect();
    return {
      label,
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
    };
  };

  const cards = [...document.querySelectorAll('[data-procedure-card]')].map((card) => {
    const name = card.querySelector('.proc-name')?.textContent?.trim() ?? '?';
    const rail = card.querySelector('[data-procedure-rail]');
    const marks = [...card.querySelectorAll('.proc-mark')];
    const railRect = rail?.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      name,
      phase: card.dataset.phase,
      boxes: [
        box(card.querySelector('.proc-face'), 'face button'),
        box(card.querySelector('.proc-act'), 'pencil button'),
        box(card.querySelector('.proc-block'), 'reading block'),
      ],
      text: [
        textMeasure(card.querySelector('.proc-name'), 'proc-name'),
        textMeasure(card.querySelector('.proc-phase-pill'), 'proc-phase-pill'),
        textMeasure(card.querySelector('.proc-n'), 'proc-n'),
        textMeasure(card.querySelector('.proc-unit'), 'proc-unit'),
        textMeasure(card.querySelector('.proc-when'), 'proc-when'),
        textMeasure(card.querySelector('.proc-shot-day'), 'proc-shot-day'),
      ],
      rail: rail
        ? {
            rect: box(rail, 'rail'),
            overflowAncestors: (() => {
              const out = [];
              let n = rail.parentElement;
              while (n && n !== document.body) {
                const cs = getComputedStyle(n);
                if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) {
                  out.push(`${n.className || n.tagName}: ${cs.overflowX}/${cs.overflowY}`);
                }
                n = n.parentElement;
              }
              return out;
            })(),
            marks: marks
              .map((m) => {
                const r = m.getBoundingClientRect();
                return {
                  kind: m.dataset.mark,
                  at: getComputedStyle(m).getPropertyValue('--at').trim(),
                  left: Math.round((r.left - railRect.left) * 100) / 100,
                  right: Math.round((r.right - railRect.left) * 100) / 100,
                  w: Math.round(r.width * 100) / 100,
                  h: Math.round(r.height * 100) / 100,
                  opacity: getComputedStyle(m).opacity,
                };
              })
              .sort((a, b) => a.left - b.left),
            railWidth: Math.round(railRect.width * 100) / 100,
          }
        : null,
      /* Anything inside the card painted wider than the card's own box. */
      overflowers: [...card.querySelectorAll('*')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.right > cardRect.right + 0.5 || r.left < cardRect.left - 0.5))
        .map(({ el, r }) => ({
          what: el.className || el.tagName,
          overRight: Math.round((r.right - cardRect.right) * 100) / 100,
          overLeft: Math.round((cardRect.left - r.left) * 100) / 100,
        })),
      cardBox: box(card, 'card'),
    };
  });

  return {
    theme: document.documentElement.dataset.theme,
    palette: document.documentElement.dataset.palette ?? null,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    scrollers: [...document.querySelectorAll('*')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX))
      .map((el) => `${el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}`),
    cards,
  };
};

const report = {};
for (const theme of ['light', 'dark']) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await seed(page);
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  report[`${theme}-390`] = await page.evaluate(MEASURE);

  await page.setViewportSize({ width: 320, height: 1400 });
  await page.waitForTimeout(SETTLED);
  report[`${theme}-320`] = await page.evaluate(MEASURE);
  await page.close();
}

process.stdout.write(`\n===JSON===\n${JSON.stringify(report, null, 2)}\n`);
await browser.close();
await app.httpServer.close();
