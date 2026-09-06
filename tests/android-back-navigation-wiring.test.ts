import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { resolveAndroidBackAction } from '../src/lib/android/back-navigation';
import { requiredAndroidPluginNames } from '../src/lib/android/plugin-registry';

/* NAV-002: the previous version of this test passed by grepping
   +layout.svelte's source text for `addListener('backButton'` and
   `minimizeApp()` - both strings were present while the handler was
   actually inert, because @capacitor/app was never a dependency and the
   plugin was never registered natively. That is exactly the false-green
   guard the beta report's NAV-001 slipped through. This version instead
   covers the routing decision as a pure function, and asserts the plugin
   the decision depends on is in the required-plugin list every other
   Android bridge is checked against at startup. */
describe('android back button routing', () => {
  it('minimizes at the home route rather than walking further back', () => {
    expect(resolveAndroidBackAction('/', 3)).toBe('minimize');
    expect(resolveAndroidBackAction('', 3)).toBe('minimize');
  });

  it('walks in-app history when there is somewhere to go back to', () => {
    expect(resolveAndroidBackAction('/settings', 3)).toBe('history-back');
  });

  it('falls back home when there is no history to walk, instead of exiting', () => {
    expect(resolveAndroidBackAction('/settings', 0)).toBe('go-home');
  });

  it('counts pushes the app made, not entries the browser is holding', () => {
    /* CARPET-05: this used to be handed `window.history.length`, where one
       push reads as 2 and the boot entry reads as 1 - and which only ever
       grows. Open the app on a notification's screen, walk into another one
       and walk back, and the length is still 2 while the app is sitting on
       the entry it booted on with nothing behind it, so back reported
       `history-back` and stepped out of the WebView. The count in
       `smart-back.ts` follows a popstate back down, and it is the same
       number every back control in the web half of the app decides on. A
       depth of 1 is therefore one screen to return to, not none. */
    expect(resolveAndroidBackAction('/settings', 1)).toBe('history-back');
  });
});

describe('android predictive back', () => {
  it('opts the application in, so the system draws the gesture itself', () => {
    /* The flag is the whole opt-in: without it the app stays on the legacy
       path where nothing is drawn until the gesture has committed, and
       DIRECTION.md's rule that back is driven by the gesture rather than
       played as a fixed animation has nothing to be driven by.

       Asserted on the manifest because that is where the decision lives.
       What the app does with it - playing no back animation of its own on
       Android - is screen-transition.ts's, and has its own tests. */
    const manifest = readFileSync(
      fileURLToPath(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url)),
      'utf8'
    );
    const application = manifest.slice(manifest.indexOf('<application'), manifest.indexOf('<activity'));
    expect(application).toMatch(/android:enableOnBackInvokedCallback="true"/);
  });
});

describe('android back button plugin requirement', () => {
  it('requires the Capacitor App plugin at startup', () => {
    expect(requiredAndroidPluginNames).toContain('App');
  });
});
