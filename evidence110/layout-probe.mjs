import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, settlePage } from '../tests/browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from '../tests/yank-sweep-core.mjs';

const root = resolve(process.argv[2]);
const label = process.argv[3];
const out = resolve(process.argv[4]);
await mkdir(out, { recursive: true });
const app = await previewBuild(root);
const browser = await launchChromium();
const base = `http://localhost:${app.httpServer.address().port}`;
const report = [];
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
      await page.addInitScript(STUB_PERSIST_SCRIPT);
      await settlePage(page, base, '/', theme);
      await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
      await settlePage(page, base, '/settings', theme);
      const button = page.locator('[data-cycle-tracking-toggle] button.switch');
      await page.locator('[data-cycle-tracking-toggle] .kit-row-sub').waitFor();
      await button.press('Enter');
      await page.waitForTimeout(700);
      await page.setViewportSize({ width: 195, height: 844 });
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      const layout = await page.evaluate(() => {
        const main = document.querySelector('.app-main');
        const selectors = ['.app-main', '.screen', '[data-cycle-tracking-toggle]', '[data-measurement-unit]',
          '[data-measurement-unit] .kit-row-ico', '[data-measurement-unit] .kit-row-text', '[data-measurement-unit] .kit-row-trail'];
        return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth,
          overflow: [...document.querySelector('.screen').querySelectorAll('*')]
            .filter((node) => node.getBoundingClientRect().right > main.clientWidth + 1)
            .map((node) => ({ tag: node.tagName, className: node.className?.baseVal ?? node.className,
              text: node.textContent?.trim().slice(0, 70), width: node.getBoundingClientRect().width,
              right: node.getBoundingClientRect().right, minWidth: getComputedStyle(node).minWidth })),
          owners: selectors.map((selector) => {
            const node = document.querySelector(selector);
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return { selector, width: rect.width, left: rect.left, right: rect.right,
              scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
              display: style.display, minWidth: style.minWidth, flexShrink: style.flexShrink };
          }) };
      });
      const screenshot = `${label}-${theme}-195px.png`;
      await page.screenshot({ path: `${out}/${screenshot}` });
      report.push({ theme, screenshot, ...layout });
      assert.ok(layout.mainScrollWidth > layout.mainWidth, 'the narrow overflow must be reproduced');
    } finally { await context.close(); }
  }
} finally {
  await writeFile(`${out}/${label}.json`, JSON.stringify({ root, report }, null, 2));
  await browser.close();
  await new Promise((resolve) => app.httpServer.close(resolve));
}
