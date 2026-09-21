/* The mark's numbers and its stillness (ticket 50).

   Two different kinds of assertion live here and both are deliberate.

   The numbers are pinned rather than derived, because they are a decision
   and not a calculation: Alicja moved the sliders on 2026-09-21 and said
   keep this one. Nothing computes 3 or 15 from anything else, so the only
   thing that can stop them drifting is a test that fails when they move and
   makes whoever moved them come here and mean it.

   The stillness is read off the source text of this module and of
   Mark.svelte, which is a grep and knows it. A rendered assertion would be
   better and cannot be had here: the mark has no state to drive, so there
   is no frame to sample and nothing to catch except the words that would
   introduce motion in the first place. "The logos ARE NOT SUPPOSED TO MOVE
   AT ALL" (Alicja, 2026-09-21) is a rule about what may be written, and
   this is that rule written down. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  MARK_MONO_RINGS,
  MARK_R,
  MARK_SEAM,
  MARK_TILE,
  MARK_TILE_RADIUS,
  markSvg
} from './mark.ts';
import { parseMotifStripes, ringRadii } from '../motion/flagSun.ts';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** The same eight flags the app ships, read off the stylesheet that owns
    them rather than a second list here. */
function palettes(): Record<string, string[]> {
  const css = read('src/lib/theme/palettes.css');
  const out: Record<string, string[]> = {};
  for (const match of css.matchAll(/\[data-palette="([^"]+)"\]\s*\{\s*--motif-stripes:\s*([^;]+);/g)) {
    out[match[1]] = parseMotifStripes(match[2]);
  }
  return out;
}

const flags = palettes();
const circles = (svg: string) => [...svg.matchAll(/<circle[^>]*>/g)].map((m) => m[0]);

describe("the mark's signed-off numbers", () => {
  it('is the geometry Alicja picked: R 100, centre 0, seam 3, tile radius 15', () => {
    expect([MARK_R, MARK_SEAM, MARK_TILE_RADIUS]).toEqual([100, 3, 15]);
    expect(MARK_TILE).toBe('#FFFFFF');
  });

  it('centres the sun exactly on the tile\'s top right corner', () => {
    /* Centre 0 means the sun's centre is the corner itself, which is where
       Home's sun is centred too. A round launcher throws that corner away
       and crops the innermost disc off; that is accepted rather than worked
       around, because one geometry is worth more than a second setting kept
       in sync (ticket 38, settled 2026-09-21). */
    for (const circle of circles(markSvg(flags.trans, 'tile', 512))) {
      expect(circle).toContain('cx="100"');
      expect(circle).toContain('cy="0"');
    }
  });

  it('draws the same ring rule the sun does, one ring per stripe, every flag', () => {
    for (const [name, stripes] of Object.entries(flags)) {
      const drawn = circles(markSvg(stripes, 'tile', 512));
      expect(drawn, name).toHaveLength(stripes.length);
      const expected = ringRadii(stripes.length, MARK_R).map((r) => (r - MARK_SEAM / 2).toFixed(2));
      expect(drawn.map((c) => /r="([\d.]+)"/.exec(c)![1]), name).toEqual(expected);
    }
  });

  it("paints every band at the flag's own hex, outermost stripe outermost", () => {
    for (const [name, stripes] of Object.entries(flags)) {
      const drawn = circles(markSvg(stripes, 'tile', 512));
      expect(drawn.map((c) => /fill="(#[0-9A-Fa-f]{6})"/.exec(c)![1]), name).toEqual(stripes);
    }
  });

  it('gives every ring a black edge on its outer side, and the tile one too', () => {
    const svg = markSvg(flags.rainbow, 'tile', 512);
    for (const circle of circles(svg)) {
      expect(circle).toContain('stroke="#000"');
      expect(circle).toContain(`stroke-width="${MARK_SEAM}"`);
    }
    expect(svg).toMatch(/<rect x="1.5" y="1.5"[^>]*stroke="#000"/);
  });
});

describe('the monochrome mark', () => {
  it('is four rings whatever the flag, because one colour has no bands to count', () => {
    for (const [name, stripes] of Object.entries(flags)) {
      expect(circles(markSvg(stripes, 'bare', 512, { ink: '#1E1B16' })), name).toHaveLength(
        MARK_MONO_RINGS
      );
    }
    /* Including with no flag at all, which is what a printed page and the
       disguise fallback hand it. */
    expect(circles(markSvg([], 'bare', 512, { ink: '#1E1B16' }))).toHaveLength(MARK_MONO_RINGS);
  });

  it('is one ink and outlines, with no band fills to reproduce', () => {
    for (const circle of circles(markSvg(flags.trans, 'bare', 512, { ink: '#1E1B16' }))) {
      expect(circle).toContain('fill="none"');
      expect(circle).toContain('stroke="#1E1B16"');
    }
  });
});

describe('the tile belongs to the icon, not to the app', () => {
  it('gives a cropped mark the white tile and its own black edge', () => {
    for (const crop of ['tile', 'round'] as const) {
      const svg = markSvg(flags.trans, crop, 512);
      expect(svg, crop).toContain(`fill="${MARK_TILE}"`);
      expect(svg, crop).toMatch(/stroke="#000"[^>]*\/><\/g>|<(rect|circle)[^>]*fill="none"[^>]*stroke="#000"/);
    }
  });

  it('bleeds to its corners with no edge, because an adaptive mask crops one off', () => {
    const svg = markSvg(flags.trans, 'bleed', 512);
    expect(svg).toContain('<rect width="100" height="100" fill="#FFFFFF"/>');
    expect(svg).not.toMatch(/<rect[^>]*fill="none"/);
  });

  it('emits a clip path only where the crop is not the viewBox itself', () => {
    /* A clip path needs an id, and an id has to be unique in a document. The
       two crops the app draws carry none, so two marks on one screen cannot
       collide; the two that do are only ever written to a file of their own. */
    for (const crop of ['bare', 'bleed'] as const) {
      expect(markSvg(flags.trans, crop, 48), crop).not.toContain('clipPath');
    }
    for (const crop of ['tile', 'round'] as const) {
      expect(markSvg(flags.trans, crop, 512), crop).toContain(`<clipPath id="mark-${crop}">`);
    }
  });

  it('leaves the app\'s own mark bare: no tile, no ground, no edge', () => {
    /* A white chip on every dark screen is not the app's surface language
       (DIRECTION rule 4). */
    /* Asserted as "no painted rectangle" rather than "no white": trans's
       own middle stripe is #FFFFFF, and a band is not a ground. */
    const svg = markSvg(flags.trans, 'bare', 48);
    expect(svg).not.toMatch(/<rect[^>]*fill=/);
    expect(markSvg(flags.trans, 'tile', 48)).toContain(`<rect width="100" height="100" fill="${MARK_TILE}"/>`);
  });

  it('is decorative unless it is given a name', () => {
    expect(markSvg(flags.trans, 'bare', 48)).toContain('aria-hidden="true"');
    const named = markSvg(flags.trans, 'tile', 512, { label: 'enGender' });
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="enGender"');
  });
});

describe('the mark never moves', () => {
  /* Alicja, 2026-09-21, unprompted mid-round: "the logos ARE NOT SUPPOSED
     TO MOVE AT ALL". No entrance, no breathing, no hover, no
     view-transition name, on any surface. Home's sun keeps its 700ms
     entrance and its 7s loop, because that is the motif on a screen and not
     the mark - which is why the two must not share a module. */
  const sources = {
    'mark.ts': read('src/lib/components/mark.ts'),
    'Mark.svelte': read('src/lib/components/Mark.svelte')
  };

  for (const [name, source] of Object.entries(sources)) {
    it(`${name} emits no animation, transition or view-transition name`, () => {
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      for (const word of [
        'animation',
        'transition',
        'view-transition-name',
        'transform',
        '@keyframes',
        'in:',
        'out:'
      ]) {
        expect(body, `${name} mentions ${word}`).not.toContain(word);
      }
    });
  }

  it('does not reach into the motion system for anything but the ring rule', () => {
    /* flagSun.ts is where ringRadii lives, and it is the only thing under
       $lib/motion the mark is allowed to know about. */
    const imports = [...sources['mark.ts'].matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((path) => path.includes('motion'))).toEqual(['../motion/flagSun.ts']);
    expect(sources['Mark.svelte']).not.toContain('$lib/motion');
  });
});
