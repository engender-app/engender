import { afterEach, describe, expect, it, vi } from 'vitest';

import { GATE_ROOM, GATE_ROOMS, gateDrawsFlag, gateRoomChoice } from './gateFlag';

afterEach(() => vi.unstubAllGlobals());

describe('which gates draw the sun', () => {
  it('draws it on an unlock only, and never under disguise', () => {
    expect(gateDrawsFlag({ unlock: true, disguised: false })).toBe(true);
    expect(gateDrawsFlag({ unlock: true, disguised: true })).toBe(false);
    expect(gateDrawsFlag({ unlock: false, disguised: false })).toBe(false);
    expect(gateDrawsFlag({ unlock: false, disguised: true })).toBe(false);
  });
});

describe("the field's extra room", () => {
  it('is a little: one step of the spacing scale, with a step either side on offer', () => {
    expect(GATE_ROOM).toBe(32);
    expect(GATE_ROOMS).toEqual([0, 32, 64]);
  });

  it('ships the built room in a production build, whatever the address asks', () => {
    vi.stubGlobal('__DEMO__', false);
    for (const asked of GATE_ROOMS) expect(gateRoomChoice(`?gateRoom=${asked}`)).toBe(GATE_ROOM);
  });

  it('lets a demo build show the neighbours, and ignores anything else', () => {
    vi.stubGlobal('__DEMO__', true);
    for (const asked of GATE_ROOMS) expect(gateRoomChoice(`?gateRoom=${asked}`)).toBe(asked);
    expect(gateRoomChoice('?gateRoom=40')).toBe(GATE_ROOM);
    expect(gateRoomChoice('?gateRoom=')).toBe(GATE_ROOM);
    expect(gateRoomChoice('')).toBe(GATE_ROOM);
  });
});
