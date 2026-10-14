import { READY_LIMIT_MS, waitForFixture } from './readiness.mjs';

/** Document commit starts the fixture's boot; its API marks completion.
 * Only recovery accepts Firefox's diagnosed interruption to the same URL.
 * @param {import('playwright-core').Page} page
 * @param {string} url
 * @param {'handover' | 'recovery' | 'recoverySeed'} fixture
 */
export async function gotoFixture(page, url, fixture) {
  const expected = new URL(url).href;
  const deadline = Date.now() + READY_LIMIT_MS;
  try {
    await page.goto(expected, { waitUntil: 'commit', timeout: READY_LIMIT_MS });
  } catch (error) {
    const match = error instanceof Error && error.message.match(
      /^page\.goto: Navigation to "([^"]+)" is interrupted by another navigation to "([^"]+)"(?:\n|$)/
    );
    if (fixture !== 'recovery' || !match || new URL(match[1]).href !== expected || new URL(match[2]).href !== expected) throw error;
  }
  await waitForFixture(page, fixture, Math.max(1, deadline - Date.now()), expected);
}
