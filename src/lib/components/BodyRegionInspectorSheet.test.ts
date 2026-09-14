import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const sheetFile = readFileSync(root + '/src/lib/components/BodyRegionInspectorSheet.svelte', 'utf8');
const pageFile = readFileSync(root + '/src/routes/body-map/+page.svelte', 'utf8');

describe('BodyRegionInspectorSheet component contract', () => {
  it('defines open, region, and onClose props', () => {
    expect(sheetFile).toContain('open = $bindable(false)');
    expect(sheetFile).toContain('region');
    expect(sheetFile).toContain('onClose');
  });

  it('renders all four somatic breakdown tracks', () => {
    expect(sheetFile).toContain('data-track="trajectory"');
    expect(sheetFile).toContain('data-track="measurements"');
    expect(sheetFile).toContain('data-track="photos"');
    expect(sheetFile).toContain('data-track="hair-removal"');
    expect(sheetFile).toContain('data-track="hair-staging"');
  });

  it('renders empty state when breakdown is empty', () => {
    expect(sheetFile).toContain('EmptyState');
    expect(sheetFile).toContain('body_region_empty_title');
    expect(sheetFile).toContain('body_region_empty_body');
  });

  it('uses PhotoThumb for photo thumbnails', () => {
    expect(sheetFile).toContain('<PhotoThumb');
  });
});

describe('/body-map page inspector wiring', () => {
  /* Redesign ticket 40: the figure is the only region control on this
     screen. The hotspots, the chips row and the picker in the first chart
     card's header were four ways to make one choice, and all four opened
     the sheet, so the map could not be browsed at all. */
  it('has exactly one region control, which is the figure', () => {
    expect(pageFile).toContain('data-body-map-figure');
    expect(pageFile).toContain('<BodyRegionMap');
    expect(pageFile).not.toContain('data-region-hotspot');
    expect(pageFile).not.toContain('data-region-chip');
    expect(pageFile).not.toContain('HOTSPOTS');
    expect(pageFile).not.toContain("key=\"body-region\"");
  });

  it('reaches the inspector sheet by one explicit row rather than by every tap', () => {
    expect(pageFile).not.toContain('data-open-inspector');
    expect(pageFile).toContain("key=\"body-region-inspector\"");
    expect(pageFile).toContain('<BodyRegionInspectorSheet');
    expect(pageFile).toContain('bind:open={inspectorOpen}');
    expect(pageFile).toContain('{region}');
  });
});
