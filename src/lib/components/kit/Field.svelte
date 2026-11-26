<script lang="ts">
  /* Share one id between the label and control snippet, generated with
     $props.id() when the caller supplies none. Use legend for self-labelled
     controls and keep the id available for aria-labelledby.

     Keep field values plain in the screen's reactive draft. Svelte tracks
     the draft read already, and wrapping fields in a class would make the
     draft non-serializable. */
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    id,
    legend = false,
    hidden = false,
    spread = false,
    hintAfter = false,
    children
  }: {
    label: string;
    /** Help for the control, its own paragraph under the label and pointed
        at by the control's `aria-describedby` - the second argument
        `children` is handed. It used to be folded into the label's own
        text, `{label} {hint}`, which made the sentence part of the field's
        accessible name: "Ended" and "Leave blank if there is no end date."
        were read as one name and ran together on screen at 200% text
        (phase 11 pre-production ticket 43). A label names, help explains,
        and a screen reader owes them separately. */
    hint?: string;
    /** A screen names its own id only when something else has to agree
        with it (a walkthrough handle, a fixture). Everything else is
        minted. */
    id?: string;
    /** The control names itself and takes no `for` - Segmented and Switch
        both do. The id is still minted and hand it to `children` regardless,
        for the group controls that point their own `aria-labelledby` at
        it. */
    legend?: boolean;
    /** A real `for`/`id` pair, kept out of sight (`.visually-hidden`, the
        same utility DemoBar's and stats' hand-rolled ones already use)
        rather than dropped - the app's screen readers get a real
        association, not an aria-label repeating a heading two lines above
        it a third time. */
    hidden?: boolean;
    /** The `.field.spread` row layout - a label to the left, a
        self-labelling control to the right (Switch). */
    spread?: boolean;
    /** The hint sits under the control instead of under the label, for a
        field in a side-by-side pair whose neighbour has none: the two
        controls then share a top edge. */
    hintAfter?: boolean;
    /** The control, handed the one id it should carry, the id of the hint
        paragraph it should point `aria-describedby` at where there is one,
        and whether the person has been in the field and left it. */
    children: Snippet<[string, string | undefined, boolean]>;
  } = $props();

  /* Set the first time focus leaves the field. A control marks itself
     `aria-invalid` only once this is true: an empty field nobody has
     reached yet is not a mistake, and a screen reader that says "invalid"
     on every field of a fresh form is crying wolf (after-release 21, audit
     A11Y-14). Lives as long as the field does, so a sheet opened again
     starts clean. */
  let touched = $state(false);

  const mintedId = $props.id();
  const fieldId = $derived(id ?? mintedId);
  const hintId = $derived(`${fieldId}-hint`);
</script>

<div class="field" class:spread onfocusout={() => (touched = true)}>
  {#if legend}
    <span class="field-label" id={fieldId}>{label}</span>
  {:else}
    <label class="field-label" class:visually-hidden={hidden} for={fieldId}>{label}</label>
  {/if}
  {#if hint && !hintAfter}
    <p class="field-hint" class:visually-hidden={hidden} id={hintId}>{hint}</p>
  {/if}
  {@render children(fieldId, hint ? hintId : undefined, touched)}
  {#if hint && hintAfter}
    <p class="field-hint" class:visually-hidden={hidden} id={hintId}>{hint}</p>
  {/if}
</div>

<style>
  /* Closer to the name it explains than to the box it explains it for:
     `.field` is a flex column with one gap, which would space label, help
     and control evenly and leave the sentence floating between the two
     things it could belong to. */
  .field-hint {
    margin-top: calc(-1 * var(--space-1));
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>
