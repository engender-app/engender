import { writeFile } from 'node:fs/promises';
import { launchChromium, previewBuild, settlePage } from '../tests/browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from '../tests/yank-sweep-core.mjs';

const evidence = new URL('./narrow-layout/', import.meta.url);
const roots = { 'clean-base': new URL('../../ticket110-clean-base/', import.meta.url).pathname,
  candidate: new URL('../', import.meta.url).pathname };
const report = [];
for (const [label, root] of Object.entries(roots)) {
  const app = await previewBuild(root);
  const browser = await launchChromium();
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 195, height: 844 } });
      await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
      await page.addInitScript(STUB_PERSIST_SCRIPT);
      await settlePage(page, `http://localhost:${app.httpServer.address().port}`, '/settings', theme);
      const segments = page.locator('[data-segmented="theme"]');
      await segments.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      const geometry = await segments.evaluate((node) => ({ width: node.getBoundingClientRect().width,
        right: node.getBoundingClientRect().right, available: document.querySelector('.app-main').clientWidth }));
      const file = `${label}-${theme}-theme-195px.png`;
      await page.screenshot({ path: new URL(file, evidence).pathname });
      report.push({ label, root, theme, file, geometry });
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => app.httpServer.close(resolve));
  }
}
await writeFile(new URL('theme-overflow.json', evidence), JSON.stringify(report, null, 2));
