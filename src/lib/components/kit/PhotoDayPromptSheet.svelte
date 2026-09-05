<script lang="ts">
  /* The add-photo day prompt (ticket 47, ADR-0008/0015): the entry editor's
     and the milestone editor's own add-photo flows opened the identical
     sheet - a title, a hint, one Day field, Save and Skip - differing only
     in what "day" and "save"/"skip" mean to each caller's own draft. Shared
     here rather than repeated a third time the next screen grows an
     add-photo flow of its own. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let {
    open,
    day = $bindable(''),
    fieldId,
    onSave,
    onSkip
  }: {
    open: boolean;
    /** yyyy-mm-dd, the same value shape every DatePicker in the app trades
        in. Bindable so the caller's own draft stays the source of truth. */
    day: string;
    /** Names the DatePicker so two callers open in the same document -
        unlikely, but a walkthrough handle or a label/input pairing should
        never collide on it. */
    fieldId: string;
    /** Whatever the caller's own day means: bake it into the picked photo,
        write it to a stored one, whichever the flow this sheet interrupts
        is doing. */
    onSave: () => void;
    /** Leaves the override unset - the photo inherits its owner's day,
        exactly as it did before this ticket. */
    onSkip: () => void;
  } = $props();
</script>

<Sheet {open} title={m.photo_day_prompt_title()} onClose={onSkip}>
  {#if open}
    <h3>{m.photo_day_prompt_title()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.photo_day_prompt_hint()}</p>
    <Field label={m.photo_day_label()} id={fieldId}>
      {#snippet children(id)}
        <DatePicker name={fieldId} bind:value={day} {id} />
      {/snippet}
    </Field>
    <div class="stack-3">
      <button class="btn btn-primary press" data-photo-day-save onclick={onSave}>
        <span>{m.photo_day_prompt_save()}</span>
      </button>
      <button class="btn btn-ghost press" data-photo-day-skip onclick={onSkip}>
        <span>{m.photo_day_prompt_skip()}</span>
      </button>
    </div>
  {/if}
</Sheet>
