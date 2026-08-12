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
     is not encrypted. The two screens are the same - a passphrase has to
     be chosen, or re-entered after an interrupted attempt - but the copy
     has to say what is about to happen to the entries that are already
     there, and say it BEFORE the passphrase is set rather than after
     (ADR-0018: setup states the consequence before conversion). The
     conversion itself gets a screen, and a conversion that cannot start
     gets one that says why in numbers. */

  import { m } from '$lib/paraglide/messages';
  import { bootState, submitPassphraseSetup, submitPassphraseUnlock, submitSkipSetup, resetApp } from '$lib/stores/boot.svelte';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import Icon from './Icon.svelte';
  import PrideAurora from './PrideAurora.svelte';
  import Sheet from './Sheet.svelte';

  let passphrase = $state('');
  let confirmation = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let skipOpen = $state(false);
  let skipAcknowledged = $state(false);
  let resetting = $state(false);

  let mode = $derived(bootState.status === 'needs-setup' ? 'setup' : 'unlock');
  /** The device holds a plaintext Journal, so this passphrase converts it
      rather than opening one. */
  let converting = $derived(bootState.conversion !== null);
  let canSkip = $derived(mode === 'setup' && !converting);

  /** Whole units, for a person deciding whether to go and delete
      something. Nobody needs three decimal places of megabyte, and both
      catalogues write the unit the same way. */
  function megabytes(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${Math.round(bytes / (1024 * 1024))} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  let progress = $derived(bootState.conversion?.progress ?? null);
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

  async function confirmSkip() {
    if (!skipAcknowledged || busy) return;

    busy = true;
    error = '';
    try {
      const result = await submitSkipSetup();
      if (result === 'ok') {
        skipOpen = false;
        return;
      }

      skipOpen = false;
      skipAcknowledged = false;
      error = result === 'needs-device-lock' ? m.pp_skip_no_device_lock() : m.pp_skip_unavailable();
    } finally {
      busy = false;
    }
  }
</script>

{#if bootState.status === 'conversion-refused'}
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="alert" size={30} /></div>
      <h1 class="ob-title" style="text-align:center">{m.pp_convert_refused_title()}</h1>
      <p class="ob-text" style="text-align:center" data-conversion-refusal>
        {#if bootState.conversionRefusal?.reason === 'not-enough-space'}
          {m.pp_convert_refused_space({
            need: megabytes(bootState.conversionRefusal.needBytes),
            free: megabytes(bootState.conversionRefusal.freeBytes)
          })}
        {:else if bootState.conversionRefusal?.reason === 'schema-too-new'}
          {m.pp_convert_refused_schema()}
        {/if}
      </p>
    </div>
  </div>
{:else if bootState.status === 'converting'}
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="lock" size={30} /></div>
      <h1 class="ob-title" style="text-align:center">{m.pp_converting_title()}</h1>
      <p class="ob-text" style="text-align:center" data-conversion-progress>{progressLine}</p>
      <!-- True, and worth saying: every step is written down before it
           happens, so a closed tab or a dead battery resumes rather than
           starts over (conversion.ts). -->
      <p class="ob-text small" style="text-align:center">{m.pp_converting_note()}</p>
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
      {#if converting && mode === 'setup'}{m.pp_convert_setup_title()}
      {:else if converting}{m.pp_convert_resume_title()}
      {:else if mode === 'setup'}{m.pp_setup_title()}
      {:else}{m.pp_unlock_title()}{/if}
    </h1>
    <p class="ob-text" style="text-align:center">
      {#if converting && mode === 'setup'}{m.pp_convert_setup_body()}
      {:else if converting}{m.pp_convert_resume_body()}
      {:else if mode === 'setup'}{m.pp_setup_body()}
      {:else}{m.pp_unlock_body()}{/if}
    </p>

    {#if canSkip}
      <div class="notice notice-warn" style="margin-top:var(--space-4)">
        <Icon name="info" size={20} />
        <div class="notice-body">
          <span class="notice-title">{m.pp_modes_title()}</span>
          <div>{m.pp_mode_passphrase()}</div>
          <div>{m.pp_mode_device()}</div>
          <div>{m.pp_mode_pin()}</div>
        </div>
      </div>
    {/if}

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
          {#if busy}{mode === 'setup' ? m.pp_encrypting() : m.pp_decrypting()}
          {:else if converting && mode === 'setup'}{m.pp_convert_submit_setup()}
          {:else if converting}{m.pp_convert_submit_resume()}
          {:else if mode === 'setup'}{m.pp_submit_setup()}
          {:else}{m.pp_submit_unlock()}{/if}
        </span>
      </button>
      {#if canSkip}
        <button class="btn btn-ghost" type="button" data-skip-passphrase disabled={busy} onclick={() => (skipOpen = true)}>
          <span>{m.pp_skip()}</span>
        </button>
      {/if}
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
{/if}

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

<Sheet bind:open={skipOpen} title={m.pp_skip_title()}>
  <h3>{m.pp_skip_title()}</h3>
  <p class="ob-text">{m.pp_skip_body()}</p>
  <label class="spread" style="align-items:flex-start;gap:var(--space-3);margin-top:var(--space-4)">
    <input type="checkbox" bind:checked={skipAcknowledged} data-skip-ack />
    <span class="small">{m.pp_skip_ack()}</span>
  </label>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-skip-passphrase disabled={!skipAcknowledged || busy} onclick={confirmSkip}>
      <span>{m.pp_skip_confirm()}</span>
    </button>
    <button
      class="btn btn-ghost"
      disabled={busy}
      onclick={() => {
        skipOpen = false;
        skipAcknowledged = false;
      }}
    >
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>
