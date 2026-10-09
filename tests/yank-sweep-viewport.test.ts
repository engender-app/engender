import { describe, expect, it } from 'vitest';
import { parseSweepViewport } from './yank-sweep-core.mjs';

describe('web sweep viewport', () => {
  it('accepts narrow and desktop capture sizes', () => {
    expect(parseSweepViewport('390x844')).toEqual({ width: 390, height: 844 });
    expect(parseSweepViewport('1280x900')).toEqual({ width: 1280, height: 900 });
  });

  it.each([undefined, '', '390', '390x', '0x844', '-390x844', '390.5x844', '390x844junk', '999999999999999999999x844'])(
    'rejects an invalid viewport before launching a browser: %s',
    (value) => expect(() => parseSweepViewport(value)).toThrow('viewport must be WIDTHxHEIGHT with positive integer dimensions')
  );
});
