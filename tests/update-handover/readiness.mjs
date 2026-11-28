export const READY_LIMIT_MS = 60000;

/** The marker is written after SQLite boot and worker setup, not at document load.
 * @param {import('playwright-core').Page} page
 * @param {'handover' | 'recovery' | 'recoverySeed'} fixture
 * @param {number} [timeout]
 * @param {string} [url]
 */
export async function waitForFixture(page, fixture, timeout = READY_LIMIT_MS, url) {
  const started = Date.now();
  await page.waitForFunction(({ fixture, url }) => {
    const scope = /** @type {Window & {
     * handover?: { state(): unknown },
     * recovery?: { state(): { status: string } },
     * recoverySeed?: { offer(): Promise<void> }
     * }} */ (window);
    if (url && scope.location.href !== url) return false;
    if (scope.document.body?.dataset.ready !== 'true') return false;
    if (fixture === 'recovery') return scope.recovery?.state().status === 'schema-too-new';
    return fixture === 'recoverySeed'
      ? typeof scope.recoverySeed?.offer === 'function'
      : typeof scope.handover?.state === 'function';
  }, { fixture, url }, { timeout });
  console.log(`READY ${fixture} ${Date.now() - started}ms`);
}
