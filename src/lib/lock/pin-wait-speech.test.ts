import { describe, expect, it } from 'vitest';
import { pinWaitSpeech } from './pin-wait-speech';

/* The PIN wait is a countdown redrawn four times a second. A screen reader
   hears it begin and hears it end, and nothing in between (after-release
   21, audit L05-07). */
describe('what the PIN wait says out loud', () => {
  it('speaks when a wait begins', () => {
    expect(pinWaitSpeech(0, 30_000)).toBe('start');
  });

  it('stays quiet while the seconds count down', () => {
    const readings = [30_000, 29_750, 29_000, 15_250, 1_000, 250];
    const said = readings.slice(1).map((now, i) => pinWaitSpeech(readings[i], now));
    expect(said.every((s) => s === null)).toBe(true);
  });

  it('speaks when the wait is over', () => {
    expect(pinWaitSpeech(250, 0)).toBe('end');
  });

  it('says nothing when there was no wait', () => {
    expect(pinWaitSpeech(0, 0)).toBe(null);
  });
});
