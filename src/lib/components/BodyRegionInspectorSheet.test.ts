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
  it('includes 2D anatomical map with interactive hotspots and region chips', () => {
    expect(pageFile).toContain('data-body-map-figure');
    expect(pageFile).toContain('data-region-hotspot');
    expect(pageFile).toContain('data-region-chip');
  });

  it('includes open inspector trigger button and renders BodyRegionInspectorSheet', () => {
    expect(pageFile).toContain('data-open-inspector');
    expect(pageFile).toContain('<BodyRegionInspectorSheet');
    expect(pageFile).toContain('bind:open={inspectorOpen}');
    expect(pageFile).toContain('{region}');
  });
});
