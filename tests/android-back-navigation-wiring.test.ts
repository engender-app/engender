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
    expect(resolveAndroidBackAction('/settings', 1)).toBe('go-home');
  });
});

describe('android back button plugin requirement', () => {
  it('requires the Capacitor App plugin at startup', () => {
    expect(requiredAndroidPluginNames).toContain('App');
  });
});
