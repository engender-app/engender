<script lang="ts">
  /* The pre-unlock gate (ticket 09, rebuilt by ticket 53), formerly
     PassphraseGate. Renamed because it no longer only asks for a passphrase:
     a first run picks an access mode here through the setup module, and an
     unlock asks for whichever secret the chosen mode uses. Rendered by the
     layout instead of the app, like AndroidKeyGate, so no route can show
     journal content before the database can even be opened.

     Four screens live here. Setup is the module (AccessModeSetup) with no
     "Skip" in it, because device-bound mode is one of its rows now rather
     than the way past a wall. Unlock is a passphrase field, a PIN pad or a
     single button that asks the device (ticket 55), chosen by the mode the
     keystore itself recorded. The other two are the conversion screens,
     unchanged.

     Copy rules: setup's per-mode consequences belong to the module, which
     states each before it is chosen. Unlock keeps the rule it always had -
     a wrong secret and a damaged keystore are one indistinguishable failure
     (aesGcm.ts), so the error names only the likely cause and never
     diagnoses. The failures that are not that get their own sentences,
     because no amount of retyping fixes them: a PIN whose device key has
     gone, and an authenticator that will not release the biometric secret.

     Ticket 10's case still applies. Where the device already holds a Journal
     that is not encrypted, the copy has to say what is about to happen to
     the entries already there, and say it BEFORE the secret is set rather
     than after (ADR-0018). A conversion therefore skips the mode choice and
     asks for a passphrase directly: conversion is the one path where the
     mode is not a free choice, since it has to survive the rewrite. */

  import { m } from '$lib/paraglide/messages';
  import {
    bootState,
    submitPassphraseSetup,
    submitPassphraseUnlock,
    submitPinSetup,
    submitPinUnlock,
    submitBiometricSetup,
    submitBiometricUnlock,
    submitDeviceBoundSetup,
    resetApp
  } from '$lib/stores/boot.svelte';
  import { passphraseMode, passphraseScreen } from '$lib/stores/boot-state';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { DeviceBindingUnavailableError } from '$lib/data/device-secret';
  import { BiometricUnavailableError } from '$lib/data/webauthn-prf';
  import GateScreen, { gateBodyClass } from './GateScreen.svelte';
  import AccessModeSetup, { accessModeTitle, type AccessSetupMode } from './AccessModeSetup.svelte';
  import PinEntry, { type PinAttempt } from './PinEntry.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let passphrase = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);
  /* Which row of the module is open, so this gate's own title can name it
     rather than leaving "How should your journal open?" over a screen where
     that has already been answered. */
  let chosenMode = $state<AccessSetupMode | null>(null);

  let mode = $derived(passphraseMode(bootState));
  let screen = $derived(passphraseScreen(bootState));
  /** The device holds a plaintext Journal, so this secret converts it rather
      than opening one. */
  let converting = $derived(bootState.conversion !== null);
  /** Which secret an unlock is asking for, read off the keystore rather than
      guessed: boot recorded it during the survey. */
  let unlockingPin = $derived(mode === 'unlock' && bootState.accessMode === 'pin');
  /** The one unlock with nothing to type: the platform's own prompt is the
      secret, and this screen is a button and a sentence around it. */
  let unlockingBiometric = $derived(mode === 'unlock' && bootState.accessMode === 'biometric');
  /** A first run offers the module. A conversion does not - it needs a
      passphrase specifically, and says why above the field. */
  let choosingMode = $derived(mode === 'setup' && !converting);

  /** Whole units, for a person deciding whether to go and delete
      something. Nobody needs three decimal places of megabyte, and both
      catalogues write the unit the same way. */
  function megabytes(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${Math.round(bytes / (1024 * 1024))} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /* Hoisted out of the template so its length can decide whether it is a
     line to centre or a paragraph to left-align (GateScreen). */
  let formBody = $derived(
    converting && mode === 'setup'
      ? m.pp_convert_setup_body()
      : converting
        ? m.pp_convert_resume_body()
        : unlockingPin
          ? m.su_pin_body()
          : unlockingBiometric
            ? m.bm_unlock_body()
            : m.pp_unlock_body()
  );

  let refusalBody = $derived(
    bootState.conversionRefusal?.reason === 'not-enough-space'
      ? m.pp_convert_refused_space({
          need: megabytes(bootState.conversionRefusal.needBytes),
          free: megabytes(bootState.conversionRefusal.freeBytes)
        })
      : bootState.conversionRefusal?.reason === 'schema-too-new'
        ? m.pp_convert_refused_schema()
        : ''
  );

  let progress = $derived(bootState.conversion?.progress ?? null);
  /** The photo stage, and only where there is something to divide by: the
      other two stages have no count, and a journal with no photos reports a
      total of zero. */
  let photoProgress = $derived(
    progress?.stage === 'photos' && progress.total > 0
      ? { done: progress.done, total: progress.total }
      : null
  );
  let progressLine = $derived(
    progress === null
      ? m.pp_converting_preparing()
      : progress.stage === 'database'
        ? m.pp_converting_database()
        : progress.stage === 'photos'
          ? progress.total === 0
            ? m.pp_converting_no_photos()
            : m.pp_converting_photos({ done: String(progress.done), total: String(progress.total) })
          : m.pp_converting_retire()
  );

  /* The way-out sheet says which secret is missing, and biometric mode has
     none to have forgotten - what it has is a device that will not answer.
     One derived value rather than the same conditional in three places: the
     sheet's title, its heading and the button that opens it have to agree,
     and the button already said "Forgotten your PIN?" over a sheet that said
     passphrase. */
  let wayOut = $derived(
    unlockingPin ? m.pin_forgot() : unlockingBiometric ? m.bm_no_way_in() : m.pp_forgot()
  );

  let gateTitle = $derived(
    converting && mode === 'setup'
      ? m.pp_convert_setup_title()
      : converting
        ? m.pp_convert_resume_title()
        : choosingMode
          ? chosenMode === null
            ? m.am_setup_title()
            : accessModeTitle(chosenMode)
          : unlockingPin
            ? m.pin_greeting()
            : m.pp_unlock_title()
  );

  /** The setup module's answer. Device-bound mode is the one that can be
      refused by the platform rather than by the person, so it is the one with
      outcomes to render. */
  async function choose(chosen: AccessSetupMode, secret: string) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      if (chosen === 'device-bound') {
        const result = await submitDeviceBoundSetup();
        if (result === 'ok') return;
        error = result === 'needs-device-lock' ? m.am_device_no_lock() : m.am_device_unavailable();
        return;
      }
      if (chosen === 'pin') await submitPinSetup(secret);
      else if (chosen === 'biometric') await submitBiometricSetup();
      else await submitPassphraseSetup(secret);
    } catch (e) {
      console.error('setting up the access mode failed', e);
      /* A device that will not release a secret has not failed at setup, it
         has answered that it cannot do this mode - so the sentence sends the
         person to another row rather than inviting a retry at a wall. */
      error = e instanceof BiometricUnavailableError ? m.am_biometric_unavailable() : m.am_setup_failed();
    } finally {
      busy = false;
    }
  }

  async function submitPassphrase(event: SubmitEvent) {
    event.preventDefault();
    if (busy || mode === null) return;
    error = '';

    if (mode === 'setup') {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        error = m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) });
        return;
      }
    }

    busy = true;
    try {
      if (mode === 'setup') await submitPassphraseSetup(passphrase);
      else await submitPassphraseUnlock(passphrase);
      passphrase = '';
    } catch {
      // DecryptionFailedError, deliberately undiagnosed (see header).
      error = m.pp_wrong();
    } finally {
      busy = false;
    }
  }

  /* PinEntry owns the pad, the growing delay and the status line; this only
     has to say what an attempt came to. The device-key failure is reported
     rather than thrown away because it is the one outcome retyping cannot
     fix, and PinEntry keeps it off the throttle for the same reason. */
  async function submitPin(entered: string): Promise<PinAttempt> {
    try {
      await submitPinUnlock(entered);
      return 'ok';
    } catch (e) {
      return e instanceof DeviceBindingUnavailableError ? 'device-gone' : 'wrong';
    }
  }

  /* No throttle and no attempt count: the authenticator does its own, and
     there is nothing here a person could get wrong twice. */
  async function useBiometric() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await submitBiometricUnlock();
    } catch (e) {
      console.error('the biometric unlock failed', e);
      error = m.bm_unlock_failed();
    } finally {
      busy = false;
    }
  }

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (e) {
      console.error('the app reset failed', e);
      resetting = false;
      resetOpen = false;
      error = m.reset_failed();
    }
  }
</script>

{#if screen === 'conversion-refused'}
  <GateScreen icon="alert" tone="alert" title={m.pp_convert_refused_title()}>
    <p class={gateBodyClass(refusalBody)} data-conversion-refusal>{refusalBody}</p>
  </GateScreen>
{:else if screen === 'converting'}
  <GateScreen icon="lock" title={m.pp_converting_title()}>
    <!-- SF-004: conversion used to advance through stages with no
         announcement - a silent content swap for anyone not watching
         the screen during a process that can take a while. -->
    <p class="gate-body" role="status" data-conversion-progress>{progressLine}</p>
    {#if photoProgress}
      <!-- The one stage that knows how far along it is. It was spending that
           on a sentence alone, on a screen that can hold someone for
           minutes; the bar is the same two numbers as a length. -->
      <div
        class="rail gate-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={photoProgress.total}
        aria-valuenow={photoProgress.done}
        data-conversion-bar
      >
        <i style={`transform: scaleX(${photoProgress.done / photoProgress.total})`}></i>
      </div>
    {/if}
    <!-- True, and worth saying: every step is written down before it
         happens, so a closed tab or a dead battery resumes rather than
         starts over (conversion.ts). -->
    <p class="gate-body is-small" style="margin-top:var(--space-4)">{m.pp_converting_note()}</p>
  </GateScreen>
{:else if screen === 'form'}
  <!-- No name in the unlock greeting on purpose: the display name lives in
       the encrypted journal, and this screen renders before it can be read. -->
  <GateScreen icon={choosingMode ? 'shield' : 'lock'} title={gateTitle}>
    {#if choosingMode}
      <AccessModeSetup purpose="setup" {busy} {error} onChoose={choose} bind:chosen={chosenMode} />
    {:else}
      <p class={gateBodyClass(formBody)}>{formBody}</p>

      {#if unlockingPin}
        <PinEntry onVerify={submitPin} />
      {:else if unlockingBiometric}
        <div class="gate-actions">
          <button class="btn btn-primary" data-biometric-submit disabled={busy} onclick={useBiometric}>
            <span>{busy ? m.pp_decrypting() : m.bm_unlock_action()}</span>
          </button>
        </div>
        <p class="pin-status small" role="alert" data-passphrase-status>{error}</p>
      {:else}
        <form class="gate-form" onsubmit={submitPassphrase}>
          <div>
            <label class="field-label" for="journal-passphrase">
              {mode === 'setup' ? m.pp_label_setup() : m.pp_label_unlock()}
            </label>
            <input
              class="input"
              type="password"
              id="journal-passphrase"
              name="passphrase"
              autocomplete={mode === 'setup' ? 'new-password' : 'current-password'}
              bind:value={passphrase}
              disabled={busy}
            />
          </div>
          <p class="pin-status small" role="alert" data-passphrase-status>{error}</p>
          <button class="btn btn-primary" type="submit" data-passphrase-submit disabled={busy}>
            <span>
              {#if busy}{mode === 'setup' ? m.pp_encrypting() : m.pp_decrypting()}
              {:else if converting && mode === 'setup'}{m.pp_convert_submit_setup()}
              {:else if converting}{m.pp_convert_submit_resume()}
              {:else if mode === 'setup'}{m.pp_submit_setup()}
              {:else}{m.pp_submit_unlock()}{/if}
            </span>
          </button>
        </form>
      {/if}

      {#if mode === 'unlock'}
        <div class="gate-foot">
          <button class="btn btn-ghost" data-forgot-passphrase onclick={() => (resetOpen = true)}>
            <span>{wayOut}</span>
          </button>
        </div>
      {/if}
    {/if}
  </GateScreen>
{/if}

<Sheet bind:open={resetOpen} title={wayOut}>
  <h3>{wayOut}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.pp_forgot_no_recovery()}</span>
      {unlockingBiometric ? m.bm_forgot_key_note() : m.pp_forgot_key_note()}
    </div>
  </div>
  <p class="ob-text">{m.reset_offer_archive_password()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>
