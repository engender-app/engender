import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { androidVersionCode } from '../scripts/android-version.mjs';

const root = new URL('../fastlane/metadata/android/', import.meta.url);

describe('store listing metadata', () => {
  it('ships six phone screens and store artwork at the required pixel sizes', () => {
    for (const locale of ['en-US', 'pl-PL']) {
      const screenshots = readdirSync(new URL(`${locale}/images/phoneScreenshots/`, root)).sort();
      expect(screenshots).toEqual(['01-home.png', '02-new-entry.png', '03-journal.png', '04-care.png', '05-look-back.png', '06-settings-privacy.png']);
      for (const [file, width, height] of [
        ['icon.png', 512, 512], ['featureGraphic.png', 1024, 500],
        ...screenshots.map((file) => [`phoneScreenshots/${file}`, 1080, 1920] as const)
      ] as const) {
        const png = readFileSync(new URL(`${locale}/images/${file}`, root));
        expect(png.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a');
        expect([png.readUInt32BE(16), png.readUInt32BE(20)], file).toEqual([width, height]);
        if (file === 'featureGraphic.png') expect(png[25], 'feature graphic has no alpha').toBe(2);
      }
    }
  });

  it('ships both languages within Play text limits and maps release notes to the APK version code', () => {
    for (const locale of ['en-US', 'pl-PL']) {
      for (const [file, limit] of [['title.txt', 30], ['short_description.txt', 80], ['full_description.txt', 4000], [`changelogs/${androidVersionCode('1.0.0')}.txt`, 500]] as const) {
        const text = readFileSync(new URL(`${locale}/${file}`, root), 'utf8').trim();
        expect(Array.from(text).length, `${locale}/${file}`).toBeGreaterThan(0);
        expect(Array.from(text).length, `${locale}/${file}`).toBeLessThanOrEqual(limit);
        expect(text).not.toMatch(/Gender Diary|Gate:|^>/m);
      }
    }
  });
});
