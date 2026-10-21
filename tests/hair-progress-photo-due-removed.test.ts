/* FA 23: the 28-day "photo due" prompt is gone from hair progress. The
   photos, their comparison and the protocol notice stay. */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = readFileSync(root + 'src/routes/body/hair-progress/+page.svelte', 'utf8');
const en = JSON.parse(readFileSync(root + 'messages/en.json', 'utf8'));

it('hair progress has no photo-due prompt and no schedule behind one', () => {
  expect(page).not.toContain('data-photo-due');
  expect(page).not.toContain('hairPhotoSchedule');
  expect(existsSync(root + 'src/lib/data/hairPhotoSchedule.ts')).toBe(false);
  expect(en.hair_photo_time_title).toBeUndefined();
});

it('the photos stay', () => {
  expect(page).toContain('<PhotoSection');
  expect(page).toContain('data-hair-compare');
});
