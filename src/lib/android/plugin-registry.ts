import { registerPlugin } from '@capacitor/core';

export const androidPluginOwners = {
  sqlite: 'data/sqlite/android-driver',
  keystore: 'lock/keystore-bridge',
  photos: 'data/photos/android-bridge',
  reminders: 'reminders/android-bridge',
  autoExport: 'data/archive/android-auto-export-bridge',
  disguise: 'disguise/android-bridge',
  quickExit: 'lock/quick-exit-bridge',
} as const;

type AndroidPluginOwner = (typeof androidPluginOwners)[keyof typeof androidPluginOwners];

interface AndroidPluginRegistryEntry {
  name: string;
  owner: AndroidPluginOwner;
}

export const androidPluginRegistry = [
  { name: 'Sqlite', owner: androidPluginOwners.sqlite },
  { name: 'Keystore', owner: androidPluginOwners.keystore },
  { name: 'Photos', owner: androidPluginOwners.photos },
  { name: 'Reminders', owner: androidPluginOwners.reminders },
  { name: 'AutoExport', owner: androidPluginOwners.autoExport },
  { name: 'Disguise', owner: androidPluginOwners.disguise },
  { name: 'QuickExit', owner: androidPluginOwners.quickExit },
] as const satisfies readonly AndroidPluginRegistryEntry[];

export const requiredAndroidPluginNames = androidPluginRegistry.map((entry) => entry.name);

const pluginNameByOwner = new Map<AndroidPluginOwner, string>(
  androidPluginRegistry.map((entry) => [entry.owner, entry.name])
);

export function registerAndroidPlugin<Bridge>(owner: AndroidPluginOwner): Bridge {
  const pluginName = pluginNameByOwner.get(owner);
  if (!pluginName) {
    throw new Error(`[android-plugins] Unknown plugin owner: ${owner}`);
  }
  return registerPlugin<Bridge>(pluginName);
}

export function assertRequiredAndroidPluginsRegistered(
  plugins: Record<string, unknown> | null | undefined
): void {
  const pluginMap = plugins ?? {};
  const missing = requiredAndroidPluginNames.filter((pluginName) => !pluginMap[pluginName]);
  if (!missing.length) return;
  throw new Error(
    `[android-plugins] Missing required Capacitor plugins at startup: ${missing.join(', ')}.`
  );
}

export function assertAndroidRuntimePluginRegistry(): void {
  if (typeof window === 'undefined') return;
  const capacitor = (window as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  assertRequiredAndroidPluginsRegistered(capacitor?.Plugins);
}