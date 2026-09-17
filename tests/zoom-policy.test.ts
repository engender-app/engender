import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../capacitor.config.ts';

/* Which platforms own magnification (pre-production audit, finding U2).

   Zoom is a web capability and only a web capability. The browser half
   is decided by the viewport meta: `maximum-scale` and `user-scalable`
   are how a page takes pinch and browser zoom away from the person
   using it, which WCAG 1.4.4 and the product's own 200 percent floor
   both forbid. The Android half is decided elsewhere: Capacitor's bridge
   maps `android.zoomEnabled` to `setBuiltInZoomControls`, the WebView
   setting that actually governs pinch input, and the shell wants it off
   so two-finger gestures belong to the app's own surfaces (photo wipe,
   timeline drag) rather than to the page behind them.

   Neither half can be observed in a headless browser - Chromium there
   reports the same layout whether or not magnification is allowed, and
   the WebView setting lives in Java. So this asserts the two sources
   every platform reads before it renders anything: the markup a browser
   loads and the config `cap sync` copies into the APK. safe-area.test.ts
   guards the viewport's other responsibilities; this one guards only
   the zoom policy, which is why the meta is matched by the `name`
   attribute rather than assumed to sit on a single line. */

const appHtml = readFileSync(fileURLToPath(new URL('../src/app.html', import.meta.url)), 'utf8');

describe('user-controlled zoom', () => {
  it('ships a viewport that leaves magnification to the person on the web', () => {
    const viewport = appHtml.match(/name="viewport"\s+content="([^"]+)"/)?.[1];
    expect(viewport).toBeDefined();
    const parts = viewport!.split(',').map((part) => part.trim());
    /* What must survive: the cover declaration the safe-area insets read,
       and the width and scale the whole phone-first layout assumes. */
    for (const kept of ['width=device-width', 'initial-scale=1', 'viewport-fit=cover']) {
      expect(parts).toContain(kept);
    }
    /* What must not come back: either directive blocks magnification in
       a browser that honours it. */
    expect(parts.join(' ')).not.toMatch(/maximum-scale|user-scalable/);
  });

  it('keeps the Android WebView unzoomable', () => {
    expect(capacitorConfig.android?.zoomEnabled).toBe(false);
  });
});
