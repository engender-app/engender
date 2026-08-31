<script lang="ts">
  /* Getting back in mid-session (ticket 53, replacing LockScreen's unlock
     job).

     Lock-on-leave and quick exit lock the app while the unlocked data key is
     still in memory, so this screen only has to establish that the person in
     front of it is the one who opened the journal. It does that by asking for
     the access mode's own secret and actually re-deriving with it, rather
     than by comparing against a second, weaker secret kept around to make
     re-entry cheap. That second secret was the app-lock PIN, and ADR-0041
     retires it: one word, one meaning.

     The price is one Argon2id derivation per re-entry, which is honest and
     which the PIN profile was sized around (crypto/params.ts).

     Three shapes, one per mode that has a secret. Web device-bound mode has
     none, so it never reaches here - isLocked() is false for it, and quick
     exit's neutral page is the whole of what that combination can do. The
     settings copy says so rather than letting a switch imply otherwise. */

  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { unlockJournalPassphrase } from '$lib/data/journal-passphrase';
  import { unlockJournalPin } from '$lib/data/journal-pin';
  import { DeviceBindingUnavailableError } from '$lib/data/device-secret';
  import { markUnlocked } from '$lib/stores/lock.svelte';
  import { resetApp } from '$lib/stores/boot.svelte';
  import { confirmWithBiometrics } from '$lib/lock/android-key';
  import { androidKeystore } from '$lib/lock/keystore-bridge';
  import { isAndroid } from '$lib/platform';
  import type { JournalAccessMode } from '$lib/data/journal-access-mode';
  import GateScreen, { gateBodyClass } from './GateScreen.svelte';
  import PinEntry, { type PinAttempt } from './PinEntry.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { mode }: { mode: JournalAccessMode } = $props();

  let passphrase = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);

  /* PIN mode's attempts go through PinEntry, which owns the pad and the
     growing delay for both this screen and the cold-start gate. */
  async function submitPin(entered: string): Promise<PinAttempt> {
    try {
      await unlockJournalPin(entered);
      markUnlocked();
      return 'ok';
    } catch (e) {
      return e instanceof DeviceBindingUnavailableError ? 'device-gone' : 'wrong';
    }
  }

  /* The passphrase has its own field and its own button, and no throttle:
     its input space is not something anybody types their way through, and
     the derivation itself is the wall (crypto/params.ts). */
  async function submitPassphrase(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      await unlockJournalPassphrase(passphrase);
      passphrase = '';
      markUnlocked();
    } catch (e) {
      error = e instanceof DeviceBindingUnavailableError ? m.su_device_key_gone() : m.pp_wrong();
    } finally {
      busy = false;
    }
  }

  /* Android device-bound mode: the Keystore prompt is the secret. Unlike the
     retired PIN pad's biometric key, this is the only way in for this mode,
     so a refusal leaves the button rather than a line beside a keypad. */
  async function useDeviceLock() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const result = await confirmWithBiometrics(androidKeystore, {
        title: m.ak_prompt_title(),
        subtitle: m.ak_prompt_subtitle(),
        cancel: m.ak_prompt_cancel(),
        deviceCredential: false
      });
      if (result.unlocksJournal) {
        markUnlocked();
        return;
      }
      error =
        result.outcome === 'unenrolled' ? m.ak_unenrolled()
        : result.outcome === 'unavailable' ? m.ak_unavailable()
        : result.outcome === 'lockedOut' ? m.ak_locked_out()
        : result.outcome === 'cancelled' ? m.ak_cancelled()
        : m.ak_failed();
    } catch (e) {
      console.error('the device-lock prompt failed', e);
      error = m.ak_failed();
    } finally {
      busy = false;
    }
  }

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (e) {
      // The reason belongs in the console, not on a lock screen: "could not
      // remove entry" tells the person holding the phone nothing they can
      // act on.
      console.error('the app reset failed', e);
      resetting = false;
      resetOpen = false;
      error = m.reset_failed();
    }
  }

  let body = $derived(
    mode === 'pin' ? m.su_pin_body() : mode === 'passphrase' ? m.su_passphrase_body() : m.su_device_body()
  );

  let title = $derived(prefs.name ? m.pin_greeting_named({ name: prefs.name }) : m.pin_greeting());
</script>

<GateScreen icon="lock" {title} data-applock>
  <p class={gateBodyClass(body)}>{body}</p>

  {#if mode === 'pin'}
    <PinEntry onVerify={submitPin} />
  {:else}
    <p class="pin-status small" role="alert" data-pin-status={error ? 'wrong' : 'idle'}>{error}</p>
  {/if}

  {#if mode === 'passphrase'}
    <form class="gate-form" onsubmit={submitPassphrase}>
      <div>
        <label class="field-label" for="session-passphrase">{m.pp_label_unlock()}</label>
        <input
          class="input"
          type="password"
          id="session-passphrase"
          name="passphrase"
          autocomplete="current-password"
          bind:value={passphrase}
          disabled={busy}
        />
      </div>
      <button class="btn btn-primary" type="submit" data-session-submit disabled={busy}>
        <span>{busy ? m.pp_decrypting() : m.pp_submit_unlock()}</span>
      </button>
    </form>
  {:else if mode === 'device-bound' && isAndroid()}
    <div class="gate-actions">
      <button class="btn btn-primary" data-session-device-lock disabled={busy} onclick={useDeviceLock}>
        <span>{busy ? m.ak_unlocking() : m.ak_unlock_action()}</span>
      </button>
    </div>
  {/if}

  <div class="gate-foot">
    <button class="btn btn-ghost" data-forgot onclick={() => (resetOpen = true)}>
      <span>{mode === 'pin' ? m.pin_forgot() : m.pp_forgot()}</span>
    </button>
    {#if prefs.lockOnLeave || prefs.quickExit}
      <p class="gate-note">
        {prefs.lockOnLeave ? m.lock_auto_note() + ' ' : ''}
        {prefs.quickExit ? m.lock_quick_exit_note() : ''}
      </p>
    {/if}
  </div>
</GateScreen>

<Sheet bind:open={resetOpen} title={mode === 'pin' ? m.pin_forgot() : m.pp_forgot()}>
  <h3>{mode === 'pin' ? m.pin_forgot() : m.pp_forgot()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.pp_forgot_no_recovery()}</span>
      {m.pp_forgot_key_note()}
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
