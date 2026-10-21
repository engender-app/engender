import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('removed hormone curve', () => {
  it('sends both former addresses to the unknown-address screen', () => {
    expect(existsSync(root + 'src/routes/care/curve/+page.svelte')).toBe(false);
    expect(existsSync(root + 'src/routes/settings/hormone-curve/+page.ts')).toBe(false);
    expect(existsSync(root + 'src/lib/navigation/movedAddresses.ts')).toBe(false);
    expect(read('src/routes/+error.svelte')).toContain("data-error-screen={notFound ? 'not-found' : 'failed'}");
  });

  it('removes the Care row and direction read', () => {
    const care = read('src/routes/care/+page.svelte');
    expect(care).not.toContain('href="/care/curve"');
    expect(care).not.toContain('getCurveDirection');
  });

  it('removes the fit preference and curve model from the journal', () => {
    expect(read('src/lib/data/prefs/catalogue.ts')).not.toContain('hormoneCurveFitToOwnLabs');
    expect(read('src/lib/data/journal/journal.ts')).not.toContain('hormoneCurve:');
    expect(existsSync(root + 'src/lib/data/hormoneCurveModels.ts')).toBe(false);
  });
});
