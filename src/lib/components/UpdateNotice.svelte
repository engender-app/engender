<script lang="ts" module>
  /* Dismissal belongs to the page, not to an instance. Each screen draws
     its own notice under its field (UpdateNoticeSlot.svelte), so a new one
     mounts at every navigation and after every unlock, and a flag kept in
     the component came back false each time: a notice somebody had closed
     reappeared and was announced again. A reload
     starts the module afresh, which is the policy below: dismissed for this
     load of the app, offered again on the next.

     The announcement is the page's for the same reason. Said once when a
     release becomes ready, not again by every screen that draws the notice
     afterwards; a release that stops being ready (an update being applied,
     a write starting) and comes back is said again. */
  let dismissedThisPage = false;
  let announcedThisPage = false;
</script>

<script lang="ts">
  /* The quiet update action.

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
  import { announce } from '$lib/stores/announcer.svelte';
  import { collapse } from '$lib/motion/reveal';

  let ready = $state(updateReady());
  let dismissed = $state(dismissedThisPage);
  let applying = $state(false);

  function dismiss() {
    dismissedThisPage = true;
    dismissed = true;
  }

  $effect(() => onUpdateReadyChange((next) => (ready = next)));

  /* Said through the app's standing live region (announcer.ts), which is on the page long
     before this: the notice is inserted with its words in it, possibly in the same render
     as the component itself, since this loads after boot and an update can already be
     waiting, and a region that arrives holding its words is often not read. */
  $effect(() => {
    if (!ready) {
      announcedThisPage = false;
    } else if (!dismissed && !announcedThisPage) {
      announcedThisPage = true;
      announce(m.update_ready_title());
    }
  });

  async function apply() {
    if (applying) return;
    applying = true;
    /* Refusal or a failed write leaves recovery on screen. The notice
       returns when the journal is idle, with another tap available even
       if the worker already took control. */
    if (!(await applyUpdate())) applying = false;
  }
</script>

<!-- The band is the notice's place under the field (UpdateNoticeSlot.svelte)
     and what arrives and leaves: `collapse` opens it down from the field's
     edge and gives its height back on a dismissal, so the screen under it
     travels instead of jumping by the notice's height in one frame. Its padding rather than a
     margin holds the space above the notice, because a margin is not
     clipped and would be a 12px step on the first frame.

     Local on purpose. It plays when this block changes - a release becoming
     ready, a dismissal - and not when the screen takes the whole component
     away, for a lock above all, which has to be a cut: a notice closing over
     the lock screen for 380ms is the journal still showing behind its
     gate. -->
{#if ready && !dismissed}
  <div class="update-band" data-update-band transition:collapse>
    <div class="notice notice-info" data-update-notice>
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
      <button class="icon-btn" aria-label={m.dismiss()} onclick={dismiss}>
        <Icon name="x" size={18} />
      </button>
    </div>
  </div>
{/if}

<style>
  /* Padding stays inside collapse's animated box, so the field's gap opens
     with the notice instead of adding 12px in its first frame. */
  .update-band { padding-top: var(--space-3); }
</style>
