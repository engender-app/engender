import { describe, expect, it, vi } from 'vitest';

vi.mock('./lock-timing-bridge', () => ({
  androidLockTiming: { setLeaveCover: vi.fn().mockResolvedValue(undefined), revealLeaveCover: vi.fn().mockResolvedValue(undefined) }
}));

import { androidLockTiming } from './lock-timing-bridge';
import { leaveCovers, revealLeaveCoverAfterPaint, syncLeaveCover } from './leave-cover';

describe("Android's leave cover", () => {
  it('covers a leave on a mode with a secret, and only then', () => {
    expect(leaveCovers(true)).toBe(true);
    expect(leaveCovers(false)).toBe(false);
  });

  it('mirrors the decision and the ground to the activity, on Android only', () => {
    syncLeaveCover(true, '#0D141A', false);
    expect(androidLockTiming.setLeaveCover).not.toHaveBeenCalled();
    syncLeaveCover(true, '#0D141A', true);
    expect(androidLockTiming.setLeaveCover).toHaveBeenCalledWith({ cover: true, ground: '#0D141A' });
  });

  it('takes the cover off only after two frames have been drawn', () => {
    const frames: Array<() => void> = [];
    const reveal = vi.fn().mockResolvedValue(undefined);
    revealLeaveCoverAfterPaint((callback) => frames.push(callback), reveal);
    expect(reveal).not.toHaveBeenCalled();
    frames.shift()!();
    expect(reveal).not.toHaveBeenCalled();
    frames.shift()!();
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('leaves the cover up when no frame is drawn', () => {
    const reveal = vi.fn().mockResolvedValue(undefined);
    revealLeaveCoverAfterPaint(() => {}, reveal);
    expect(reveal).not.toHaveBeenCalled();
  });
});
