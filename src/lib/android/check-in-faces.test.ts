import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOOD_BLOCK, MOOD_EYE_RADIUS, MOOD_EYES, MOOD_FACES } from '../components/moodFace';

/* The check-in notification's faces are Android vector drawables (tester
   report 02, ticket 05), because a notification is drawn by the system and
   cannot run MoodFace.svelte. moodFace.ts says why there is one table of
   faces: a mood that smiles differently on another surface is another mood.
   These checks hold the drawables to that table and their colours to
   palettes.css, so a redrawn face or a moved ramp fails here instead of
   drifting on the one surface nobody screenshots. */

const root = resolve(__dirname, '../../..');
const res = (path: string) => readFileSync(resolve(root, 'android/app/src/main/res', path), 'utf8');
const palettes = readFileSync(resolve(root, 'src/lib/theme/palettes.css'), 'utf8');

function cssBlock(selector: string): Record<string, string> {
  const start = palettes.indexOf(`${selector} {`);
  expect(start, `palettes.css has no ${selector}`).toBeGreaterThanOrEqual(0);
  const body = palettes.slice(start, palettes.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}

function androidColours(path: string): Record<string, string> {
  return Object.fromEntries([...res(path).matchAll(/<color name="([\w]+)">(#[0-9A-Fa-f]+)<\/color>/g)]
    .map(([, k, v]) => [k, v.toUpperCase()]));
}

const n = (v: number) => String(Number(v.toFixed(4)));

function blockPath(): string {
  const { x, y, size, radius: r } = MOOD_BLOCK;
  const far = x + size;
  return `M${n(x + r)},${n(y)} L${n(far - r)},${n(y)} A${n(r)},${n(r)} 0 0 1 ${n(far)},${n(y + r)} ` +
    `L${n(far)},${n(far - r)} A${n(r)},${n(r)} 0 0 1 ${n(far - r)},${n(far)} ` +
    `L${n(x + r)},${n(far)} A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(far - r)} ` +
    `L${n(x)},${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${n(y)} Z`;
}

function eyePath(cx: number, cy: number): string {
  const r = MOOD_EYE_RADIUS;
  return `M${n(cx - r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)} ` +
    `A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)} Z`;
}

function paths(step: number): Array<Record<string, string>> {
  return [...res(`drawable/check_in_mood_${step}.xml`).matchAll(/<path([^>]*)\/>/g)].map(([, attrs]) =>
    Object.fromEntries([...attrs.matchAll(/android:(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v])));
}

describe('check-in notification faces', () => {
  for (const step of [1, 2, 3, 4, 5]) {
    describe(`step ${step}`, () => {
      const face = MOOD_FACES[step];

      it('draws the block in the step colour with the outline', () => {
        const [block] = paths(step);
        expect(block.pathData).toBe(blockPath());
        expect(block.fillColor).toBe(`@color/check_in_mood_${step}`);
        expect(block.strokeColor).toBe('@color/check_in_mood_outline');
        expect(block.strokeWidth).toBe('1');
      });

      it('draws the eyes moodFace.ts draws', () => {
        const drawn = paths(step).slice(1, -1);
        if (face.lids) {
          expect(drawn).toEqual([{ pathData: face.lids, strokeColor: `@color/check_in_mood_${step}_ink`,
            strokeWidth: '1.9', strokeLineCap: 'round', fillColor: '#00000000' }]);
        } else {
          expect(drawn).toEqual(MOOD_EYES.map(({ cx, cy }) => ({
            pathData: eyePath(cx, cy), fillColor: `@color/check_in_mood_${step}_ink` })));
        }
      });

      it('draws the mouth moodFace.ts draws', () => {
        expect(paths(step).at(-1)).toEqual({ pathData: face.mouth, strokeColor: `@color/check_in_mood_${step}_ink`,
          strokeWidth: '1.9', strokeLineCap: 'round', fillColor: '#00000000' });
      });
    });
  }

  for (const [theme, folder] of [['light', 'values'], ['dark', 'values-night']] as const) {
    it(`uses the teal ramp and its inks on ${theme}`, () => {
      const ramp = cssBlock(`[data-mood-preset="teal"][data-theme="${theme}"]`);
      const text = cssBlock(`[data-palette="trans"][data-theme="${theme}"]`)['--text'].toUpperCase();
      const colours = androidColours(`${folder}/check_in_faces.xml`);
      for (const step of [1, 2, 3, 4, 5]) {
        expect(colours[`check_in_mood_${step}`]).toBe(ramp[`--mood-${step}`].toUpperCase());
        const ink = ramp[`--mood-${step}-ink`];
        expect(colours[`check_in_mood_${step}_ink`]).toBe(ink === 'var(--text)' ? text : ink.toUpperCase());
      }
      // --outline: the text colour at 19%, 0x30 of 0xFF.
      expect(colours.check_in_mood_outline).toBe(`#30${text.slice(1)}`);
    });
  }
});
