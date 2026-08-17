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
    expect(base).toContain("html[data-a11y-motion='reduce']");
    expect(app).toContain('@media (prefers-reduced-motion: reduce)');
    expect(components).toContain('@media (prefers-reduced-motion: reduce)');
  });

  /* MO-001/MO-002 (ticket 09): the assertion above only checked that both
     reduced-motion selectors appear *somewhere* in each file, which stayed
     true whether the five decorative loops below were stopped or clamped to
     a 1ms flicker - the actual regression a beta tester could have hit.
     This checks the fix itself: each animation is turned off under both
     selectors, not just slowed down. */
  it('stops decorative infinite loops under both reduced-motion paths instead of clamping them', () => {
    const components = read('src/lib/styles/components.css');
    const reduceBlocks = [
      ...(components.match(/html\[data-a11y-motion='reduce'\][^{]*\{[^}]*\}/g) ?? []),
      ...(components.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [])
    ].join('\n');

    for (const selector of ['.mood-face-ink', '.bloom i', '.bloom-core', '.confetti .cf']) {
      const escaped = selector.replace(/[.[\]]/g, '\\$&');
      const stopped = new RegExp(`${escaped}[^{]*\\{[^}]*animation:\\s*none`);
      expect(reduceBlocks, `${selector} should stop under reduced motion, not clamp to 1ms`).toMatch(stopped);
    }
  });

  it('applies the skeleton sweep escape to the in-app reduce toggle as well as the OS setting', () => {
    const components = read('src/lib/styles/components.css');
    expect(components).toMatch(/html\[data-a11y-motion='reduce'\]\s+\.skeleton::after\s*\{\s*display:\s*none;/);
  });

  it('keeps accessibility tuning controls and document wiring in place', () => {
    const settings = read('src/routes/settings/+page.svelte');
    const layout = read('src/routes/+layout.svelte');

    expect(settings).toContain('m.a11y_text_size_boost()');
    expect(settings).toContain('m.a11y_legibility_boost()');
    expect(settings).toContain('m.a11y_motion_reduce_override()');
    expect(layout).toContain("root.dataset.a11yTextSize");
    expect(layout).toContain("root.dataset.a11yLegibility");
    expect(layout).toContain("root.dataset.a11yMotion");
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