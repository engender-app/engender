import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../capacitor.config.ts';

/* Keep web zoom available to 200% by checking the viewport meta for
   maximum-scale and user-scalable restrictions. Capacitor uses
   android.zoomEnabled to disable WebView pinch so photo and timeline
   gestures reach the app. Check source because headless Chromium
   cannot measure magnification and cap sync copies config into the APK. */

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
