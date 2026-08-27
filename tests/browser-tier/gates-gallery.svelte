<script lang="ts">
  /* Every chromeless gate, one at a time, against the real tokens (phase 5
     ticket 26).

     A fixture rather than a route because four of the five are boot states
     rather than URLs: the passphrase gate, the Android key gate, the
     device-recovery gate and the schema-too-new gate all render because of
     how boot went, and there is no address that produces them on demand.
     That is fine for the app and useless for looking at them, which is what
     this page is for.

     The components are the real ones, not copies. What the fixture supplies
     is the state they read - `bootState`, moved through the same transitions
     boot itself uses, so a gate here is drawing exactly what it draws in the
     app. tests/gates-gallery.mjs drives the selector below across palettes
     and themes for the screenshot grid. */

  import { bootState } from '$lib/stores/boot.svelte';
  import { bootStates, bootTransitions } from '$lib/stores/boot-state';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import DeviceBoundRecovery from '$lib/components/DeviceBoundRecovery.svelte';
  import LockScreen from '$lib/components/LockScreen.svelte';
  import PassphraseGate from '$lib/components/PassphraseGate.svelte';
  import SchemaTooNew from '$lib/components/SchemaTooNew.svelte';
  import { PALETTES } from '../palettes.mjs';

  const SCENES = [
    'lock-unlock',
    'lock-setup',
    'passphrase-setup',
    'passphrase-unlock',
    'passphrase-converting',
    'passphrase-refused',
    'android-key',
    'android-key-no-lock',
    'android-key-invalidated',
    'device-recovery',
    'schema-too-new'
  ];

  let scene = $state('lock-unlock');
  let palette = $state('trans');
  let theme = $state('dark');

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
  });

  /* Rebuilt from `booting` on every change rather than mutated in place:
     the transitions refuse an illegal move, which is what keeps this page
     honest about which states the app can actually be in. */
  $effect(() => {
    const from = bootStates.booting();
    if (scene === 'passphrase-setup') {
      Object.assign(bootState, bootTransitions.toNeedsSetup(from));
    } else if (scene === 'passphrase-unlock') {
      Object.assign(bootState, bootTransitions.toNeedsUnlock(from));
    } else if (scene === 'passphrase-converting') {
      const setup = bootTransitions.toNeedsSetup(from, { conversionRequired: true });
      const converting = bootTransitions.toConverting(setup);
      Object.assign(
        bootState,
        bootTransitions.updateConversionProgress(converting, { stage: 'photos', done: 34, total: 91 })
      );
    } else if (scene === 'passphrase-refused') {
      Object.assign(
        bootState,
        bootTransitions.toConversionRefused(from, {
          reason: 'not-enough-space',
          needBytes: 214 * 1024 * 1024,
          freeBytes: 37 * 1024 * 1024
        })
      );
    } else if (scene === 'android-key') {
      Object.assign(bootState, bootTransitions.toNeedsAuthentication(from));
    } else if (scene === 'android-key-no-lock') {
      const gate = bootTransitions.toNeedsAuthentication(from);
      Object.assign(
        bootState,
        bootTransitions.toNeedsAuthentication(gate, {
          kind: 'refused',
          authentication: { outcome: 'unenrolled', unlocksJournal: false, wayForward: 'setDeviceLock' }
        })
      );
    } else if (scene === 'android-key-invalidated') {
      const gate = bootTransitions.toNeedsAuthentication(from);
      Object.assign(bootState, bootTransitions.toNeedsAuthentication(gate, { kind: 'invalidated' }));
    } else if (scene === 'device-recovery') {
      Object.assign(bootState, bootTransitions.toNeedsDeviceRecovery(from));
    } else if (scene === 'schema-too-new') {
      Object.assign(bootState, bootTransitions.toSchemaTooNew(from));
    } else {
      Object.assign(bootState, from);
    }
  });
</script>

<div class="gallery-controls" data-gallery-controls>
  <label>
    Scene
    <select aria-label="Scene" bind:value={scene}>
      {#each SCENES as name (name)}<option value={name}>{name}</option>{/each}
    </select>
  </label>
  <label>
    Palette
    <select aria-label="Palette" bind:value={palette}>
      {#each PALETTES as name (name)}<option value={name}>{name}</option>{/each}
    </select>
  </label>
  <label>
    Theme
    <select aria-label="Theme" bind:value={theme}>
      <option value="dark">dark</option>
      <option value="light">light</option>
    </select>
  </label>
</div>

<!-- The app's own scroll region, because the gates centre themselves inside
     it and a gate measured against the page rather than against .app-main is
     a gate nobody has actually looked at. -->
<div class="app-viewport">
  <div class="app is-chromeless" data-app-root>
    <main class="app-main" data-gallery-stage>
      {#if scene === 'lock-setup'}
        <LockScreen mode="setup" onCancel={() => {}} />
      {:else if scene === 'lock-unlock'}
        <LockScreen mode="unlock" />
      {:else if scene.startsWith('passphrase')}
        <PassphraseGate />
      {:else if scene.startsWith('android-key')}
        <AndroidKeyGate />
      {:else if scene === 'device-recovery'}
        <DeviceBoundRecovery />
      {:else if scene === 'schema-too-new'}
        <SchemaTooNew />
      {/if}
    </main>
  </div>
</div>

<style>
  .gallery-controls {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 50;
    display: flex;
    gap: 12px;
    padding: 6px 10px;
    font: 12px system-ui, sans-serif;
    background: #111;
    color: #eee;
  }
  .gallery-controls label {
    display: flex;
    gap: 4px;
    align-items: center;
  }
</style>
