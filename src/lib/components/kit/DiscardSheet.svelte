<script lang="ts">
  /* The question leaving changed work asks (leaveGuard.ts, CONTEXT:
     "Draft"). Keep editing is the primary button: the safe answer is the
     one a stray tap lands on. Closing the sheet any other way - the scrim,
     a drag, Android back - is also Keep editing.

     No body line by default. The one every copy used to carry, "Your
     changes have not been saved", said again what "Discard unsaved
     changes?" had just said. A screen that loses more than its edits - a
     recorded take, a regimen's pending pause - says so in `body`. */
  import { m } from '$lib/paraglide/messages';
  import Sheet from '$lib/components/Sheet.svelte';
  import type { LeaveGuard } from './leaveGuard.svelte';
  import { discardHandles } from './recordHandles';

  let {
    guard,
    body
  }: {
    guard: LeaveGuard;
    /** What discarding loses, where the title does not already say it. */
    body?: string;
  } = $props();
</script>

<Sheet open={guard.pendingDeparture !== null} title={m.record_discard_title()} onClose={guard.keep}>
  <h3>{m.record_discard_title()}</h3>
  {#if body}<p class="muted">{body}</p>{/if}
  <div class="discard-actions">
    <button class="btn btn-primary" {...{ [discardHandles.keep]: '' }} onclick={guard.keep}>
      <span>{m.record_keep_editing()}</span>
    </button>
    <button class="btn btn-danger" {...{ [discardHandles.discard]: '' }} onclick={guard.discard}>
      <span>{m.vb_practice_discard()}</span>
    </button>
  </div>
</Sheet>

<style>
  .discard-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
</style>
