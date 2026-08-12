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
        error = `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
        return;
      }
      if (passphrase !== confirmation) {
        error = 'Those two did not match.';
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
      error = 'That passphrase is not right.';
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
      error = 'Could not reset the app. Try again, or close and reopen it first.';
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
      {#if mode === 'setup'}Choose a journal passphrase{:else}Welcome back{/if}
    </h1>
    <p class="ob-text" style="text-align:center">
      {#if mode === 'setup'}
        Everything you write is encrypted on this device, and this passphrase is the only thing that opens it.
        Save it in a password manager now: Gender Diary has no account behind it and cannot recover the
        passphrase or the journal if it is lost.
      {:else}
        Enter your journal passphrase to decrypt your journal.
      {/if}
    </p>

    <form class="stack-3" onsubmit={submit} style="margin-top:var(--space-4)">
      <div>
        <label class="field-label" for="journal-passphrase">
          {mode === 'setup' ? 'Passphrase' : 'Journal passphrase'}
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
          <label class="field-label" for="journal-passphrase-confirm">Once more</label>
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
          {#if busy}{mode === 'setup' ? 'Encrypting…' : 'Decrypting…'}{:else}{mode === 'setup' ? 'Encrypt my journal' : 'Open my journal'}{/if}
        </span>
      </button>
    </form>

    {#if mode === 'unlock'}
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-ghost" data-forgot-passphrase onclick={() => (resetOpen = true)}>
          <span>Forgotten your passphrase?</span>
        </button>
      </div>
    {/if}
  </div>
</div>

<Sheet bind:open={resetOpen} title="Forgotten your passphrase?">
  <h3>Forgotten your passphrase?</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">There is no way to recover it</span>
      The journal is encrypted with a key only your passphrase can unwrap. Nobody, including this app, can
      read it back without one or the other.
    </div>
  </div>
  <p class="ob-text">
    You can start over instead. That deletes every entry, photo and setting on this device and takes you back
    to the welcome screen. If you have an archive from an earlier export, you can restore from it afterwards
    with the archive's own password.
  </p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? 'Deleting…' : 'Delete everything and start over'}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>Keep trying</span>
    </button>
  </div>
</Sheet>
