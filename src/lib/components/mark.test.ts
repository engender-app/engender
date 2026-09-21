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
  MARK_SAFE_TILE,
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
       Home's sun is centred too (ticket 38, settled 2026-09-21). A launcher
       mask used to cut that corner off, because the tile bled to the canvas
       edge; it no longer reaches the mask at all, since the tile sits inside
       the circle every mask keeps (MARK_SAFE_TILE). */
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
    /* Inset by half a seam, which is where the clip stops too: the edge's
       centre line and the clip are one path, and the stroke's outer half is
       the silhouette. */
    expect(svg).toContain(
      `<rect x="1.5" y="1.5" width="${100 - MARK_SEAM}" height="${100 - MARK_SEAM}"`
      + ` rx="${(MARK_TILE_RADIUS - MARK_SEAM / 2).toFixed(2)}" fill="none" stroke="#000" stroke-width="${MARK_SEAM}"/>`
    );
  });

  it('draws its edge outside the clip, so the silhouette rasterises once', () => {
    /* Chromium antialiases a clip path per element rather than over a
       flattened group, so a white ground clipped to the silhouette keeps a
       boundary of its own that a stroke inside the same clip cannot cover:
       partial white plus partial ink is lighter than ink, which is the halo
       Alicja caught. The edge therefore sits after the clipped group and is
       not clipped at all, and the clip stops on the edge's centre line so
       the stroke's inner half covers what it clipped.

       tests/mark-edge-fringe.mjs is what measures the result; this is only
       the shape of the markup that produces it. */
    for (const crop of ['tile', 'round'] as const) {
      const svg = markSvg(flags.trans, crop, 512);
      const closed = svg.indexOf('</g>');
      const edge = svg.lastIndexOf('stroke-width="3"/>');
      expect(closed, crop).toBeGreaterThan(-1);
      expect(edge, crop).toBeGreaterThan(closed);
    }
  });
});

describe('the monochrome mark', () => {
  it('is four rings whatever the flag, because one colour has no bands to count', () => {
    for (const [name, stripes] of Object.entries(flags)) {
      expect(circles(markSvg(stripes, 'tile', 512, { ink: '#1E1B16' })), name).toHaveLength(
        MARK_MONO_RINGS
      );
    }
    /* Including with no flag at all, which is what a printed page and the
       disguise fallback hand it. */
    expect(circles(markSvg([], 'tile', 512, { ink: '#1E1B16' }))).toHaveLength(MARK_MONO_RINGS);
  });

  it('is one ink and outlines, with no band fills to reproduce', () => {
    for (const circle of circles(markSvg(flags.trans, 'tile', 512, { ink: '#1E1B16' }))) {
      expect(circle).toContain('fill="none"');
      expect(circle).toContain('stroke="#1E1B16"');
    }
  });

  it('keeps its square, in the same ink, and drops the ground', () => {
    /* "THE STROKE IS AN INTEGRAL PART OF THE LOGO! THERE IS NO LOGO WITHOUT
       THE STROKE!" (Alicja, 2026-09-21). One ink means the edge is that ink
       too, not a second colour, and paper is the ground, so nothing is
       painted under it. */
    const svg = markSvg(flags.trans, 'tile', 512, { ink: '#1E1B16' });
    expect(svg).toMatch(/<rect x="1\.5"[^>]*stroke="#1E1B16"/);
    expect(svg).not.toMatch(/<rect[^>]*fill="#/);
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

  it('keeps the black edge whatever mask a launcher cuts, by drawing small', () => {
    /* Alicja, 2026-09-21: "no stroke around the square, or its white - its
       supposed to be black always". A launcher picks its own mask, so the
       only arrangement where that is true is the whole stroked tile inside
       the circle every mask keeps - ground to the corners, tile in the
       middle at MARK_SAFE_TILE. */
    const svg = markSvg(flags.trans, 'bleed', 512);
    const offset = (100 - MARK_SAFE_TILE) / 2;
    expect(svg).toContain(`<rect width="100" height="100" fill="${MARK_TILE}"/>`);
    expect(svg).toContain(`<g transform="translate(${offset},${offset}) scale(${MARK_SAFE_TILE / 100})">`);
    expect(svg).toContain(markSvg(flags.trans, 'tile', 100).replace(/^<svg[^>]*>|<\/svg>$/g, ''));
  });

  it('draws its tile inside the circle every launcher mask keeps', () => {
    /* Android guarantees the central 72dp of 108, radius 33.33 in these
       units. A rounded square of half-side a with corner radius 0.3a reaches
       1.29a from the middle, so the whole outline is inside the guarantee
       only while that is under 33.33. This is the arithmetic, not a
       restatement of the constant. */
    const a = MARK_SAFE_TILE / 2;
    const corner = (MARK_TILE_RADIUS / 100) * MARK_SAFE_TILE;
    expect(Math.SQRT2 * (a - corner) + corner).toBeLessThanOrEqual((72 / 108) * 50);
  });

  it('names its clip path after the crop by default', () => {
    for (const crop of ['tile', 'round'] as const) {
      expect(markSvg(flags.trans, crop, 512), crop).toContain(`<clipPath id="mark-${crop}">`);
    }
  });

  it('takes an id for that clip path, because a document can hold two marks', () => {
    /* A file holds one mark and the crop's own name is unique in it. A
       screen can hold more than one element, so Mark.svelte mints its own
       with $props.id() - two of the same id would not be valid, even where
       both resolve to the same shape. */
    const svg = markSvg(flags.trans, 'tile', 48, { id: 's7' });
    expect(svg).toContain('<clipPath id="s7">');
    expect(svg).toContain('clip-path="url(#s7)"');
    expect(svg).not.toContain('mark-tile');
  });

  it('paints the white tile under a mark that is not in one ink', () => {
    expect(markSvg(flags.trans, 'tile', 48)).toContain(`<rect width="100" height="100" fill="${MARK_TILE}"/>`);
  });

  it('is decorative unless it is given a name', () => {
    expect(markSvg(flags.trans, 'tile', 48)).toContain('aria-hidden="true"');
    const named = markSvg(flags.trans, 'tile', 512, { label: 'engender' });
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="engender"');
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

  /* What is banned is anything that changes over time, which is not the same
     as the word "transform": `bleed` lays its tile in the middle of the
     canvas with a static SVG transform attribute, and a drawing that is in
     one place and stays there is not motion. So `transform:` - the CSS
     property, the one a transition or an animation drives - is what fails
     here, along with SVG's own SMIL elements. */
  const BANNED = [
    'animation',
    'transition',
    'view-transition-name',
    'transform:',
    '@keyframes',
    '<animate',
    'in:',
    'out:'
  ];

  for (const [name, source] of Object.entries(sources)) {
    it(`${name} emits nothing that changes over time`, () => {
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      for (const word of BANNED) {
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
