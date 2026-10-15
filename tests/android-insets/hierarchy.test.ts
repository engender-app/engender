import { describe, expect, it } from 'vitest';
import { dumpHierarchy } from './hierarchy.mjs';

const crash = 'AndroidRuntime: FATAL EXCEPTION: UiAutomation\nAndroidRuntime: PID: 88\n'
  + 'AndroidRuntime: java.lang.RuntimeException: Bad file descriptor\nandroid.os.BinderProxy.transactNative\n';
const failure = (status = 137) => Object.assign(new Error('dump failed'), { status, signal: null, stdout: 'XML written' });

function harness(options: { crash?: string; failures?: number; status?: number; changed?: boolean; staleCrash?: boolean } = {}) {
  const calls: string[] = [];
  const receipts: unknown[] = [];
  let attempts = 0;
  const adb = (...args: string[]) => {
    const command = args.join(' ');
    calls.push(command);
    if (command.includes('pidof')) return options.changed && attempts ? '99' : '42';
    // API35 exposes mCurrentFocus in the full dump, not the windows section.
    if (command === 'shell dumpsys window') return '  mCurrentFocus=Window{750dc7d u0 proof/Main}';
    if (command.startsWith('logcat')) return (attempts || options.staleCrash) ? (options.crash ?? crash) : '';
    if (command.includes('uiautomator')) {
      attempts++;
      if (attempts <= (options.failures ?? 1)) throw failure(options.status);
    }
    if (command.includes('cat /')) return '<fresh hierarchy />';
    return '';
  };
  return { calls, receipts, run: () => dumpHierarchy({ adb, path: '/proof.xml', packageName: 'proof', onRetry: async (receipt: unknown) => { receipts.push(receipt); } }) };
}

describe('native hierarchy capture recovery', () => {
  it('retries the diagnosed tool crash once and removes XML before each attempt', async () => {
    const h = harness();
    await expect(h.run()).resolves.toBe('<fresh hierarchy />');
    expect(h.receipts).toHaveLength(1);
    expect(h.calls.filter((call) => call.includes('rm -f'))).toHaveLength(2);
    expect(h.calls.filter((call) => call.includes('uiautomator'))).toHaveLength(2);
    expect(h.calls.filter((call) => call.includes('cat /'))).toHaveLength(1);
  });
  it.each([
    { status: 1 }, { crash: '' }, { crash: crash.replace('UiAutomation', 'main') },
    { crash: crash.replace('PID: 88', 'PID: 42') }, { changed: true }, { staleCrash: true },
    { crash: crash + 'FATAL EXCEPTION: main\n' }
  ])('rejects unrelated, stale or application failures: %j', async (options) => {
    const h = harness(options);
    await expect(h.run()).rejects.toThrow('dump failed');
    expect(h.receipts).toHaveLength(0);
    expect(h.calls.some((call) => call.includes('cat /'))).toBe(false);
  });
  it('fails after the second nonzero exit without reading either XML', async () => {
    const h = harness({ failures: 2 });
    await expect(h.run()).rejects.toThrow('dump failed');
    expect(h.receipts).toHaveLength(1);
    expect(h.calls.filter((call) => call.includes('uiautomator'))).toHaveLength(2);
    expect(h.calls.some((call) => call.includes('cat /'))).toBe(false);
  });
});
