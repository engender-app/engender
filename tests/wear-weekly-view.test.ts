import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const route = readFileSync(`${root}/src/routes/body/wear/+page.svelte`, 'utf8');
const chart = readFileSync(`${root}/src/lib/components/WearTrendChart.svelte`, 'utf8');

test('Wear shows weekly hours without region, dose, interval or mode overlays', () => {
  expect(route).toContain('weeklyWearHours(');
  expect(route).not.toContain('bodyRegionTrend(');
  expect(route).not.toContain('dayAxisState(');
  expect(route).not.toContain('PresentationChipRow');
  expect(chart).not.toContain('regionPoints');
  expect(chart).not.toContain('highlight');
});
