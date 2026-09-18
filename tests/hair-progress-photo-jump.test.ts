import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const hairProgress = read('src/routes/body/hair-progress/+page.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('hair progress photo jump contract (pre-production UI/UX 27)', () => {
  it('supplies translation keys in both English and Polish catalogues', () => {
    const keys = [
      'hair_jump_label',
      'hair_jump_photos',
      'hair_jump_staging_aria'
    ];
    for (const key of keys) {
      expect(en[key], `en missing ${key}`).toBeDefined();
      expect(pl[key], `pl missing ${key}`).toBeDefined();
      expect(en[key]).not.toContain('%');
      expect(pl[key]).not.toContain('%');
    }
  });

  it('reuses hair_stage_section_title for the staging option to avoid duplication', () => {
    expect(hairProgress).toContain('m.hair_stage_section_title()');
  });

  it('renders an in-page section choice with Segmented', () => {
    expect(hairProgress).toContain("from '$lib/components/Segmented.svelte'");
    expect(hairProgress).toContain('data-hair-jump');
    expect(hairProgress).toMatch(/<Segmented[\s\S]*?compact/);
  });

  it('anchors the staging and photo sections with identifiers', () => {
    expect(hairProgress).toMatch(/id="hair-staging"/);
    expect(hairProgress).toMatch(/id="hair-photos"/);
  });

  it('provides a jump back to staging from the photographs section', () => {
    expect(hairProgress).toContain('data-jump-staging');
  });

  it('preserves existing staging, photo, and anchor editors without split modules', () => {
    expect(hairProgress).toContain('stageRecord');
    expect(hairProgress).toContain('hairPhotos');
    expect(hairProgress).toContain('anchorEditor');
    expect(hairProgress).toContain('<PhotoWipe');
    expect(hairProgress).toContain('<PhotoSection');
  });
});
