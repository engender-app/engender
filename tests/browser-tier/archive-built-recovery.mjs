import { preview } from 'vite';

/** The compiled app completes first-run restoration in another fresh profile. */
export async function builtArchiveRecovery(browser, source) {
  const server = await preview({ preview: { port: 0 } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const origin = `http://localhost:${server.httpServer.address().port}`;
  try {
    await page.goto(origin);
    await page.locator('[data-restore-start]').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-restore-pick]').click();
    await (await chooser).setFiles({ name: 'installation-loss.ttbackup', mimeType: 'application/octet-stream', buffer: Buffer.from(source.archive, 'base64') });
    await page.locator('#ob-restore-pass').fill('invented installation loss password');
    await page.locator('[data-restore-check]').click();
    await page.locator('[data-access-modes] [data-list-row="passphrase"]').click();
    await page.locator('[data-access-continue]').click();
    await page.locator('#am-passphrase').fill('independent built destination passphrase');
    await page.locator('#am-passphrase-confirm').fill('independent built destination passphrase');
    await page.locator('[data-access-submit]').click();
    await page.locator('[data-next]').click();
    await page.locator('[data-permission-list]').waitFor();
    await page.locator('[data-next]').click();
    await page.locator('[data-list-row="disguise"]').waitFor();
    await page.locator('[data-next]').click();
    await page.locator('[data-finish]').click();
    await page.locator('[data-coming-back-done]').click();
    await page.locator('[data-home-hello]').waitFor({ timeout: 120000 });
    if (await page.evaluate(() => document.documentElement.dataset.palette) !== 'lesbian') throw new Error('built app lost portable palette');
    await page.goto(`${origin}/day/20000`);
    await page.locator('#journal-passphrase').fill('independent built destination passphrase');
    await page.locator('[data-passphrase-submit]').click();
    await page.locator('[data-entry-note]').filter({ hasText: 'a good day, zażółć gęślą jaźń' }).waitFor();
    await page.locator('[data-entry-card]').first().click();
    await page.locator('#ed-note').waitFor();
    for (const selector of ['audio', 'video']) {
      await page.locator(`[data-section-chip="${selector === 'audio' ? 'voice' : 'video'}"]`).click();
      const element = page.locator(selector).first();
      await page.locator(`[data-editor-section="${selector === 'audio' ? 'voice' : 'video'}"]`).scrollIntoViewIfNeeded();
      await element.waitFor({ state: 'attached' });
      await element.evaluate((media) => media.load());
      await page.waitForFunction((selector) => {
        const media = document.querySelector(selector);
        return media?.readyState >= 2 && media.duration > 0;
      }, selector);
      await element.evaluate((media) => media.play());
      await page.waitForFunction((selector) => document.querySelector(selector)?.currentTime > 0.05, selector);
      await element.evaluate((media) => media.pause());
    }
    await page.goto(`${origin}/media/documents/${source.expected.journal.documents[0].id}`);
    await page.locator('#journal-passphrase').fill('independent built destination passphrase');
    await page.locator('[data-passphrase-submit]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some((image) => image.naturalWidth === 64));
    return { productionBundle: true, independentDestinationPassphrase: true, portablePalette: true, entry: true, audioPlayback: true, videoPlayback: true, documentRendered: true };
  } catch (error) { console.error('BUILT_RECOVERY_PAGE', page.url(), await page.locator('body').innerText()); throw error; } finally { await context.close(); await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve())); }
}
