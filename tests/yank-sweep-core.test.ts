// @ts-nocheck
/* The yank sweep's arithmetic, unit-tested on synthetic frames (ticket
   100). The desktop sweep proved itself by injecting wrong marks into a
   real browser; that proves the whole chain but says nothing about which
   half broke when it goes quiet. These pin the four failure shapes - and,
   just as much, the shapes that must NOT be flagged, because a detector
   that fires on every legitimate animation is a detector nobody reads.

   The hydration sweep's additions (ticket 108) are pinned here too: the
   wider teleport floor over its calmer window, the camera's transient
   arithmetic on synthetic gray frames, and the screen inventory the two
   crawlers walk. */
import { describe, expect, it } from 'vitest';

import {
  BLOAT_PX,
  COLOR_DELTA,
  HYDRATION_NEEDS,
  HYDRATION_PX,
  PROOF,
  TELEPORT_PX,
  colorDistance,
  findPixelYanks,
  findYanks,
  hydrationScreensFor,
  isBlankGray,
  missingProofYanks,
  parseCssColor,
  readRenderYanks,
  replySlices,
  scenesFor,
  scrapeIdExpression
} from './yank-sweep-core.mjs';

/** A frame holding one mark, sized and placed - the shape the rows
 *  instrument produces, minus everything the arithmetic does not read. */
const frame = (row, at) => ({ at, active: false, rows: row ? { mark: row } : {}, vt: {} });
const mark = (over = {}) => ({ x: 10, y: 20, w: 100, h: 24, o: 1, ...over });
/** `n` frames of the same resting mark - the stillness a spike is read
 *  against. */
const still = (n, over) => Array.from({ length: n }, (_, i) => frame(mark(over), i * 16));

describe('readRenderYanks', () => {
  it('accepts one painted frame and rejects blank or empty casts', async () => {
    const painted = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVQI12NgYGD4//8/AAYBAv4Kby8eAAAAAElFTkSuQmCC';
    const blank = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR7sAAAAASUVORK5CYII=';
    await expect(readRenderYanks([{ data: painted, at: 0 }], '/tmp', 'static', 'light', undefined, { readyFrame: painted })).resolves.toEqual({ cast: 1, findings: [] });
    await expect(readRenderYanks([{ data: painted, at: 0 }], '/tmp', 'old', 'light', undefined, { readyFrame: blank })).rejects.toThrow('first frame does not match the ready screen');
    await expect(readRenderYanks([{ data: blank, at: 0 }], '/tmp', 'blank', 'light')).rejects.toThrow('only 1 screencast frames');
    await expect(readRenderYanks([], '/tmp', 'missing', 'light')).rejects.toThrow('only 0 screencast frames');
  });
});

describe('findYanks', () => {
  it('reports a mark that teleports between two still frames', () => {
    /* Eight frames of a smooth 6px slide, then 200px in one - and it stays
       teleported, so the return trip is not what gets flagged. */
    const frames = [
      ...Array.from({ length: 8 }, (_, i) => frame(mark({ y: 20 + i * 6 }), i * 16)),
      frame(mark({ y: 20 + 8 * 6 + 200 }), 128),
      ...still(4, { y: 20 + 8 * 6 + 200 })
    ];
    const yanks = findYanks(frames, 'rows');
    expect(yanks).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
  });

  it('ignores motion that stays outside the viewport', () => {
    const frames = [
      frame(mark({ y: 4800, v: false }), 0),
      frame(mark({ y: 4800, v: false }), 16),
      frame(mark({ y: 5000, v: false }), 32),
      frame(mark({ y: 5000, v: false }), 48)
    ];
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('does not report a box moving from view to below the viewport', () => {
    const frames = [
      frame(mark({ y: 700, v: true, o: 1 }), 0),
      frame(mark({ y: 700, v: true, o: 1 }), 16),
      frame(mark({ y: 5000, v: false, o: 0 }), 32),
      frame(mark({ y: 5000, v: false, o: 0 }), 48)
    ];
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('ignores a crossfade leaver layout jump while it fades', () => {
    const frames = [
      frame(mark({ leaving: false, o: 1 }), 0),
      frame(mark({ leaving: true, o: 1, y: 220 }), 16),
      frame(mark({ leaving: true, o: 0.7, y: 220 }), 32),
      frame(mark({ leaving: true, o: 0.4, y: 220 }), 48),
      frame(mark({ leaving: true, o: 0.1, y: 220 }), 64)
    ];
    expect(findYanks(frames, 'rows').filter((y) => y.kind === 'teleport')).toEqual([]);
  });

  it('does not read a scroll as mark teleportation', () => {
    const frames = [frame(mark({ y: 300, sy: 0 }), 0), frame(mark({ y: 76, sy: 224 }), 16), frame(mark({ y: 76, sy: 224 }), 32)];
    expect(findYanks(frames, 'rows').filter((y) => y.kind === 'teleport')).toEqual([]);
  });

  it('ignores a nearly invisible crossfade skeleton moving out of flow', () => {
    const frames = [
      frame(mark({ y: 124, o: 0, leaving: true }), 0),
      frame(mark({ y: 638, o: 0.053, leaving: true }), 16),
      frame(mark({ y: 643, o: 0.017, leaving: true }), 32)
    ];
    expect(findYanks(frames, 'rows').filter((y) => y.kind === 'teleport')).toEqual([]);
  });

  it('does not read a clipped reveal as an opacity arrival', () => {
    const frames = [
      frame(mark({ o: 0.375, c: 0.375 }), 0),
      frame(mark({ o: 1, c: 1 }), 16),
      frame(mark({ o: 1, c: 1 }), 32),
      frame(mark({ o: 1, c: 1 }), 48)
    ];
    expect(findYanks(frames, 'rows').filter((y) => y.kind === 'arrival')).toEqual([]);
  });

  it('still reports a visible mark jumping without a fade', () => {
    const frames = [
      frame(mark({ v: true, leaving: true }), 0),
      frame(mark({ v: true, leaving: true }), 16),
      frame(mark({ v: true, leaving: true, y: 220 }), 32),
      frame(mark({ v: true, leaving: true, y: 220 }), 48)
    ];
    expect(findYanks(frames, 'rows')).toContainEqual(expect.objectContaining({ kind: 'teleport' }));
  });

  it('does not report a mark that slides, however fast', () => {
    /* 30px per frame, well over TELEPORT_PX, but every neighbour moves the
       same 30px: a slide, not a spike. */
    const frames = Array.from({ length: 12 }, (_, i) => frame(mark({ y: 20 + i * 30 }), i * 16));
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('does not report teleport when movement matches neighbour velocity across dropped frames', () => {
    /* Moving 3px per 16ms frame, then an 80ms gap (5 frames) where it moves 15px,
       then continues at 3px per 16ms frame. Same velocity throughout. */
    const frames = [
      frame(mark({ y: 0 }), 0),
      frame(mark({ y: 3 }), 16),
      frame(mark({ y: 6 }), 32),
      frame(mark({ y: 21 }), 112),
      frame(mark({ y: 24 }), 128),
      frame(mark({ y: 27 }), 144)
    ];
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('still reports teleport across dropped frames if jump exceeds expected distance', () => {
    /* Resting, then an 80ms gap with a 200px jump, then resting. */
    const frames = [
      frame(mark({ y: 0 }), 0),
      frame(mark({ y: 0 }), 32),
      frame(mark({ y: 200 }), 112),
      frame(mark({ y: 200 }), 144)
    ];
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
  });

  it('reports a mark cut from full opacity to nothing in one frame', () => {
    const frames = [...still(6), frame(mark({ o: 0 }), 96), ...still(4)];
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'vanish', mark: 'mark' })
    );
  });

  it('does not report vanish when opacity fades smoothly across dropped frames', () => {
    /* Fade from 0.76 to 0.01 over an 80ms gap (5 frames, ~0.15 drop/frame). */
    const frames = [
      frame(mark({ o: 1 }), 0),
      frame(mark({ o: 0.76 }), 32),
      frame(mark({ o: 0.01 }), 112),
      frame(mark({ o: 0 }), 128)
    ];
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('does not report a smooth mark leaving the viewport as an opacity cut', () => {
    const frames = [
      frame(mark({ y: 790, o: 1, c: 1, v: true }), 0),
      frame(mark({ y: 812, o: 0.5, c: 0.5, v: true }), 16),
      frame(mark({ y: 834, o: 0.01, c: 0.01, v: true }), 32),
      frame(mark({ y: 856, o: 0, c: 0, v: false }), 48)
    ];
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('reports a mark absent for two mid-gesture frames and back', () => {
    const frames = [...still(5), frame(null, 80), frame(null, 96), ...still(3)];
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'limbo', mark: 'mark' })
    );
  });

  describe('there-and-back shape (ticket 137)', () => {
    it('reports a mark displaced by more than teleport floor for one frame and returned', () => {
      const frames = [
        ...still(6, { y: 20 }),
        frame(mark({ y: 220 }), 96),
        ...still(4, { y: 20 })
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'there-and-back', mark: 'mark' })
      );
    });

    it('reports the photos-persona-light 104ms defect shape over hydration window', () => {
      /* Six marks including .photo-thumb dropped 339px for one frame and returned */
      const frames = [
        frame(mark({ y: 305.6 }), 70),
        frame(mark({ y: 305.6 }), 86),
        frame(mark({ y: 644.6 }), 104),
        frame(mark({ y: 305.6 }), 130),
        frame(mark({ y: 305.6 }), 150)
      ];
      const yanks = findYanks(frames, 'rows', frames.length - 1, HYDRATION_PX);
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'there-and-back', mark: 'mark', at: 104 })
      );
    });

    it('does not report when displacement is below the teleport floor', () => {
      const frames = [
        ...still(6, { y: 20 }),
        frame(mark({ y: 20 + TELEPORT_PX - 1 }), 96),
        ...still(4, { y: 20 })
      ];
      expect(findYanks(frames, 'rows').filter((y) => y.kind === 'there-and-back')).toEqual([]);
    });

    it('does not report when return journey does not return near start', () => {
      /* Displaced 200px, but only returns 10px - not there-and-back */
      const frames = [
        ...still(6, { y: 20 }),
        frame(mark({ y: 220 }), 96),
        ...still(4, { y: 210 })
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks.some((y) => y.kind === 'there-and-back')).toBe(false);
    });

    it('reports when initial displacement clears teleport floor and returns to start even if return delta < teleportPx', () => {
      /* Starts at 0, jumps to 40 (teleportPx = 40), returns to 6 (dReturn = 6 <= returnFraction = 14).
         Return delta is |40 - 6| = 34px, which is less than 40px. */
      const frames = [
        ...still(6, { y: 0 }),
        frame(mark({ y: 40 }), 96),
        ...still(4, { y: 6 })
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'there-and-back', mark: 'mark' })
      );
    });

    it('does not report when outside frames are in motion (animating/sliding)', () => {
      /* 30px per frame motion with a 30px reversal */
      const frames = [
        frame(mark({ y: 0 }), 0),
        frame(mark({ y: 30 }), 16),
        frame(mark({ y: 60 }), 32),
        frame(mark({ y: 90 }), 48),
        frame(mark({ y: 60 }), 64),
        frame(mark({ y: 90 }), 80),
        frame(mark({ y: 120 }), 96)
      ];
      expect(findYanks(frames, 'rows').filter((y) => y.kind === 'there-and-back')).toEqual([]);
    });
  });

  describe('arrival shape (ticket 137)', () => {
    it('reports tree form: mark absent from start, present at >= VISIBLE in one frame, and holds', () => {
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(null, 32),
        frame(mark({ o: 1 }), 48),
        frame(mark({ o: 1 }), 64),
        frame(mark({ o: 1 }), 80),
        frame(mark({ o: 1 }), 96)
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'arrival', mark: 'mark', at: 48 })
      );
    });

    it('reports opacity-step form: mark at <= GONE jumping to >= VISIBLE in one frame and holding', () => {
      const frames = [
        frame(mark({ o: 0 }), 0),
        frame(mark({ o: 0 }), 16),
        frame(mark({ o: 0 }), 32),
        frame(mark({ o: 1 }), 48),
        frame(mark({ o: 1 }), 64),
        frame(mark({ o: 1 }), 80),
        frame(mark({ o: 1 }), 96)
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'arrival', mark: 'mark', at: 48 })
      );
    });

    it('reports opacity-step form: mark entering at low opacity (0.08) jumping to >= VISIBLE in one frame', () => {
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(mark({ o: 0.08 }), 32),
        frame(mark({ o: 1 }), 48),
        frame(mark({ o: 1 }), 64),
        frame(mark({ o: 1 }), 80),
        frame(mark({ o: 1 }), 96)
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'arrival', mark: 'mark', at: 48 })
      );
    });

    it('does not report arrivals when allowArrivals is false (hydration window)', () => {
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(mark({ o: 1 }), 32),
        frame(mark({ o: 1 }), 48),
        frame(mark({ o: 1 }), 64)
      ];
      const yanks = findYanks(frames, 'rows', frames.length - 1, TELEPORT_PX, false);
      expect(yanks.filter((y) => y.kind === 'arrival')).toEqual([]);
    });

    it('does not report marks present and visible from frame 0', () => {
      const frames = [
        frame(mark({ o: 1 }), 0),
        frame(mark({ o: 1 }), 16),
        frame(mark({ o: 1 }), 32),
        frame(mark({ o: 1 }), 48)
      ];
      expect(findYanks(frames, 'rows').filter((y) => y.kind === 'arrival')).toEqual([]);
    });

    it('does not report smooth entrance fades', () => {
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(mark({ o: 0.1 }), 32),
        frame(mark({ o: 0.3 }), 48),
        frame(mark({ o: 0.55 }), 64),
        frame(mark({ o: 0.8 }), 80),
        frame(mark({ o: 1 }), 96)
      ];
      expect(findYanks(frames, 'rows').filter((y) => y.kind === 'arrival')).toEqual([]);
    });

    it('does not report transient flicker that does not hold', () => {
      /* Present for only 1 frame */
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(mark({ o: 1 }), 32),
        frame(null, 48),
        frame(null, 64)
      ];
      expect(findYanks(frames, 'rows').filter((y) => y.kind === 'arrival')).toEqual([]);
    });

    it('does not report an element that mounts and travels into place (sliding sheet)', () => {
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(mark({ o: 1, y: 800 }), 32),
        frame(mark({ o: 1, y: 600 }), 48),
        frame(mark({ o: 1, y: 400 }), 64),
        frame(mark({ o: 1, y: 200 }), 80),
        frame(mark({ o: 1, y: 100 }), 96)
      ];
      expect(findYanks(frames, 'rows').filter((y) => y.kind === 'arrival')).toEqual([]);
    });

    it('reports arrival if element mounts and stays at resting destination', () => {
      const frames = [
        frame(null, 0),
        frame(null, 16),
        frame(mark({ o: 1, y: 100 }), 32),
        frame(mark({ o: 1, y: 100 }), 48),
        frame(mark({ o: 1, y: 100 }), 64),
        frame(mark({ o: 1, y: 100 }), 80),
        frame(mark({ o: 1, y: 100 }), 96)
      ];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'arrival', mark: 'mark', at: 32 })
      );
    });
  });

  describe('bloat - the field-blind shape (ticket 99 round 2, ticket 100)', () => {
    it('reports a mark that renders larger than its resting bounds for one frame', () => {
      const frames = [...still(8), frame(mark({ h: 520 }), 128), ...still(4)];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'bloat', mark: 'mark', frames: [8, 9] })
      );
    });

    it('reports it on the width axis alone', () => {
      const frames = [...still(8), frame(mark({ w: 380 }), 128), ...still(4)];
      expect(findYanks(frames, 'rows')).toContainEqual(
        expect.objectContaining({ kind: 'bloat', mark: 'mark' })
      );
    });

    it('reports it off the view-transition instrument, where the defect lived', () => {
      /* The blind's pseudo row: a clip that answers the full window for one
         frame before the real, capped extent settles. */
      const vt = (h, at) => ({
        at,
        active: true,
        rows: {},
        vt: { 'new(blind)': { x: 0, y: 0, w: 390, h, o: 1 } }
      });
      const frames = [
        vt(260, 0), vt(260, 16), vt(260, 32), vt(260, 48),
        vt(844, 64),
        vt(260, 80), vt(260, 96)
      ];
      expect(findYanks(frames, 'vt')).toContainEqual(
        expect.objectContaining({ kind: 'bloat', mark: 'new(blind)' })
      );
    });

    it('does not report growth under the pixel floor', () => {
      const frames = [...still(8), frame(mark({ h: 24 + BLOAT_PX - 1 }), 128), ...still(4)];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report a mark that grows and stays grown', () => {
      /* A layout change, not a yank: the run never comes back. */
      const frames = [...still(8), ...still(6, { h: 520 })];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report an animating box, whose neighbours are moving too', () => {
      /* The blind's own slide: 40px of height change per frame over the
         whole run, so no frame has stillness on both sides of it. */
      const frames = Array.from({ length: 14 }, (_, i) =>
        frame(mark({ h: 24 + i * 40, w: 100 }), i * 16)
      );
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report proportional jitter on a large mark', () => {
      /* 8px on a 300px-tall mark: over a sixth of the proof mark's own
         height, under every threshold a mark this size carries. */
      const frames = [...still(8, { h: 300 }), frame(mark({ h: 308, w: 100 }), 128), ...still(4, { h: 300 })];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });
  });

  describe('colour shape (ticket 136)', () => {
    it('persistent abrupt change: reports a mark whose colour jumps between two still frames and stays', () => {
      /* Resting at #888, then jumps to #e00 and stays - the redesign-07 defect shape */
      const frames = [
        ...still(6, { bg: '#888' }),
        frame(mark({ bg: '#e00' }), 96),
        ...still(4, { bg: '#e00' })
      ];
      expect(findYanks(frames, 'rows')).toContainEqual(
        expect.objectContaining({ kind: 'colour', mark: 'mark' })
      );
    });

    it('one-frame return: reports a mark whose colour flips for one frame and returns', () => {
      /* Resting at #888, one frame at #e00, then returns to #888 */
      const frames = [
        ...still(6, { bg: '#888' }),
        frame(mark({ bg: '#e00' }), 96),
        ...still(4, { bg: '#888' })
      ];
      expect(findYanks(frames, 'rows')).toContainEqual(
        expect.objectContaining({ kind: 'colour', mark: 'mark' })
      );
    });

    it('smooth theme interpolation: does not report when colour transitions smoothly across frames', () => {
      /* Smooth fade in lightness over 10 frames */
      const frames = Array.from({ length: 10 }, (_, i) =>
        frame(mark({ bg: `oklab(${0.8 - i * 0.04} 0 0)` }), i * 16)
      );
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('transparent-colour no-op: does not report when transparent colour values vary without visible change', () => {
      /* Transparent background variations: transparent -> rgba(0,0,0,0) -> rgba(255,0,0,0) */
      const frames = [
        ...still(4, { bg: 'transparent' }),
        frame(mark({ bg: 'rgba(0, 0, 0, 0)' }), 64),
        frame(mark({ bg: 'rgba(255, 0, 0, 0)' }), 80),
        ...still(4, { bg: 'transparent' })
      ];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report colour delta below the COLOR_DELTA floor', () => {
      /* Small step below COLOR_DELTA (0.14) */
      const frames = [
        ...still(6, { bg: 'oklab(0.70 0 0)' }),
        frame(mark({ bg: 'oklab(0.75 0 0)' }), 96),
        ...still(4, { bg: 'oklab(0.75 0 0)' })
      ];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report colour change when whole screen recolours (theme switch)', () => {
      /* 10 marks all change colour on the same frame */
      const multiMarkFrame = (bg, at) => {
        const rows = {};
        for (let m = 0; m < 10; m++) {
          rows[`mark-${m}`] = mark({ bg });
        }
        return { at, active: false, rows, vt: {} };
      };
      const frames = [
        ...Array.from({ length: 5 }, (_, i) => multiMarkFrame('#888', i * 16)),
        ...Array.from({ length: 5 }, (_, i) => multiMarkFrame('#e00', (5 + i) * 16))
      ];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('reports a border-only control whose border colour jumps and stays', () => {
      /* Border-only mark: no background, no text, only border */
      const frames = [
        ...still(6, { bg: undefined, fg: undefined, bc: '#888' }),
        frame(mark({ bg: undefined, fg: undefined, bc: '#e00' }), 96),
        ...still(4, { bg: undefined, fg: undefined, bc: '#e00' })
      ];
      expect(findYanks(frames, 'rows')).toContainEqual(
        expect.objectContaining({ kind: 'colour', mark: 'mark' })
      );
    });

    it('does not report when neither side has a visible border', () => {
      const frames = [
        ...still(6, { bg: undefined, fg: undefined, bc: undefined }),
        frame(mark({ bg: undefined, fg: undefined, bc: undefined }), 96),
        ...still(4, { bg: undefined, fg: undefined, bc: undefined })
      ];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });
  });
});

describe('scenesFor', () => {
  it('adds the proof scene only when proving', () => {
    expect(scenesFor().map((s) => s.name)).not.toContain('proof-injected-yanks');
    expect(scenesFor({ prove: true }).map((s) => s.name)[0]).toBe('proof-injected-yanks');
  });

  it('narrows to the named scenes', () => {
    expect(scenesFor({ only: ['mood-pick'] }).map((s) => s.name)).toEqual(['mood-pick']);
  });

  it('keeps the proof scene when narrowing a proof run', () => {
    expect(scenesFor({ prove: true, only: ['mood-pick'] }).map((s) => s.name)).toEqual([
      'proof-injected-yanks',
      'mood-pick'
    ]);
  });
});

describe('the hydration floor (ticket 108)', () => {
  /* The same spike, read at both floors: what the gesture sweep catches
   * at 14px, the hydration sweep lets pass until the ticket's own 24px. */
  const jump = (d) => [...still(6), frame(mark({ y: 20 + d }), 96), ...still(4, { y: 20 + d })];

  it('flags a jump over the hydration floor in a still window', () => {
    const frames = jump(30);
    expect(findYanks(frames, 'rows', frames.length - 1, HYDRATION_PX)).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
  });

  it('does not flag a jump the gesture floor catches but the ticket floor does not', () => {
    const frames = jump(TELEPORT_PX + 2);
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
    expect(findYanks(frames, 'rows', frames.length - 1, HYDRATION_PX)).toEqual([]);
  });
});

describe('findPixelYanks', () => {
  /* A 20x20 gray frame: small enough to build by hand, large enough that
   * a 6x6 block of changed pixels clears the transient and region floors
   * the real camera's thresholds impose. */
  const W = 20;
  const H = 20;
  const flat = (v) => new Uint8Array(W * H).fill(v);
  const withBlock = (v, x0, y0, bw, bh) => {
    const g = flat(v);
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) g[y * W + x] = 220;
    return g;
  };
  const ats = (n) => Array.from({ length: n }, (_, i) => i * 16);

  it('reports a block painted for one frame and gone again', () => {
    const grays = [flat(100), flat(100), withBlock(100, 4, 4, 6, 6), flat(100), flat(100)];
    const { findings } = findPixelYanks(grays, W, H, ats(5));
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'flash', frame: 2, areaPct: expect.closeTo(0.09, 2) })
    );
  });

  it('does not report a block that arrives and stays - a load, not a flash', () => {
    const grays = [flat(100), flat(100), withBlock(100, 4, 4, 6, 6), withBlock(100, 4, 4, 6, 6)];
    expect(findPixelYanks(grays, W, H, ats(4)).findings).toEqual([]);
  });

  it('does not report a column sliding one step a frame - motion, not a transient', () => {
    const slide = (x) => withBlock(100, x, 0, 1, H);
    const grays = [slide(3), slide(4), slide(5), slide(6), slide(7)];
    expect(findPixelYanks(grays, W, H, ats(5)).findings).toEqual([]);
  });

  it('reports a block absent for multiple frames and back (multi-frame dropout)', () => {
    const grays = [
      withBlock(100, 4, 4, 6, 6),
      withBlock(100, 4, 4, 6, 6),
      flat(100),
      flat(100),
      flat(100),
      withBlock(100, 4, 4, 6, 6),
      withBlock(100, 4, 4, 6, 6)
    ];
    const { findings } = findPixelYanks(grays, W, H, ats(7));
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'dropout', frame: 2, toFrame: 4, span: 3 })
    );
  });
});

describe('isBlankGray (ticket 192 - cross-document blank frames)', () => {
  const flat = (v, n = 400) => new Uint8Array(n).fill(v);

  it('reads a solid fill as blank, whatever its gray level', () => {
    expect(isBlankGray(flat(0))).toBe(true);
    expect(isBlankGray(flat(255))).toBe(true);
    expect(isBlankGray(flat(105))).toBe(true); // pure magenta's own luma
  });

  it('reads real content as not blank even when its mean lands on the sentinel gray', () => {
    // Half the frame at 0, half at 210: mean is ~105, same as flat(105)
    // above, but the spread is what a toast or a header actually looks
    // like - the bug the first (magenta, mean-matched) attempt had.
    const g = new Uint8Array(400);
    for (let i = 0; i < g.length; i++) g[i] = i < 200 ? 0 : 210;
    expect(isBlankGray(g)).toBe(false);
  });

  it('tolerates the antialiasing noise a lossless render still carries', () => {
    const g = flat(100);
    g[0] = 106; // inside DIFF_EPS
    expect(isBlankGray(g)).toBe(true);
  });
});

describe('hydrationScreensFor (ticket 108)', () => {
  it('adds the proof scene only when proving, and narrows to the named scenes', () => {
    const names = hydrationScreensFor().map((s) => s.name);
    expect(names).not.toContain('proof-injected-yanks');
    expect(hydrationScreensFor({ prove: true }).map((s) => s.name)[0]).toBe('proof-injected-yanks');
    expect(hydrationScreensFor({ only: ['stats'] }).map((s) => s.name)).toEqual(['stats']);
  });

  it('keeps the proof scene when narrowing a proof run', () => {
    expect(hydrationScreensFor({ prove: true, only: ['stats'] }).map((s) => s.name)).toEqual([
      'proof-injected-yanks',
      'stats'
    ]);
  });

  it('names every needs token it uses in HYDRATION_NEEDS', () => {
    for (const scene of hydrationScreensFor())
      if (scene.needs) expect(Object.keys(HYDRATION_NEEDS)).toContain(scene.needs);
  });

  it('carries the two prologue scenes exactly once each', () => {
    const names = hydrationScreensFor().map((s) => s.name);
    expect(names.filter((n) => n === 'onboarding-mount')).toHaveLength(1);
    expect(names.filter((n) => n === 'lock-gate')).toHaveLength(1);
  });

  it('gives every scene a name, a route and a description', () => {
    for (const scene of hydrationScreensFor())
      expect(scene).toEqual(
        expect.objectContaining({ name: expect.any(String), at: expect.any(String), is: expect.any(String) })
      );
  });
});

describe('colour distance arithmetic (ticket 136)', () => {
  it('oklab() versus rgb(): evaluates equivalence and distance between formats accurately', () => {
    // Exact red: rgb(255, 0, 0) in OKLab is oklab(0.627955 0.224863 0.125846)
    const rgbRed = parseCssColor('rgb(255, 0, 0)');
    const oklabRed = parseCssColor('oklab(0.627955 0.224863 0.125846)');
    expect(colorDistance(rgbRed, oklabRed)).toBeCloseTo(0, 4);

    // Exact white: rgb(255, 255, 255) vs oklab(1 0 0)
    expect(colorDistance('rgb(255, 255, 255)', 'oklab(1 0 0)')).toBeCloseTo(0, 4);

    // Distance between oklab and rgb forms of different colours
    const oklabGreen = 'oklab(0.5197 0.14 -0.1)';
    expect(colorDistance('rgb(255, 0, 0)', oklabGreen)).toBeGreaterThan(COLOR_DELTA);
  });

  it('parses rgb, rgba, oklab, color(srgb) and hex formats', () => {
    const rgb = parseCssColor('rgb(255, 0, 0)');
    const hex = parseCssColor('#f00');
    expect(colorDistance(rgb, hex)).toBeCloseTo(0, 4);

    const oklab = parseCssColor('oklab(0.7 0.1 -0.1)');
    expect(oklab[0]).toBeCloseTo(0.7, 3);
    expect(oklab[1]).toBeCloseTo(0.1, 3);
    expect(oklab[2]).toBeCloseTo(-0.1, 3);
    expect(oklab[3]).toBe(1);

    const srgb = parseCssColor('color(srgb 1 0 0)');
    expect(colorDistance(rgb, srgb)).toBeCloseTo(0, 4);
  });

  it('measures distance accurately for known colour defects', () => {
    /* Nonbinary yellow to olive/brown contrast-floor defect measures ~0.39 */
    const yellow = 'rgb(252, 244, 52)';
    const olive = 'rgb(138, 117, 0)';
    const dYellowOlive = colorDistance(yellow, olive);
    expect(dYellowOlive).toBeGreaterThan(0.35);
    expect(dYellowOlive).toBeGreaterThan(COLOR_DELTA);

    /* Pure red to green hue flip (identical luma 76) measures ~0.38 */
    const red = 'rgb(255, 0, 0)';
    const green = 'rgb(0, 129, 0)';
    const dRedGreen = colorDistance(red, green);
    expect(dRedGreen).toBeGreaterThan(0.35);
    expect(dRedGreen).toBeGreaterThan(COLOR_DELTA);
  });

  it('treats transparent-to-transparent as zero distance', () => {
    expect(colorDistance('transparent', 'rgba(0, 0, 0, 0)')).toBe(0);
    expect(colorDistance('rgba(255, 0, 0, 0)', 'rgba(0, 0, 0, 0)')).toBe(0);
  });

  it('ignores fully transparent paint regardless of raw RGB channels', () => {
    // Red transparent vs green transparent: raw channels differ maximally, but both alpha 0
    expect(colorDistance('rgba(255, 0, 0, 0)', 'rgba(0, 255, 0, 0)')).toBe(0);
  });

  it('compares rendered alpha rather than raw channels', () => {
    // Same raw RGB, different alpha: rendered alpha produces distance
    const d = colorDistance('rgba(255, 0, 0, 1)', 'rgba(255, 0, 0, 0.2)');
    expect(d).toBeGreaterThan(COLOR_DELTA);
  });

  it('measures appearance when transitioning from transparent to opaque', () => {
    const d = colorDistance('rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)');
    expect(d).toBeGreaterThan(COLOR_DELTA);
  });

  describe('missingProofYanks (ticket 137)', () => {
    const allSix = [
      { mark: `${PROOF.teleport}foo`, kind: 'teleport' },
      { mark: `${PROOF.vanish}foo`, kind: 'vanish' },
      { mark: `${PROOF.bloat}foo`, kind: 'bloat' },
      { mark: `${PROOF.colour}foo`, kind: 'colour' },
      { mark: `${PROOF.thereAndBack}foo`, kind: 'there-and-back' },
      { mark: `${PROOF.arrival}foo`, kind: 'arrival' }
    ];

    it('passes when all six injected marks are present', () => {
      const report = [{ scene: PROOF.scene, yanks: allSix }];
      expect(missingProofYanks(report)).toEqual([]);
    });

    it('reports missing there-and-back and arrival when omitted', () => {
      const partial = allSix.slice(0, 4); // Only the first four
      const report = [{ scene: PROOF.scene, yanks: partial }];
      const missing = missingProofYanks(report);
      expect(missing).toContainEqual(expect.stringContaining('there-and-back'));
      expect(missing).toContainEqual(expect.stringContaining('arrival'));
    });

    it('checks each proof pass, not only the first', () => {
      const report = [
        { scene: PROOF.scene, profile: 'persona', theme: 'light', pass: 1, yanks: allSix },
        { scene: PROOF.scene, profile: 'persona', theme: 'light', pass: 2, yanks: [] }
      ];
      expect(missingProofYanks(report)).toContainEqual(expect.stringContaining('pass 2: a 200px jump'));
      expect(missingProofYanks(report).some((item) => item.includes('pass 1'))).toBe(false);
    });

    it('does not check arrival when checkArrival is false (hydration window)', () => {
      const fiveYanks = allSix.filter((y) => y.kind !== 'arrival');
      const report = [{ scene: PROOF.scene, styleYanks: fiveYanks }];
      expect(missingProofYanks(report, { checkArrival: false })).toEqual([]);
    });
  });
});

/* Ticket 140. The WebView's devtools socket closes the connection for any
   reply of 4 MiB or more - measured on the Pixel 10a (Vanadium 153): a
   3.9 MB string comes back, 4.0 MB drops the socket, every time. The
   sampler's frame table passes that on the app's densest screens, so the
   device harness stringifies it page-side and pulls it back in slices.
   What can be tested away from a phone is the arithmetic that cuts them. */
describe('replySlices', () => {
  it('returns one slice when the reply is already under the cap', () => {
    expect(replySlices(500, 1000)).toEqual([[0, 500]]);
  });

  it('covers the whole string with no gap and no overlap', () => {
    const slices = replySlices(2500, 1000);
    expect(slices[0][0]).toBe(0);
    expect(slices.at(-1)[1]).toBe(2500);
    for (let i = 1; i < slices.length; i++) expect(slices[i][0]).toBe(slices[i - 1][1]);
  });

  it('never cuts a slice longer than the cap', () => {
    for (const [from, to] of replySlices(5_764_000, 1_048_576)) expect(to - from).toBeLessThanOrEqual(1_048_576);
  });

  it('cuts /settings 5.76 MB reply into slices the socket carries', () => {
    /* The measured payload: 178 marks over 211 frames. Every slice has to
       leave room for the JSON the reply wraps it in, so the cap is a
       quarter of the socket's own 4 MiB. */
    const slices = replySlices(5_764_022, 1_048_576);
    expect(slices).toHaveLength(6);
    expect(slices.at(-1)[1]).toBe(5_764_022);
  });

  it('has nothing to cut for an empty reply', () => {
    expect(replySlices(0, 1000)).toEqual([]);
  });
});

describe('scraping a detail id off a list screen (ux-carpet 235)', () => {
  /** Runs a page expression against a stand-in document, the way
   *  page.evaluate would: `hrefs` are its links, `cards` the elements a
   *  card selector can match, keyed by that selector. */
  const onPage = async (expression, { hrefs = [], cards = {} } = {}) => {
    const link = (href) => ({ getAttribute: () => href });
    globalThis.document = {
      querySelectorAll: (sel) => {
        const prefix = /^a\[href\^="(.*)"\]$/.exec(sel)?.[1];
        return prefix === undefined ? [] : hrefs.filter((h) => h.startsWith(prefix)).map(link);
      },
      querySelector: (sel) => (sel in cards ? { getAttribute: () => cards[sel] } : null)
    };
    try {
      return await (0, eval)(expression);
    } finally {
      delete globalThis.document;
    }
  };
  const quick = { waitMs: 0 };

  it('reads the id after the prefix, past a list\'s add-a-day cells', async () => {
    const hrefs = ['/', '/entry/new/20000', '/entry/660'];
    expect(await onPage(scrapeIdExpression(HYDRATION_NEEDS.entry, quick), { hrefs })).toBe('660');
  });

  it('takes no add control or deeper route for a record', async () => {
    const hrefs = ['/transition/tryouts/new', '/transition/tryouts/abc/photos', '/transition/tryouts/?x=1'];
    expect(await onPage(scrapeIdExpression(HYDRATION_NEEDS.tryout, quick), { hrefs })).toBeNull();
  });

  it('drops a query or hash from the id', async () => {
    const hrefs = ['/media/documents/d-1?from=list'];
    expect(await onPage(scrapeIdExpression(HYDRATION_NEEDS.document, quick), { hrefs })).toBe('d-1');
  });

  it('reads a letter off its card, an unsealed one before a sealed one', async () => {
    const [unsealed, any] = HYDRATION_NEEDS.letter.cards;
    expect(await onPage(scrapeIdExpression(HYDRATION_NEEDS.letter, quick), { cards: { [any]: 'sealed-1', [unsealed]: 'open-1' } })).toBe('open-1');
    expect(await onPage(scrapeIdExpression(HYDRATION_NEEDS.letter, quick), { cards: { [any]: 'sealed-1' } })).toBe('sealed-1');
  });

  it('waits for rows that draw after the list settles', async () => {
    const hrefs = [];
    setTimeout(() => hrefs.push('/search/questions/q-7'), 150);
    expect(await onPage(scrapeIdExpression(HYDRATION_NEEDS.question, { waitMs: 1000 }), { hrefs })).toBe('q-7');
  });

  it('marks reminders as a list only the device can read', () => {
    expect(HYDRATION_NEEDS.reminder.androidOnly).toBe(true);
  });
});
