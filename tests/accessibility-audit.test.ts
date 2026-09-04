/* The accessibility seams that are facts about a file rather than
   behaviour with a return value: a chart carrying its aria-label, a
   control keeping its label association, the shell writing the
   accessibility attributes it promises to write.

   Greps by design (ticket 08). Each of these is a construct that either
   appears in a source file or does not, and what breaks when one goes
   missing is silent - a screen reader reads nothing where a label was.
   Nothing here stands in for a rule that could be moved into a module and
   called; where the repo found one of those it moved it. */

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
    expect(stats).toMatch(/<Sheet\s+open=\{valueSheet\}/);
    /* The sheet is the screen's own bar rows now, and a bar carries its
       value as text - which is the property this check is about. It used to
       be three columns of text per row, which is a table with one column
       that matters. */
    expect(stats).toContain('valueRows');
    /* `scale="track"` since phase 8 UX ticket 03: the bar is where the day
       sits in the metric's own range, which is what the sheet's own comment
       promised while the primitive was quietly re-normalising it against the
       longest row. The value beside it is text either way, which is what
       this check is about. */
    expect(stats).toContain('<BarRows rows={valueRows} scale="track" />');
    /* And a second scale joins that list rather than only the picture
       (phase 6 ticket 12). The plot is one image to a screen reader and a
       scrub is a way of reading a picture, so a comparison whose numbers
       lived on the plot alone would be a reading only sighted people get.
       Held to the catalogue message the row is written with rather than to
       whatever the variable holding it is called this month. */
    expect(stats).toContain('m.values_second');
    expect(stats).toContain('m.values_two_title');
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

    for (const selector of ['.mood-face.is-alive .mood-face-eye', '.bloom i', '.bloom-core']) {
      const escaped = selector.replace(/[.[\]]/g, '\\$&');
      const stopped = new RegExp(`${escaped}[^{]*\\{[^}]*animation:\\s*none`);
      expect(reduceBlocks, `${selector} should stop under reduced motion, not clamp to 1ms`).toMatch(stopped);
    }
  });

  it('applies the skeleton sweep escape to the in-app reduce toggle as well as the OS setting', () => {
    const components = read('src/lib/styles/components.css');
    expect(components).toMatch(/html\[data-a11y-motion='reduce'\]\s+\.skeleton::after\s*\{\s*display:\s*none;/);
  });

  it('keeps the accessibility tuning controls on the settings screen', () => {
    const settings = read('src/routes/settings/+page.svelte');

    expect(settings).toContain('m.a11y_text_size_boost()');
    expect(settings).toContain('m.a11y_legibility_boost()');
    expect(settings).toContain('m.a11y_motion_reduce_override()');
    /* What the three controls then do to the document is asserted by
       running both adapters over prefs/fixtures/document-chrome.json
       (documentChrome.test.ts, app-html-chrome.test.ts), not by grepping
       the layout for three dataset writes as this used to. The grep could
       not see that the pre-paint script exists at all, so a preference the
       layout stamped and app.html did not was a flash of the wrong chrome
       on every cold start with this green. */
  });

  it('keeps the wrapped range picker naming its cadence group', () => {
    const wrapped = read('src/routes/wrapped/[cadence]/+page.svelte');
    expect(wrapped).toContain('m.recap_custom_start_label()');
    expect(wrapped).toContain('m.recap_custom_end_label()');
    expect(wrapped).toContain('title={m.wrapped_cadence_group()}');
  });

  /* This used to be the one place label association got checked at all - a
     grep against wrapped's two date fields, which is one screen's worth of
     evidence for a pattern 131 call sites repeat by hand (phase 5 audit
     ticket 10). tests/browser-tier/run.mjs's "field association" block is
     what replaced it: Field.svelte mints the id and hands the same string
     to the label and the control, and that block renders several of them -
     an explicit id, two minted ones, a legend - and reads the DOM back to
     prove the pairing holds, rather than grepping one screen's source for a
     string that happens to be there today. */
});