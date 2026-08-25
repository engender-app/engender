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
    expect(chart).toContain('aria-label={ariaLabel ?? chart.label}');
    expect(chart).toContain('m.not_enough_data()');
  });

  it('keeps chart values available as text in stats', () => {
    /* The chart carries a value gutter and a mark per reading (phase 5 UX
       ticket 23), and neither is a number a screen reader can report. The
       sheet is the text of the same series, and it is the reason the
       "All values" control exists at all rather than being a convenience. */
    const stats = read('src/routes/stats/+page.svelte');
    expect(stats).toContain('data-values-open');
    expect(stats).toContain('Sheet open={valueSheet}');
    /* The sheet is the screen's own bar rows now, and a bar carries its
       value as text - which is the property this check is about. It used to
       be three columns of text per row, which is a table with one column
       that matters. */
    expect(stats).toContain('valueRows');
    expect(stats).toContain('<BarRows rows={valueRows} />');
  });

  /* Ticket 17: --touch-target was 44px, which is the iOS number. The app
     ships an Android wrapper too (android/), and Android's floor is 48dp,
     so 44 left the segmented control, the sheet dismiss button and the
     section links under the platform minimum on the platform most people
     will run this on. Every control in the app sizes itself from this one
     token, so the floor is worth asserting rather than trusting. */
  it('sizes the touch target for the stricter of the two platforms it ships on', () => {
    const base = read('src/lib/theme/base.css');
    const value = /--touch-target:\s*(\d+)px/.exec(base)?.[1];
    expect(Number(value), '--touch-target should be at least Android\'s 48dp floor').toBeGreaterThanOrEqual(48);
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

    for (const selector of ['.mood-face.is-alive .mood-face-eye', '.bloom i', '.bloom-core', '.confetti .cf']) {
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

  /* The range picker this used to check belonged to `/recap`, which phase 5
     UX ticket 23 deleted (spec 07). The capability moved rather than went,
     so the check follows it onto wrapped: both date fields are named, and
     the sheet holding them is too.

     Named by a `<label for>` rather than an aria-label. The recap screen
     carried both, which is one accessible name written twice; what has to
     hold is that each input has a label bound to its own id. */
  it('keeps the wrapped range picker and its two date fields labelled', () => {
    const wrapped = read('src/routes/wrapped/[cadence]/+page.svelte');
    /* Both fields come out of one table, so what has to hold is that the
       table carries both ids and that the label is bound to the field's own
       one rather than to a literal that could drift from it. */
    for (const id of ['wrapped-range-start', 'wrapped-range-end']) {
      expect(wrapped, id).toContain(`id: '${id}'`);
    }
    expect(wrapped).toContain('for={field.id}');
    expect(wrapped).toContain('id={field.id}');
    expect(wrapped).toContain('m.recap_custom_start_label()');
    expect(wrapped).toContain('m.recap_custom_end_label()');
    expect(wrapped).toContain('title={m.wrapped_cadence_group()}');
  });
});