import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`${message.text()}\n`);
  });
  page.on('pageerror', (error) => process.stderr.write(`${error.message}\n`));
  await page.goto('https://localhost:8766/?role=pc');
  try {
    await page.waitForFunction(
      () => document.querySelector('#result').textContent.includes('Android reply'),
      null,
      { timeout: 45000 }
    );
  } catch {
    process.exitCode = 1;
  }
  process.stdout.write(`${await page.locator('#result').textContent()}\n`);
} finally {
  await browser.close();
}
