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
     likely cause and never diagnoses.

     Ticket 10 adds the case where the device already holds a Journal that
     is not encrypted. The screens are the same two - a passphrase has to
     be chosen, or re-entered after an interrupted attempt - but the copy
     has to say what is about to happen to the entries that are already
     there, and it has to say it BEFORE the passphrase is set rather than
     after (ADR-0018: setup states the consequence before conversion).
     Then the conversion itself gets a screen, and a conversion that
     cannot start gets one that says why in numbers. */

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
  /** The device holds a plaintext Journal, so this passphrase converts it
      rather than starting an empty one. */
  let converting = $derived(bootState.conversion !== null);

  /** Whole numbers with a unit, for a person deciding whether to go and
      delete something. Nobody needs three decimal places of megabyte. */
  function megabytes(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${Math.round(bytes / (1024 * 1024))} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  let progress = $derived(bootState.conversion?.progress ?? null);
  let progressLine = $derived(
    progress === null
      ? 'Getting ready…'
      : progress.stage === 'database'
        ? 'Copying your journal into encrypted storage…'
        : progress.stage === 'photos'
          ? progress.total === 0
            ? 'No photos to encrypt.'
            : `Encrypting photos: ${progress.done} of ${progress.total}.`
          : 'Removing the old unencrypted copy…'
  );

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

{#if bootState.status === 'conversion-refused'}
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="alert" size={30} /></div>
      <h1 class="ob-title" style="text-align:center">Not yet</h1>
      {#if bootState.conversionRefusal?.reason === 'not-enough-space'}
        <p class="ob-text" style="text-align:center" data-conversion-refusal>
          Encrypting your journal means writing a second copy of it before the first one goes, and there is
          not enough room on this device: it needs about {megabytes(bootState.conversionRefusal.needBytes)} free
          and has {megabytes(bootState.conversionRefusal.freeBytes)}. Free some space and open Gender Diary
          again. Nothing has been changed.
        </p>
      {:else if bootState.conversionRefusal?.reason === 'schema-too-new'}
        <p class="ob-text" style="text-align:center" data-conversion-refusal>
          This journal was last opened by a newer version of Gender Diary, and this one would not understand
          all of it. Update the app, then open it again. Nothing has been changed.
        </p>
      {/if}
    </div>
  </div>
{:else if bootState.status === 'converting'}
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="lock" size={30} /></div>
      <h1 class="ob-title" style="text-align:center">Encrypting your journal</h1>
      <p class="ob-text" style="text-align:center" data-conversion-progress>{progressLine}</p>
      <!-- True, and worth saying: every step is written down before it
           happens, so a closed tab or a dead battery resumes rather than
           starts over (conversion.ts). -->
      <p class="ob-text small" style="text-align:center">
        This can take a while on a big journal. If it stops, opening Gender Diary again picks up where it
        left off.
      </p>
    </div>
  </div>
{:else}
<div class="screen">
  <PrideAurora />
  <div class="applock">
    <div class="applock-badge"><Icon name="lock" size={30} /></div>
    <!-- No name in the unlock greeting on purpose: the display name lives in
         the encrypted journal, and this screen renders before it can be read. -->
    <h1 class="ob-title" style="text-align:center">
      {#if converting && mode === 'setup'}Encrypt what you have written
      {:else if converting}Finish encrypting your journal
      {:else if mode === 'setup'}Choose a journal passphrase
      {:else}Welcome back{/if}
    </h1>
    <p class="ob-text" style="text-align:center">
      {#if converting && mode === 'setup'}
        Your journal is on this device but it is not encrypted yet. Choosing a passphrase now encrypts every
        entry, photo and setting already in it, and from then on this passphrase is the only thing that opens
        them. Save it in a password manager before you continue: Gender Diary has no account behind it and
        cannot recover the passphrase or the journal if it is lost.
      {:else if converting}
        Encrypting your journal was interrupted. Enter the passphrase you chose and it will carry on from
        where it stopped. Everything you had written is still here.
      {:else if mode === 'setup'}
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
          {#if busy}{mode === 'setup' ? 'Encrypting…' : 'Decrypting…'}
          {:else if converting && mode === 'setup'}Encrypt everything
          {:else if converting}Carry on encrypting
          {:else if mode === 'setup'}Encrypt my journal
          {:else}Open my journal{/if}
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
{/if}

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
