<script lang="ts">
  /* The way out of a journal the key cannot read (ux-carpet 210). "Try
     opening again" was the only button on that error, and retrying never
     opens a file under a key that does not match it, so a phone left like
     that had nothing to press short of uninstalling. The two doors here are
     the ones DeviceBoundRecovery already offers for its own dead end, with
     its copy and its confirmation, so the loss is stated before it happens
     in the same words. */
  import { m } from '$lib/paraglide/messages';
  import { resetApp } from '$lib/stores/boot.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let resetOpen = $state(false);
  let restoringArchive = $state(false);
  let resetting = $state(false);
  let resetError = $state('');

  function open(archive: boolean) {
    restoringArchive = archive;
    resetOpen = true;
  }

  async function confirmReset() {
    if (resetting) return;
    resetting = true;
    try {
      await resetApp(restoringArchive ? 'restore' : 'welcome');
    } catch (error) {
      console.error('the app reset failed', error);
      resetting = false;
      resetOpen = false;
      resetError = m.reset_failed();
    }
  }
</script>

<div class="stack-3" style="margin-top:var(--space-2)">
  <button class="btn btn-soft" data-unreadable-archive onclick={() => open(true)}>
    <span>{m.dbr_archive_open()}</span>
  </button>
  <button class="btn btn-soft" data-unreadable-reset onclick={() => open(false)}>
    <span>{m.dbr_open_reset()}</span>
  </button>
</div>
{#if resetError}
  <p style="margin-top:var(--space-2)" role="alert" data-unreadable-reset-failed>{resetError}</p>
{/if}

<Sheet
  bind:open={resetOpen}
  title={restoringArchive ? m.dbr_archive_open() : m.dbr_open_reset()}
  onRequestClose={() => {
    if (!resetting) resetOpen = false;
  }}
>
  <h3>{restoringArchive ? m.dbr_archive_open() : m.dbr_open_reset()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      {restoringArchive ? m.dbr_archive_replace_body() : m.reset_offer_archive_password()}
    </div>
  </div>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-unreadable-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : restoringArchive ? m.dbr_archive_confirm() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>
