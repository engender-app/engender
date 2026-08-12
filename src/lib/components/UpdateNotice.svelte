<script lang="ts">
  /* The quiet update action (ticket 04).

     A notice rather than a modal or a toast, and the reasons are in the
     acceptance wording. It does not interrupt: a toast would expire before
     someone mid-entry looked up, and a modal would take the screen away from
     whatever they were doing. It does not nag: dismissing it ends it for this
     load of the app, and nothing brings it back until the next one.

     It appears only when the journal is idle, which update.ts decides - so a
     save, a migration, an Archive import or an encryption conversion in
     flight is a notice that is not on screen yet rather than one that has to
     be argued with. */

  import { m } from '$lib/paraglide/messages';
  import { applyUpdate, onUpdateReadyChange, updateReady } from '$lib/pwa/update';
  import Icon from './Icon.svelte';

  let ready = $state(updateReady());
  let dismissed = $state(false);
  let applying = $state(false);

  $effect(() => onUpdateReadyChange((next) => (ready = next)));

  async function apply() {
    if (applying) return;
    applying = true;
    /* A refusal means a write started between the tap and here, so the offer
       was withdrawn under it. Nothing to report: the notice goes back to
       waiting for the journal, and reappears when it is idle. */
    if (!(await applyUpdate())) applying = false;
  }
</script>

{#if ready && !dismissed}
  <div class="notice notice-info" role="status" data-update-notice style="margin:var(--space-3)">
    <Icon name="download" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.update_ready_title()}</span>
      {m.update_ready_body()}
      <div style="margin-top:var(--space-2)">
        <button class="btn btn-soft" data-update-apply disabled={applying} onclick={apply}>
          <span>{m.update_apply()}</span>
        </button>
      </div>
    </div>
    <button class="icon-btn" aria-label={m.dismiss()} onclick={() => (dismissed = true)}>
      <Icon name="x" size={18} />
    </button>
  </div>
{/if}
