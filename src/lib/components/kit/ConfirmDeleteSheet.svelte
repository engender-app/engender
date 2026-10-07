<script lang="ts">
  /* The delete-confirm shape every record-logging settings screen repeated:
     a question, an optional hint line, a danger button and a ghost one
     (phase 5 UX ticket 39a). The component takes every string as a prop -
     it does not own copy, since a screen's own wording (and whether it has
     a hint at all) is its business. */
  import { m } from '$lib/paraglide/messages';
  import Sheet from '$lib/components/Sheet.svelte';
  import { collapse } from '$lib/motion/reveal';

  let {
    open,
    title,
    question,
    hint = null,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    confirmAttrs = {},
    busy = false,
    failed = false
  }: {
    open: boolean;
    title: string;
    question: string;
    hint?: string | null;
    confirmLabel: string;
    cancelLabel: string;
    /** Returning a promise is the point. TypeScript let a screen pass an
        async handler to the old `() => void` either way; what that type
        forbade was this component seeing the promise at all, so a
        rejection could only reach the window as a page error - which is
        part of how six throwing deletes went unnoticed (ADR-0053). The
        caller catches it and says so through `failed`. */
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    /** e.g. `{ 'data-confirm-delete-side-effect': '' }` - the walkthrough
        handle a screen's danger button carried before this component
        existed, which has to survive unchanged. Empty string rather than
        `true` so it serializes as the bare attribute the screens wrote. */
    confirmAttrs?: Record<string, string>;
    /** The delete is running: both buttons wait, so a second tap deletes
        nothing and the sheet cannot close on a delete still in flight. */
    busy?: boolean;
    /** The last delete failed; the record is still there. */
    failed?: boolean;
  } = $props();
</script>

<Sheet {open} {title} onClose={onCancel} {busy}>
  <h3>{question}</h3>
  {#if hint}
    <p class="muted small" style="margin-bottom:var(--space-4)">{hint}</p>
  {/if}
  {#if failed}
    <p class="notice notice-danger" role="alert" data-delete-failed transition:collapse>{m.record_delete_failed()}</p>
  {/if}
  <div class="stack-3">
    <!-- The kit's own handle, beside whatever the screen already named its
         danger button (ADR-0029, the contract Notice and ListRow keep). The
         cancel button keeps the nothing it had on all sixteen screens - no
         flow grips it, and this ticket is not the place to widen what the
         walkthrough can reach.

         Spelled `=""` rather than left bare: an element carrying a spread
         serializes a bare attribute as "true", and the screens this replaces
         wrote theirs bare, which is "". -->
    <button class="btn btn-danger" data-confirm-delete="" {...confirmAttrs} disabled={busy} aria-busy={busy} onclick={onConfirm}>
      <span>{confirmLabel}</span>
    </button>
    <button class="btn btn-ghost" disabled={busy} onclick={onCancel}><span>{cancelLabel}</span></button>
  </div>
</Sheet>
