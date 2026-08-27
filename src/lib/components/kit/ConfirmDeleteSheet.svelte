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
    onConfirm: () => void;
    onCancel: () => void;
    /** e.g. `{ 'data-confirm-delete-side-effect': true }` - the walkthrough
        handle a screen's danger button carried before this component
        existed, which has to survive unchanged. */
    confirmAttrs?: Record<string, string | boolean>;
  } = $props();
</script>

<Sheet {open} {title} onClose={onCancel}>
  <h3>{question}</h3>
  {#if hint}
    <p class="muted small" style="margin-bottom:var(--space-4)">{hint}</p>
  {/if}
  <div class="stack-3">
    <!-- The kit's own handles, beside whatever the screen already named its
         danger button (ADR-0029, the contract Notice and ListRow keep). The
         cancel button never had one on any screen, so this is the first
         thing that can address it. -->
    <button class="btn btn-danger" data-confirm-delete {...confirmAttrs} onclick={onConfirm}>
      <span>{confirmLabel}</span>
    </button>
    <button class="btn btn-ghost" data-cancel-delete onclick={onCancel}><span>{cancelLabel}</span></button>
  </div>
</Sheet>
