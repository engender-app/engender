import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('phase 2 accessibility seams', () => {
  it('keeps line charts labelled for screen readers', () => {
    const chart = read('src/lib/components/LineChart.svelte');
    expect(chart).toContain('m.chart_aria');
    expect(chart).toContain('role="img"');
    expect(chart).toContain('aria-label={chart.label}');
    expect(chart).toContain('m.not_enough_data()');
  });

  it('keeps chart values available as text in stats', () => {
    const stats = read('src/routes/stats/+page.svelte');
    expect(stats).toContain('class="card chart-card"');
    expect(stats).toContain('Sheet open={valueSheet !== null}');
    expect(stats).toContain('class="value-row"');
    expect(stats).toContain('m.values_title');
  });

  it('keeps reduced-motion support wired in both token and component layers', () => {
    const base = read('src/lib/theme/base.css');
    const app = read('src/lib/styles/app.css');
    const components = read('src/lib/styles/components.css');

    expect(base).toContain('@media (prefers-reduced-motion: reduce)');
    expect(app).toContain('@media (prefers-reduced-motion: reduce)');
    expect(components).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps recap range selection and trend summary labelled', () => {
    const recap = read('src/routes/recap/+page.svelte');
    expect(recap).toContain('aria-label={m.recap_period_group()}');
    expect(recap).toContain('aria-label={m.recap_custom_start_label()}');
    expect(recap).toContain('aria-label={m.recap_custom_end_label()}');
    expect(recap).toContain('LineChart points={moodTrend} min={1} max={5}');
    expect(recap).toContain('m.recap_change_summary_title()');
  });
});