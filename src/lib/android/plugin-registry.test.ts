import { describe, expect, it } from 'vitest';

import {
  assertRequiredAndroidPluginsRegistered,
  requiredAndroidPluginNames,
} from './plugin-registry';

describe('android plugin registry', () => {
  it('accepts a complete plugin map', () => {
    const plugins = Object.fromEntries(requiredAndroidPluginNames.map((name) => [name, {}]));
    expect(() => assertRequiredAndroidPluginsRegistered(plugins)).not.toThrow();
  });

  it('throws a clear error when a required plugin is missing', () => {
    const plugins = Object.fromEntries(requiredAndroidPluginNames.map((name) => [name, {}]));
    delete plugins.Photos;

    expect(() => assertRequiredAndroidPluginsRegistered(plugins)).toThrow(
      'Missing required Capacitor plugins at startup: Photos.'
    );
  });
});