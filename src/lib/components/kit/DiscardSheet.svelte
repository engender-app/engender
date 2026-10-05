<script lang="ts">
  /* The question leaving changed work asks (leaveGuard.ts, CONTEXT:
     "Draft"). Keep editing is the primary button: the safe answer is the
     one a stray tap lands on. Closing the sheet any other way - the scrim,
     a drag, Android back - is also Keep editing. */
  import { m } from '$lib/paraglide/messages';
  import Sheet from '$lib/components/Sheet.svelte';
  import type { LeaveGuard } from './leaveGuard.svelte';
  import { discardHandles } from './recordHandles';

  let {
    guard,
    body = m.record_discard_body()
  }: {
    guard: LeaveGuard;
    /** What discarding loses, where the screen has more to say than "your
        changes have not been saved". */
    body?: string;
  } = $props();
</script>

<Sheet open={guard.pendingDeparture !== null} title={m.record_discard_title()} onClose={guard.keep}>
  <h3>{m.record_discard_title()}</h3>
  <p class="muted">{body}</p>
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
