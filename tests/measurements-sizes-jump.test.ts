import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const measurements = read('src/routes/body/measurements/+page.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('measurements sizes jump contract (pre-production UI/UX 29)', () => {
  it('supplies translation keys in both English and Polish catalogues', () => {
    const keys = ['measurements_jump_label', 'measurements_jump_measurements', 'measurements_jump_back_aria'];
    for (const key of keys) {
      expect(en[key], `en missing ${key}`).toBeDefined();
      expect(pl[key], `pl missing ${key}`).toBeDefined();
      expect(en[key]).not.toContain('%');
      expect(pl[key]).not.toContain('%');
    }
  });

  it('names both halves in the jump options, reusing the sizes heading string', () => {
    expect(measurements).toContain('m.measurements_jump_measurements()');
    expect(measurements).toContain('label: m.size_log()');
  });

  it('anchors the measurements picker and the sizes heading', () => {
    expect(measurements).toContain('id="measurements-reading"');
    expect(measurements).toMatch(/<SectionHeading id="sizes-log"/);
  });

  it('keeps the size log add control on its heading', () => {
    expect(measurements).toContain('data-add-size');
  });
});
