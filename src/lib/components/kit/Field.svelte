<script lang="ts">
  /* The most-repeated shape in the app (phase 5 audit ticket 10): a
     `.field` wrapper, a `.field-label`, and a hand-paired `for`/`id` naming
     the control below it. 131 call sites wrote the three by hand; this is
     the one place that writes them now.

     Spike (the open question ticket 10 names): a `$state`-bearing field
     object was tried against one screen (milestones' date field) and
     rejected. A draft is already reactive at the record level
     (recordEditor.svelte.ts / detailDraft.svelte.ts hold the `$state`), and
     Svelte 5 tracks a plain `$state` read inside any template expression or
     `$derived` with no wrapper needed - the four range screens already
     prove this, wiring `min`/`max` straight off sibling `$state` locals.
     Wrapping a date field's value in a class would only rename
     `draft.date` to `field.value` and give `recordEditor`'s `TDraft` a
     non-serializable member, for no reactivity this file doesn't already
     have. Plain values, in the screen's own draft, is the shape.

     What a hand-paired `for`/`id` actually risks - two literals typed once
     each, free to drift - is a naming problem, not a state problem, so
     that's what this component fixes: one id, minted with `$props.id()`
     when a screen has no reason to name it, handed to both the label and
     the control's snippet so there is only ever one string to agree with
     itself. `legend`, for the controls that name themselves (Segmented's
     `aria-label`, Switch's `label` prop) rather than taking a `for` - the
     id is still minted and handed down, for the few of those that point an
     `aria-labelledby` at it. */
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    id,
    legend = false,
    hidden = false,
    spread = false,
    children
  }: {
    label: string;
    /** Folded into the label's own text, `{label} {hint}`, muted - the
        inline form ticket 10 kept (milestones' and tryouts' date fields).
        A hint that is its own paragraph stays hand-written inside
        `children`; Field only owns the label line. Rendered only with a
        `for` label, not a `legend` - no call site has needed a hint next
        to a self-labelling control's name yet, so `legend` + `hint`
        together is undefined rather than silently dropping one. */
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
    /** The control, handed the one id it should carry. */
    children: Snippet<[string]>;
  } = $props();

  const mintedId = $props.id();
  const fieldId = $derived(id ?? mintedId);
</script>

<div class="field" class:spread>
  {#if legend}
    <span class="field-label" id={fieldId}>{label}</span>
  {:else}
    <label class="field-label" class:visually-hidden={hidden} for={fieldId}>{label}{#if hint} <span class="muted">{hint}</span>{/if}</label>
  {/if}
  {@render children(fieldId)}
</div>
