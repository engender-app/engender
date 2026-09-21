import { beforeEach, describe, expect, it, vi } from 'vitest';

const setLightIcons = vi.fn(() => Promise.resolve());
const isAndroid = vi.fn(() => true);

vi.mock('$lib/android/plugin-registry', () => ({
  androidPluginOwners: { statusBar: 'android/status-bar-bridge' },
  registerAndroidPlugin: () => ({ setLightIcons })
}));
vi.mock('$lib/platform', () => ({ isAndroid: () => isAndroid() }));

const { applyStatusBarAppearance } = await import('./status-bar-bridge');

describe('the status bar tint follows the resolved theme', () => {
  beforeEach(() => {
    setLightIcons.mockClear();
    isAndroid.mockReturnValue(true);
  });

  /* `light` is the background the bar sits on, not the glyphs: the light
     theme's band is #F4F8FB and wants dark icons, which is what the native
     side does with a true here. Asserted per theme rather than by "it was
     called", because an inverted boolean is the whole defect this fixes and
     it would pass a call-count check. */
  it('asks for a light background in the light theme', () => {
    applyStatusBarAppearance('light');
    expect(setLightIcons).toHaveBeenCalledWith({ light: true });
  });

  it('asks for a dark background in the dark theme', () => {
    applyStatusBarAppearance('dark');
    expect(setLightIcons).toHaveBeenCalledWith({ light: false });
  });

  /* The web has no bar to tint, and an installed PWA gets its colour from
     the theme-color meta the same effect writes a line earlier. */
  it('says nothing off Android', () => {
    isAndroid.mockReturnValue(false);
    applyStatusBarAppearance('light');
    expect(setLightIcons).not.toHaveBeenCalled();
  });

  /* The tint is the least important thing the chrome effect does. A
     rejection escaping here would be an unhandled rejection in the effect
     that also stamps the palette, the tab icon and the flag's stripes. */
  it('swallows a rejection from the bridge', async () => {
    setLightIcons.mockRejectedValueOnce(new Error('no activity'));
    expect(() => applyStatusBarAppearance('dark')).not.toThrow();
    await Promise.resolve();
  });
});
