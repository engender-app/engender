<script lang="ts">
  /* What a failed boot says (after-release ticket 09). Moved out of
     +layout.svelte so the gates fixture can draw it for each failure; the
     layout still decides when it shows.

     It used to print the exception: "table entry already exists" or "file is
     not a database (code 26)" under "Couldn't open your journal", which is
     the payload rather than the person's situation. Each failure the boot
     can name now gets a sentence (boot-state.ts's BootFailure), and the raw
     text sits behind one control for a bug report.

     The doors follow from the failure rather than being offered everywhere:
     a retry is pointless for a development build's journal, and putting the
     previous copy back would reopen that same journal, so that failure gets
     the start-over way out instead, like a journal the key cannot read. */
  import { m } from '$lib/paraglide/messages';
  import { bootState, restorePreviousJournal, retryBoot } from '$lib/stores/boot.svelte';
  import type { BootFailure } from '$lib/stores/boot-state';
  import { toast } from '$lib/stores/toasts.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { createProgress } from './progress.svelte';
  import Icon from './Icon.svelte';

  let failure = $derived<BootFailure>(bootState.failure ?? 'unknown');

  const SENTENCE: Record<BootFailure, () => string> = {
    unreadable: m.boot_failed_unreadable,
    'below-baseline': m.boot_failed_below_baseline,
    'android-plaintext': m.ak_plaintext_journal,
    engine: m.boot_failed_engine,
    unknown: m.boot_failed_unknown
  };

  /** Where starting over is the way forward: the key cannot read the file,
      or the file comes from a build this one cannot carry forward. */
  let offersWayOut = $derived(failure === 'unreadable' || failure === 'below-baseline');

  /* Putting the pre-migration copy back (ticket 04). Only reachable from
     here, and only when boot found a copy to put back. Indeterminate, and
     it will stay that way (phase 9 audit ticket 11): the restore is one file
     copy inside the SQLite worker or the native driver with no callback out
     of it, so a sweep says the honest thing where a bar would have to make a
     number up. Immediate rather than delayed, because this notice is the
     failed boot and there is nothing else on the screen to flash over. */
  let restoring = $state(false);
  let restoreFailed = $state(false);
  const restoreProgress = createProgress();
  async function restore() {
    restoring = true;
    restoreFailed = false;
    restoreProgress.start({ immediate: true });
    try {
      // Reloads on success, so nothing after this runs.
      await restorePreviousJournal();
    } catch (e) {
      console.error('restoring the pre-migration copy failed', e);
      restoreProgress.abandon();
      restoring = false;
      restoreFailed = true;
    }
  }

  let retrying = $state(false);
  async function retry() {
    retrying = true;
    try {
      await retryBoot();
    } finally {
      retrying = false;
    }
  }

  /* The raw text, for whoever reads the bug report. It names the version
     and the failure it was filed under, which the text alone does not. The
     clipboard can refuse (no user activation left, a WebView without the
     permission), and then the same text opens in place to select by hand. */
  let details = $derived(`${__APP_VERSION__} · ${failure}\n${bootState.error ?? ''}`);
  let detailsShown = $state(false);
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(details);
      toast(m.boot_details_copied());
    } catch (e) {
      console.warn('copying the boot failure details failed', e);
      detailsShown = true;
    }
  }
</script>

<div class="notice notice-danger" role="alert" style="margin:var(--space-3)" data-boot-failure={failure}>
  <Icon name="alert" size={20} />
  <div class="notice-body">
    <span class="notice-title">{m.boot_db_failed_title()}</span>
    <span data-boot-failure-sentence>{SENTENCE[failure]()}</span>
    <!-- The way back out of a migration that could not finish (ticket 04,
         ADR-0006): the copy taken before it started is still on the device,
         and this puts it back. Offered only when there is one, so the button
         never lies about having something to restore. -->
    {#if bootState.recoverable}
      <p style="margin-top:var(--space-2)" data-restore-offer>{m.boot_restore_offer()}</p>
      <!-- The button keeps naming its action while it is disabled and the
           bar under it says what is happening, rather than the two of them
           saying the same sentence twice. -->
      <button class="btn btn-soft" data-restore-previous disabled={restoring} onclick={restore}>
        <span>{m.boot_restore_action()}</span>
      </button>
      {#await import('$lib/components/Progress.svelte') then { default: Progress }}
        <Progress run={restoreProgress} label={m.boot_restore_running()} handle="restore-previous" />
      {/await}
      {#if restoreFailed}
        <p style="margin-top:var(--space-2)" data-restore-failed transition:disclose>{m.boot_restore_failed()}</p>
      {/if}
    {/if}
    {#if failure !== 'below-baseline'}
      <div style="margin-top:var(--space-2)">
        <button class="btn btn-soft" data-retry-boot disabled={retrying} onclick={retry}>
          <span>{m.boot_retry_action()}</span>
        </button>
      </div>
    {/if}
    <!-- Imported here, like Progress above, so a boot that never fails does
         not carry it. -->
    {#if offersWayOut}
      {#if failure === 'unreadable'}
        <p style="margin-top:var(--space-2)" data-unreadable-help>{m.dbr_archive_body()}</p>
      {/if}
      {#await import('$lib/components/UnreadableJournalWayOut.svelte') then { default: UnreadableJournalWayOut }}
        <UnreadableJournalWayOut />
      {/await}
    {/if}
    <div style="margin-top:var(--space-2)">
      <button class="btn btn-ghost" data-copy-boot-details onclick={copyDetails}>
        <span>{m.boot_copy_details()}</span>
      </button>
    </div>
    {#if detailsShown}
      <div class="boot-details-wrap" transition:disclose>
        <p class="small" data-boot-details-fallback>{m.boot_details_copy_failed()}</p>
        <pre class="boot-details" data-boot-details>{details}</pre>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Selectable by hand, wrapped rather than scrolled sideways: a SQLite
     message can be one long line, and a horizontal scroller inside an alert
     is a second thing to find. */
  .boot-details {
    margin: var(--space-2) 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-sm);
    user-select: all;
  }
</style>
