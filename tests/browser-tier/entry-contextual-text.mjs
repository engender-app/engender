import assert from 'node:assert/strict';
import { toEntryStepWith } from '../browser-harness.mjs';

export async function entryContextualText(page, base) {
  await page.goto(`${base}/entry-contextual-text.html`);
  await page.waitForSelector('body[data-entry-contextual-text-ready]', { state: 'attached' });
  const reflection = page.locator('[data-contextual="tryout-felt-sense"] input');
  const recovery = page.locator('[data-contextual="procedure-recovery"] textarea');
  const save = page.locator('[data-save]');
  for (const existing of [false, true]) {
    if (existing) await page.evaluate(() => window.contextualText.open(true));
    // A new entry's cards are on its body step (tester report 02, ticket 09).
    await toEntryStepWith(page, '[data-contextual="tryout-felt-sense"]');
    await page.locator('[data-contextual="tryout-felt-sense"] [role="radio"]').first().click();
    for (const field of [reflection, recovery]) {
      await field.pressSequentially('felt like me');
      assert.equal(await field.inputValue(), 'felt like me');
      await field.press('End');
      await field.press('Space');
      assert.equal(await field.inputValue(), 'felt like me ');
    }
    await recovery.press('Enter');
    await recovery.pressSequentially('more today  ');
    assert.equal(await recovery.inputValue(), 'felt like me \nmore today  ');
    await save.click();
    await page.waitForSelector('[data-entry-saved]');
    assert.deepEqual(await page.evaluate(() => window.contextualText.saved()), {
      felt: 'felt like me', recovery: 'felt like me \nmore today'
    });
    await page.evaluate(() => window.contextualText.clearSaved());
    await page.evaluate((existing) => window.contextualText.open(existing), existing);
    await toEntryStepWith(page, '[data-contextual="procedure-recovery"]');
    await recovery.pressSequentially('remove me');
    await recovery.press('ControlOrMeta+A');
    await recovery.press('Backspace');
    assert.equal(await recovery.inputValue(), '');
    await save.click();
    await page.waitForSelector('[data-entry-saved]');
    assert.equal((await page.evaluate(() => window.contextualText.saved())).recovery, '');
  }
}
