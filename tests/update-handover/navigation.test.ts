import type { Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { gotoFixture } from './navigation.mjs';
const gotoRecovery = (page: Page, url: string) => gotoFixture(page, url, 'recovery');

const url = 'http://localhost:5173/recovery.html';
const interrupted = (from = url, to = url) => new Error(
  `page.goto: Navigation to "${from}" is interrupted by another navigation to "${to}"`
);
function page(error?: Error, ready = true, currentURL = url, status: string | null = 'schema-too-new') {
  return {
    goto: vi.fn(async () => { if (error) throw error; }),
    waitForFunction: vi.fn(async (predicate: (args: { url: string; fixture: string }) => boolean, args: { url: string; fixture: string }) => {
      const previous = globalThis.window;
      Object.assign(globalThis, { window: {
        location: { href: currentURL },
        document: { body: { dataset: { ready: ready ? 'true' : undefined } } },
        recovery: status === null ? undefined : { state: () => ({ status }) }
      } });
      try { if (!predicate(args)) throw new Error('recovery readiness timed out'); }
      finally { Object.assign(globalThis, { window: previous }); }
    })
  } as unknown as Page;
}

describe('recovery navigation completion', () => {
  it('requires recovery readiness after a successful navigation', async () => {
    await gotoRecovery(page(), url);
    await expect(gotoRecovery(page(undefined, false), url)).rejects.toThrow('recovery readiness timed out');
  });

  it('accepts only an equivalent-URL interruption that reaches recovery', async () => {
    await gotoRecovery(page(interrupted()), url);
    await expect(gotoRecovery(page(interrupted(), false), url)).rejects.toThrow('recovery readiness timed out');
  });

  it('requires schema refusal even when the marker is ready', async () => {
    await expect(gotoRecovery(page(interrupted(), true, url, 'ready'), url)).rejects.toThrow('recovery readiness timed out');
    await expect(gotoRecovery(page(interrupted(), true, url, null), url)).rejects.toThrow('recovery readiness timed out');
  });

  it('rejects the same interruption outside the recovery fixture', async () => {
    await expect(gotoFixture(page(interrupted()), url, 'recoverySeed')).rejects.toThrow('is interrupted');
    await expect(gotoFixture(page(interrupted()), url, 'handover')).rejects.toThrow('is interrupted');
  });

  it('rejects an equivalent interruption completed at a different live URL', async () => {
    await expect(gotoRecovery(page(interrupted(), true, `${url}?seed`), url))
      .rejects.toThrow('recovery readiness timed out');
  });

  it.each([
    interrupted(url, 'http://localhost:5173/other.html'),
    interrupted('http://localhost:5173/other.html', url),
    interrupted(url, `${url}?seed`),
    new Error('page.goto: net::ERR_CONNECTION_REFUSED'),
    new Error('page.goto: NS_BINDING_ABORTED'),
    new Error('page.goto: Timeout 30000ms exceeded'),
    new Error('held journal write failed')
  ])('preserves unrelated navigation or handover failures: %s', async (error) => {
    const target = page(error);
    await expect(gotoRecovery(target, url)).rejects.toBe(error);
    expect(target.waitForFunction).not.toHaveBeenCalled();
  });
});
