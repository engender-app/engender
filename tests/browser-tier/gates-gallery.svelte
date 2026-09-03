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

     Ticket 53 adds the platform selector. The security module presents a
     different list of modes on each of the three platforms it can be on -
     device-bound is labelled as the screen lock on Android and cannot be
     moved *to* there, and the web's biometric row (ticket 55) is there only
     where the browser can actually do WebAuthn PRF - and all three have to
     be looked at. `isAndroid()` reads `window.Capacitor.getPlatform()` and
     the PRF check reads `PublicKeyCredential`, so the fixture stubs exactly
     those two rather than adding props the app would carry for the gallery's
     benefit. The stage is keyed on the answer, because the components read it
     during render and a stub swapped underneath them would not re-run.

     Headless Chromium has no platform authenticator, so `web` here is the
     stub saying it does and `web-no-prf` is the honest browser: those are
     the two lists a person can meet, and both are worth a picture. */

  import { bootState } from '$lib/stores/boot.svelte';
  import { bootStates, bootTransitions } from '$lib/stores/boot-state';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import DeviceBoundRecovery from '$lib/components/DeviceBoundRecovery.svelte';
  import RecoveryKeyEntry from '$lib/components/RecoveryKeyEntry.svelte';
  import PostRecoveryAccessMode from '$lib/components/PostRecoveryAccessMode.svelte';
  import { mintRecoveryKey, revokeRecoveryKey } from '$lib/data/recovery-key';
  import SessionUnlock from '$lib/components/SessionUnlock.svelte';
  import JournalGate from '$lib/components/JournalGate.svelte';
  import AccessModeSetup from '$lib/components/AccessModeSetup.svelte';
  import SchemaTooNew from '$lib/components/SchemaTooNew.svelte';
  import { PALETTES } from '../palettes.mjs';

  const SCENES = [
    /* The module, which is the one screen this ticket is really about: the
       list of modes, then the screen each mode leads to. */
    'access-choice',
    'access-change',
    /* The gates a cold start lands on, one per mode that asks for something. */
    'unlock-pin',
    'unlock-passphrase',
    'unlock-biometric',
    /* Mid-session, which asks for the same secrets in a different frame. */
    'session-pin',
    'session-passphrase',
    'session-biometric',
    'session-device',
    /* Unchanged by this ticket, kept so a regression in the shared shell
       shows up here rather than in the app. */
    'converting',
    'conversion-refused',
    'android-key',
    'android-key-no-lock',
    'android-key-invalidated',
    'device-recovery',
    'schema-too-new',
    /* The recovery-key screens (ADR-0054, ticket sec-02). Four of the five
       need a recovery wrap to exist in this origin's OPFS, because the
       components read the file rather than a prop - so the fixture writes a
       real one for them and takes it away again for the others, which is
       what `RECOVERY_SCENES` below is for. Nothing is faked: the wrap is
       minted through data/recovery-key.ts over a throwaway data key. */
    'recovery-entry',
    'post-recovery',
    'unlock-pin-with-key',
    'device-recovery-with-key',
    'android-key-invalidated-with-key'
  ];

  /** The scenes that need a recovery key on disk before they mount. */
  const RECOVERY_SCENES = new Set([
    'recovery-entry',
    'post-recovery',
    'unlock-pin-with-key',
    'device-recovery-with-key',
    'android-key-invalidated-with-key'
  ]);

  let scene = $state('access-choice');
  let palette = $state('trans');
  let theme = $state('dark');
  let platform = $state('web');

  /* The web stub has to be in place before the module's first mount, not
     after the first change of the selector: the default scene is the module
     itself. */
  setPlatform('web');

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
  });

  /* Set synchronously on the way in, not from an $effect. `isAndroid()` is
     read during render, and an effect runs after it - so the keyed remount
     read the *previous* stub and every Android shot came out showing the web
     labels. Assigning the global before the state it depends on is what
     makes the next render see it. */
  function setPlatform(next: string) {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor =
      next === 'android' ? { getPlatform: () => 'android' } : undefined;
    /* What data/webauthn-prf.ts asks before the module offers the row. The
       answers are the ones a browser with a platform authenticator gives;
       nothing here mints a credential, because these pictures are of the
       list, not of the prompt. */
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential =
      next === 'web'
        ? {
            getClientCapabilities: async () => ({ 'extension:prf': true }),
            isUserVerifyingPlatformAuthenticatorAvailable: async () => true
          }
        : undefined;
    platform = next;
  }

  /* Whether the wrap is on disk for the scene being shown. Held as its own
     state and included in the stage's guard below, because the components
     read the file when they mount: mounting first and writing after would
     draw the without-a-key half of every one of these screens. */
  let stageScene = $state<string | null>(null);

  $effect(() => {
    const wanted = scene;
    stageScene = null;
    void (async () => {
      if (RECOVERY_SCENES.has(wanted)) await mintRecoveryKey(new Uint8Array(32));
      else await revokeRecoveryKey();
      stageScene = wanted;
    })();
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
    } else if (scene === 'unlock-biometric') {
      Object.assign(bootState, bootTransitions.toNeedsUnlock(bootTransitions.setAccessMode(from, 'biometric')));
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
    } else if (scene === 'android-key-invalidated' || scene === 'android-key-invalidated-with-key') {
      const gate = bootTransitions.toNeedsAuthentication(from);
      Object.assign(bootState, bootTransitions.toNeedsAuthentication(gate, { kind: 'invalidated' }));
    } else if (scene === 'unlock-pin-with-key') {
      Object.assign(bootState, bootTransitions.toNeedsUnlock(bootTransitions.setAccessMode(from, 'pin')));
    } else if (scene === 'device-recovery' || scene === 'device-recovery-with-key') {
      Object.assign(bootState, bootTransitions.toNeedsDeviceRecovery(from));
    } else if (scene === 'post-recovery') {
      /* The one scene with an open journal behind it: this screen is not a
         gate, and rendering it over a `booting` state would draw it against
         the wrong access mode. A ready state needs a journal handle, and the
         module only reads the mode off it. */
      Object.assign(bootState, bootTransitions.setAccessMode(from, 'pin'));
    } else if (scene === 'schema-too-new') {
      Object.assign(bootState, bootTransitions.toSchemaTooNew(from));
    } else {
      // Every access-* scene is the first-run setup state.
      Object.assign(bootState, bootTransitions.toNeedsSetup(from));
    }
  });

  /* Which row of the module to open, if any. The screenshot script clicks
     it - the same way it clicks pad keys - rather than an effect here doing
     it: an effect that both drove the step and depended on it would re-run
     itself until Svelte gave up, which is a mistake this codebase has
     already made twice (boot.svelte.ts, and once in this file). */
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
    <select
      aria-label="Platform"
      value={platform}
      onchange={(event) => setPlatform((event.currentTarget as HTMLSelectElement).value)}
    >
      <option value="web">web</option>
      <option value="web-no-prf">web-no-prf</option>
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
      {#key `${platform}:${stageScene}`}
        <!-- Nothing until the recovery wrap is where this scene needs it. -->
        {#if stageScene !== scene}
          <!-- deliberately empty -->
        {:else if scene === 'recovery-entry'}
          <RecoveryKeyEntry onBack={() => {}} />
        {:else if scene === 'post-recovery'}
          <PostRecoveryAccessMode />
        {:else if scene === 'unlock-pin-with-key'}
          <JournalGate />
        {:else if scene === 'device-recovery-with-key'}
          <DeviceBoundRecovery />
        {:else if scene === 'android-key-invalidated-with-key'}
          <AndroidKeyGate />
        {:else if scene === 'access-change'}
          <!-- Settings' framing rather than a gate's: the same module, on a
               screen that has a journal open behind it. -->
          <div class="screen">
            <div class="card">
              <AccessModeSetup purpose="change" current="passphrase" onChoose={() => {}} />
            </div>
          </div>
        {:else if scene === 'access-choice'}
          <!-- The real gate, not a GateScreen composed here: the gate owns the
               title, and the title changes once a mode is picked. Composing a
               frame around the module meant the gallery kept showing "How
               should your journal open?" over a screen that had answered it. -->
          <JournalGate />
        {:else if scene === 'session-pin'}
          <SessionUnlock mode="pin" />
        {:else if scene === 'session-passphrase'}
          <SessionUnlock mode="passphrase" />
        {:else if scene === 'session-biometric'}
          <SessionUnlock mode="biometric" />
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
