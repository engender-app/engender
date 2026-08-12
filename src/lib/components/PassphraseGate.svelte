<script lang="ts">
  /* The passphrase screens (ticket 09): setup on a first run, unlock on
     every later cold start. Rendered by the layout instead of the app,
     like LockScreen, so no route can show journal content before the
     database can even be opened.

     Copy rules: setup recommends a password manager and says plainly that
     Gender Diary cannot recover the passphrase (ADR-0018). Unlike the PIN
     (ADR-0014), this passphrase IS the wall in front of the data - the
     copy may say so. A wrong passphrase and a damaged keystore are one
     indistinguishable failure (aesGcm.ts), so the error names only the
     likely cause and never diagnoses. */

  import { m } from '$lib/paraglide/messages';
  import { bootState, submitPassphraseSetup, submitPassphraseUnlock, resetApp } from '$lib/stores/boot.svelte';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import Icon from './Icon.svelte';
  import PrideAurora from './PrideAurora.svelte';
  import Sheet from './Sheet.svelte';

  let passphrase = $state('');
  let confirmation = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);

  let mode = $derived(bootState.status === 'needs-setup' ? 'setup' : 'unlock');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';

    if (mode === 'setup') {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        error = m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) });
        return;
      }
      if (passphrase !== confirmation) {
        error = m.pp_mismatch();
        return;
      }
    }

    busy = true;
    try {
      if (mode === 'setup') await submitPassphraseSetup(passphrase);
      else await submitPassphraseUnlock(passphrase);
      passphrase = '';
      confirmation = '';
    } catch {
      // DecryptionFailedError, deliberately undiagnosed (see header).
      error = m.pp_wrong();
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

<div class="screen">
  <PrideAurora />
  <div class="applock">
    <div class="applock-badge"><Icon name="lock" size={30} /></div>
    <!-- No name in the unlock greeting on purpose: the display name lives in
         the encrypted journal, and this screen renders before it can be read. -->
    <h1 class="ob-title" style="text-align:center">
      {#if mode === 'setup'}{m.pp_setup_title()}{:else}{m.pp_unlock_title()}{/if}
    </h1>
    <p class="ob-text" style="text-align:center">
      {#if mode === 'setup'}{m.pp_setup_body()}{:else}{m.pp_unlock_body()}{/if}
    </p>

    <form class="stack-3" onsubmit={submit} style="margin-top:var(--space-4)">
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
      {#if mode === 'setup'}
        <div>
          <label class="field-label" for="journal-passphrase-confirm">{m.pp_label_confirm()}</label>
          <input
            class="input"
            type="password"
            id="journal-passphrase-confirm"
            name="confirmation"
            autocomplete="new-password"
            bind:value={confirmation}
            disabled={busy}
          />
        </div>
      {/if}
      <p class="pin-status small" role="alert" data-passphrase-status>{error}</p>
      <button class="btn btn-primary" type="submit" data-passphrase-submit disabled={busy}>
        <span>
          {#if busy}{mode === 'setup' ? m.pp_encrypting() : m.pp_decrypting()}{:else}{mode === 'setup' ? m.pp_submit_setup() : m.pp_submit_unlock()}{/if}
        </span>
      </button>
    </form>

    {#if mode === 'unlock'}
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-ghost" data-forgot-passphrase onclick={() => (resetOpen = true)}>
          <span>{m.pp_forgot()}</span>
        </button>
      </div>
    {/if}
  </div>
</div>

<Sheet bind:open={resetOpen} title={m.pp_forgot()}>
  <h3>{m.pp_forgot()}</h3>
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
