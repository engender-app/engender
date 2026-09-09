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

     Four shapes, one per mode that has a secret: a passphrase field, a PIN
     pad, Android's Keystore prompt, and the web biometric's own (ticket 55,
     where the platform prompt is the secret exactly as Keystore's is). Web
     device-bound mode has none, so it never reaches here - isLocked() is
     false for it, and quick exit's neutral page is the whole of what that
     combination can do. The settings copy says so rather than letting a
     switch imply otherwise. */

  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { unlockJournalPassphrase } from '$lib/data/journal-passphrase';
  import { unlockJournalPin } from '$lib/data/journal-pin';
  import { unlockJournalBiometric } from '$lib/data/journal-biometric';
  import { DeviceBindingUnavailableError } from '$lib/data/device-secret';
  import { markUnlocked } from '$lib/stores/lock.svelte';
  import { resetApp } from '$lib/stores/boot.svelte';
  import { confirmWithBiometrics } from '$lib/lock/android-key';
  import { androidKeystore } from '$lib/lock/keystore-bridge';
  import { isAndroid } from '$lib/platform';
  import { appWordmark } from '$lib/disguise/identity';
  import { openApp } from '$lib/motion/appOpening';
  import { ui } from '$lib/stores/ui.svelte';
  import type { JournalAccessMode } from '$lib/data/journal-access-mode';
  import GateScreen from './GateScreen.svelte';
  import PinEntry, { type PinAttempt } from './PinEntry.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { mode }: { mode: JournalAccessMode } = $props();

  /* What every one of the four ways in below ends on: the app coming back,
     as the field opening from this screen's title onto the one Home draws
     rather than this screen being replaced (redesign ticket 34).

     Here rather than inside `markUnlocked`, which the cold-start gates reach
     through the boot machine's own `mark-unlocked` effect: that path is
     already inside a transition by the time the effect runs, and starting a
     second one from under the first skips it - the app would appear in a
     single frame, which is exactly what this exists to stop. */
  const opened = () => {
    ui.appOpening = true;
    void openApp(markUnlocked).finally(() => (ui.appOpening = false));
  };

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
      opened();
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
      opened();
    } catch (e) {
      const deviceGone = isAndroid() ? m.su_device_key_gone_android() : m.su_device_key_gone();
      error = e instanceof DeviceBindingUnavailableError ? deviceGone : m.pp_wrong();
    } finally {
      busy = false;
    }
  }

  /* The web biometric: the authenticator's prompt is the secret, so this is
     one button and one sentence, the same shape Android's below has. */
  async function useBiometric() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await unlockJournalBiometric();
      opened();
    } catch (e) {
      console.error('the biometric unlock failed', e);
      error = m.bm_unlock_failed();
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
        opened();
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
    mode === 'pin'
      ? m.su_pin_body()
      : mode === 'passphrase'
        ? m.su_passphrase_body()
        : mode === 'biometric'
          ? m.bm_unlock_body()
          : m.su_device_body()
  );

  /** Which sentence the way out gets. Only passphrase and PIN can be
      forgotten; the two prompt-driven modes have a device that will not
      answer instead. */
  let wayOut = $derived(mode === 'pin' ? m.pin_forgot() : mode === 'biometric' ? m.bm_no_way_in() : m.pp_forgot());

  /* The one gate that can greet by name, and the whole of why: the journal is
     open behind this screen, so `prefs.name` has been read. Everything else
     about a gate's title - the wordmark where there is nobody to greet, and
     why it goes through `appWordmark` - is argued in GateScreen.svelte. */
  let title = $derived(
    prefs.name ? m.pin_greeting_named({ name: prefs.name }) : appWordmark(prefs.disguise, m.app_name())
  );
</script>

<GateScreen {title} data-applock>
  <p class="gate-body">{body}</p>

  {#if mode === 'pin'}
    <PinEntry onVerify={submitPin} />
  {:else}
    <p class="pin-status small" role="alert" data-pin-status={error ? 'wrong' : 'idle'}>{error}</p>
  {/if}

  {#if mode === 'passphrase'}
    <form class="gate-form" onsubmit={submitPassphrase}>
      <!-- On the rule, like every other typed answer at a gate (rule 13). -->
      <div class="typed">
        <label class="field-label" for="session-passphrase">{m.pp_label_unlock()}</label>
        <input
          class="rule-input"
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
  {:else if mode === 'biometric'}
    <div class="gate-actions">
      <button class="btn btn-primary" data-session-biometric disabled={busy} onclick={useBiometric}>
        <span>{busy ? m.pp_decrypting() : m.bm_unlock_action()}</span>
      </button>
    </div>
  {:else if mode === 'device-bound' && isAndroid()}
    <div class="gate-actions">
      <button class="btn btn-primary" data-session-device-lock disabled={busy} onclick={useDeviceLock}>
        <span>{busy ? m.ak_unlocking() : m.ak_unlock_action()}</span>
      </button>
    </div>
  {/if}

  <div class="gate-foot">
    <button class="btn btn-ghost" data-forgot onclick={() => (resetOpen = true)}>
      <span>{wayOut}</span>
    </button>
    {#if prefs.lockOnLeave || prefs.quickExit}
      <p class="gate-note">
        {prefs.lockOnLeave ? m.lock_auto_note() + ' ' : ''}
        {prefs.quickExit ? m.lock_quick_exit_note() : ''}
      </p>
    {/if}
  </div>
</GateScreen>

<Sheet bind:open={resetOpen} title={wayOut}>
  <h3>{wayOut}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.pp_forgot_no_recovery()}</span>
      {mode === 'biometric' ? m.bm_forgot_key_note() : m.pp_forgot_key_note()}
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
