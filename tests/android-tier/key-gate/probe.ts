import { mount, tick } from 'svelte';
import AndroidKeyGate from '../../../src/lib/components/AndroidKeyGate.svelte';
import { bootState, startBoot, submitAccessModeSetup } from '../../../src/lib/stores/boot.svelte';
import { setPreferenceDurably } from '../../../src/lib/data/prefs/store.svelte';
import { refreshActiveFlag } from '../../../src/lib/theme/activeFlag.svelte';
import '../../../src/lib/theme/fonts.css';
import '../../../src/lib/theme/base.css';
import '../../../src/lib/theme/palettes.css';
import '../../../src/lib/styles/app.css';
import '../../../src/lib/styles/components.css';
import '../../../src/lib/styles/screens.css';
import '../../../src/lib/styles/kit.css';
import '../../../src/lib/motion/press.css';
import '../../../src/lib/motion/materials.css';

const marker = 'Saved-state gate fixture';
let mounted = false;

async function waitForStatus(status: string) {
  const deadline = Date.now() + 30_000;
  while (bootState.status !== status && Date.now() < deadline) {
    if (bootState.status === 'error') throw new Error(bootState.error ?? 'boot failed');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (bootState.status !== status) throw new Error(`expected ${status}, received ${bootState.status}`);
}

const probe = {
  error: '',
  seeded: false,
  theme(theme: string) {
    document.documentElement.dataset.theme = theme;
    refreshActiveFlag(document, false);
  },
  // The production boot, gate and native bridge run unchanged. Only mount
  // timing is controlled so the saved-state race has a repeatable boundary.
  async mount() {
    try {
      await waitForStatus('needs-authentication');
      if (mounted) throw new Error('gate already mounted');
      mounted = true;
      mount(AndroidKeyGate, { target: document.getElementById('gate')! });
      await tick();
    } catch (error) { probe.error = String(error); }
  },
  async seed() {
    try {
      await waitForStatus('needs-setup');
      if (await submitAccessModeSetup('device-bound', '') !== 'ok') throw new Error('setup refused');
      await waitForStatus('ready');
      if (!bootState.journal) throw new Error('journal did not open');
      await bootState.journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note: marker, dims: {}, tags: [] });
      await setPreferenceDurably('onboarded', true);
      probe.seeded = true;
    } catch (error) { probe.error = String(error); }
  },
  snapshot() {
    const button = document.querySelector<HTMLButtonElement>('[data-key-retry]');
    return {
      status: bootState.status,
      outcome: bootState.androidKey?.kind === 'refused' ? bootState.androidKey.authentication.outcome : null,
      disabled: button?.disabled ?? null,
      button: button?.textContent?.trim() ?? '',
      error: probe.error
    };
  },
  async retainedEntry() {
    if (!bootState.journal) return null;
    const entries = await bootState.journal.entries.entriesForDay(20000);
    return entries.find(entry => entry.note === marker)?.note ?? null;
  }
};

Object.assign(window, { keyGateProbe: probe });
probe.theme('light');
startBoot();
