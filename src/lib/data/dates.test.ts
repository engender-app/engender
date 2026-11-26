import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));
vi.mock('$lib/paraglide/runtime', async () => await import('../paraglide/runtime.js'));

const { fmtApart } = await import('./dates');
const { overwriteGetLocale } = await import('../paraglide/runtime.js');

describe('fmtApart', () => {
  it('says "Same day" for two things on one day rather than "0 days apart" (bug session 18, item 63)', () => {
    overwriteGetLocale(() => 'en');
    expect(fmtApart(20000, 20000)).toBe('Same day');
    overwriteGetLocale(() => 'pl');
    expect(fmtApart(20000, 20000)).toBe('Ten sam dzień');
  });

  it('writes the span with "apart" otherwise', () => {
    overwriteGetLocale(() => 'en');
    expect(fmtApart(20000, 20012)).toBe('12 days apart');
  });
});
