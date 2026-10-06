<script lang="ts">
  /* The delete-confirm shape every record-logging settings screen repeated:
     a question, an optional hint line, a danger button and a ghost one
     (phase 5 UX ticket 39a). The component takes every string as a prop -
     it does not own copy, since a screen's own wording (and whether it has
     a hint at all) is its business. */
  import Sheet from '$lib/components/Sheet.svelte';

  let {
    open,
    title,
    question,
    hint = null,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    confirmAttrs = {}
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
        part of how six throwing deletes went unnoticed (ADR-0053). Nothing
        here reports a failure to the person yet, and under that ADR no
        delete rejects; the type is what makes one representable when
        something does. */
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    /** e.g. `{ 'data-confirm-delete-side-effect': '' }` - the walkthrough
        handle a screen's danger button carried before this component
        existed, which has to survive unchanged. Empty string rather than
        `true` so it serializes as the bare attribute the screens wrote. */
    confirmAttrs?: Record<string, string>;
  } = $props();

  /* The words stay while the sheet slides away. Screens clear their delete
     target the moment it is answered and hand back empty strings, so the
     question and the hint went blank in the first frame of the close
     (after-release 07's review). Updated only while open. */
  let last = { title: '', question: '', hint: null as string | null };
  const shown = $derived.by(() => {
    if (open) last = { title, question, hint };
    return last;
  });
</script>

<Sheet {open} title={shown.title} onClose={onCancel}>
  <h3>{shown.question}</h3>
  {#if shown.hint}
    <p class="muted small" style="margin-bottom:var(--space-4)">{shown.hint}</p>
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
    <button class="btn btn-danger" data-confirm-delete="" {...confirmAttrs} onclick={onConfirm}>
      <span>{confirmLabel}</span>
    </button>
    <button class="btn btn-ghost" onclick={onCancel}><span>{cancelLabel}</span></button>
  </div>
</Sheet>
