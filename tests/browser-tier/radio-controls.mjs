import assert from 'node:assert/strict';

export async function checkRadioGroup(page, group) {
  const radios = group.locator('[role="radio"]');
  const selected = group.locator('[role="radio"][aria-checked="true"]');
  await selected.focus();
  await page.keyboard.press('Space');
  assert.equal(await selected.count(), 1, 'Space retains selection');
  await page.keyboard.press('ArrowRight');
  assert.equal(await group.locator('[role="radio"][aria-checked="true"]:focus').count(), 1, 'arrows select and focus');
  assert.equal(await group.locator('[role="radio"][tabindex="0"]').count(), 1, 'one Tab stop');
  await page.keyboard.press('Tab');
  assert.equal(await radios.evaluateAll(els => els.includes(document.activeElement)), false, 'Tab leaves');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await group.locator('[aria-checked="true"]:focus').count(), 1, 're-entry focuses selection');
  const current = await radios.evaluateAll(els => els.indexOf(document.activeElement));
  const skipped = (current + 1) % await radios.count();
  await radios.nth(skipped).evaluate(el => el.setAttribute('disabled', ''));
  await page.keyboard.press('ArrowRight');
  assert.equal(await radios.nth((skipped + 1) % await radios.count()).getAttribute('aria-checked'), 'true', 'disabled choice skipped');
  await radios.nth(skipped).evaluate(el => el.removeAttribute('disabled'));
}
