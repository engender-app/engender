<script lang="ts">
  /* Every chromeless gate, one at a time, against the real tokens (phase 5
     ticket 26; extended by ticket 53).

     A fixture rather than a route because most of these are boot states
     rather than URLs: the journal gate, the Android key gate, the
     device-recovery gate and the schema-too-new gate all render because of
     how boot went, and there is no address that produces them on demand.
     That is fine for the app and useless for looking at them, which is what
     this page is for.

     The components are the real ones, not copies. What the fixture supplies
     is the state they read - `bootState`, moved through the same transitions
     boot itself uses, so a gate here is drawing exactly what it draws in the
     app. tests/gates-gallery.mjs drives the selectors below across palettes
     and themes for the screenshot grid.

     Ticket 53 adds the platform selector. The security module presents three
     modes on the web and three different ones on Android - device-bound is
     labelled as the screen lock there, and cannot be moved *to* on a change -
     and both have to be looked at. `isAndroid()` reads
     `window.Capacitor.getPlatform()`, so the fixture stubs exactly that
     rather than adding a prop the app would carry for the gallery's benefit.
     The stage is keyed on the answer, because the components read it in
     `$derived` and a stub swapped underneath them would not re-run. */

  import { bootState } from '$lib/stores/boot.svelte';
  import { bootStates, bootTransitions } from '$lib/stores/boot-state';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import DeviceBoundRecovery from '$lib/components/DeviceBoundRecovery.svelte';
  import SessionUnlock from '$lib/components/SessionUnlock.svelte';
  import JournalGate from '$lib/components/JournalGate.svelte';
  import AccessModeSetup from '$lib/components/AccessModeSetup.svelte';
  import GateScreen from '$lib/components/GateScreen.svelte';
  import SchemaTooNew from '$lib/components/SchemaTooNew.svelte';
  import { m } from '$lib/paraglide/messages';
  import { PALETTES } from '../palettes.mjs';

  const SCENES = [
    /* The module, which is the one screen this ticket is really about: the
       list of modes, then the screen each mode leads to. */
    'access-choice',
    'access-device',
    'access-pin',
    'access-pin-confirm',
    'access-passphrase',
    'access-change',
    /* The gates a cold start lands on, one per mode that asks for something. */
    'unlock-pin',
    'unlock-passphrase',
    /* Mid-session, which asks for the same secrets in a different frame. */
    'session-pin',
    'session-passphrase',
    'session-device',
    /* Unchanged by this ticket, kept so a regression in the shared shell
       shows up here rather than in the app. */
    'converting',
    'conversion-refused',
    'android-key',
    'android-key-no-lock',
    'android-key-invalidated',
    'device-recovery',
    'schema-too-new'
  ];

  let scene = $state('access-choice');
  let palette = $state('trans');
  let theme = $state('dark');
  let platform = $state('web');

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
  });

  /* Set before the stage renders, and the stage is keyed on `platform` so
     every component below reads the stub that is current. */
  $effect(() => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor =
      platform === 'android' ? { getPlatform: () => 'android' } : undefined;
  });

  /* Rebuilt from `booting` on every change rather than mutated in place:
     the transitions refuse an illegal move, which is what keeps this page
     honest about which states the app can actually be in. */
  $effect(() => {
    const from = bootStates.booting();
    if (scene === 'unlock-pin') {
      Object.assign(bootState, bootTransitions.toNeedsUnlock(bootTransitions.setAccessMode(from, 'pin')));
    } else if (scene === 'unlock-passphrase') {
      Object.assign(bootState, bootTransitions.toNeedsUnlock(bootTransitions.setAccessMode(from, 'passphrase')));
    } else if (scene === 'converting') {
      const setup = bootTransitions.toNeedsSetup(from, { conversionRequired: true });
      const converting = bootTransitions.toConverting(setup);
      Object.assign(
        bootState,
        bootTransitions.updateConversionProgress(converting, { stage: 'photos', done: 34, total: 91 })
      );
    } else if (scene === 'conversion-refused') {
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
      // Every access-* scene is the first-run setup state.
      Object.assign(bootState, bootTransitions.toNeedsSetup(from));
    }
  });

  /* The module's own internal step is component state rather than boot state,
     so the scenes that show one drive it through the same prop the real
     screens use and then reach for the row. Done here rather than in the
     screenshot script so the fixture is self-contained. */
  let seeded = $state(0);
  $effect(() => {
    const step = scene;
    seeded++;
    if (!step.startsWith('access-')) return;
    queueMicrotask(() => {
      const stage = document.querySelector('[data-gallery-stage]');
      if (!stage) return;
      const row =
        step === 'access-device'
          ? '[data-list-row="device-bound"]'
          : step === 'access-pin' || step === 'access-pin-confirm'
            ? '[data-list-row="pin"]'
            : step === 'access-passphrase'
              ? '[data-list-row="passphrase"]'
              : null;
      if (row) (stage.querySelector(row) as HTMLElement | null)?.click();
      if (step === 'access-pin-confirm') {
        queueMicrotask(() => {
          for (const key of ['1', '2', '3', '4']) {
            (stage.querySelector(`[data-key="${key}"]`) as HTMLElement | null)?.click();
          }
        });
      }
    });
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
  <label>
    Platform
    <select aria-label="Platform" bind:value={platform}>
      <option value="web">web</option>
      <option value="android">android</option>
    </select>
  </label>
</div>

<!-- The app's own scroll region, because the gates centre themselves inside
     it and a gate measured against the page rather than against .app-main is
     a gate nobody has actually looked at. -->
<div class="app-viewport">
  <div class="app is-chromeless" data-app-root>
    <main class="app-main" data-gallery-stage>
      {#key `${platform}:${scene}:${seeded}`}
        {#if scene === 'access-change'}
          <!-- Settings' framing rather than a gate's: the same module, on a
               screen that has a journal open behind it. -->
          <div class="screen">
            <div class="card">
              <AccessModeSetup purpose="change" current="passphrase" onChoose={() => {}} />
            </div>
          </div>
        {:else if scene.startsWith('access-')}
          <GateScreen icon="shield" title={m.am_setup_title()}>
            <AccessModeSetup purpose="setup" onChoose={() => {}} />
          </GateScreen>
        {:else if scene === 'session-pin'}
          <SessionUnlock mode="pin" />
        {:else if scene === 'session-passphrase'}
          <SessionUnlock mode="passphrase" />
        {:else if scene === 'session-device'}
          <SessionUnlock mode="device-bound" />
        {:else if scene.startsWith('unlock-') || scene === 'converting' || scene === 'conversion-refused'}
          <JournalGate />
        {:else if scene.startsWith('android-key')}
          <AndroidKeyGate />
        {:else if scene === 'device-recovery'}
          <DeviceBoundRecovery />
        {:else if scene === 'schema-too-new'}
          <SchemaTooNew />
        {/if}
      {/key}
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
