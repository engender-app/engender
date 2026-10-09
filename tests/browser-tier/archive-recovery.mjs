/** Independent contexts never share profiles, keys, recovery wraps or private files. */
export async function recoveryCommand(page, name, input) {
  await page.waitForFunction(() => window.recoveryProbe?.ready);
  await page.evaluate(({ name, input }) => { void window.recoveryProbe.command(name, input); }, { name, input });
  await page.waitForFunction(() => window.recoveryProbe.ready, null, { timeout: 180000 });
  const result = await page.evaluate(() => window.recoveryProbe.result);
  if (result?.error) throw new Error(result.error);
  if (!result?.identity) throw new Error('Archive recovery command produced no execution evidence');
  return result;
}

export async function browserRecoverySource(browser, origin) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/archive-recovery.html`);
    return await recoveryCommand(page, 'source');
  } finally { await context.close(); }
}

export async function browserRecoveryDestination(browser, origin, input) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/archive-recovery.html`);
    const result = await recoveryCommand(page, 'restore', input);
    if (result.identity === input.identity) throw new Error('source and destination installation identities match');
    return result;
  } finally { await context.close(); }
}

export function assertRecoveryResult(result) {
  if (result.sections !== 54 || result.attachments < 10 || result.failures?.length !== 4 ||
      !result.interruptedRestart || !result.restarted || !result.merge ||
      !result.localPreserved || result.accessMode !== 'passphrase' || !result.destinationCredentialVerified || !result.portableApplied ||
      !result.media?.image || !result.media.audioPlayback || !result.media.videoPlayback || !result.media.documentRendered) {
    throw new Error(`incomplete Archive recovery execution: ${JSON.stringify(result)}`);
  }
}
