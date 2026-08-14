import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const layout = read('src/routes/+layout.svelte');

describe('android back button wiring', () => {
  it('attaches an App backButton listener in the app shell', () => {
    expect(layout).toMatch(/addListener\('backButton'/);
  });

  it('navigates in-app before minimizing to home', () => {
    expect(layout).toMatch(/window\.history\.back\(\)/);
    expect(layout).toMatch(/minimizeApp\(\)/);
  });
});
