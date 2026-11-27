<script lang="ts">
  /* Wrap choices so all labels fit at 320px. Use the tag-chip transition for
     selection and keep data-segment on each option as a stable walkthrough
     handle (ADR-0029). */
  import { rovingRadio } from '$lib/components/rovingRadio';

  let {
    name,
    options,
    value,
    onChange,
    key
  }: {
    /** The group's accessible name. */
    name: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (next: string) => void;
    /** The group's own walkthrough handle (ADR-0029). */
    key?: string;
  } = $props();
</script>

<div class="tag-row choice-chips" role="radiogroup" tabindex="-1" aria-label={name} use:rovingRadio data-choice-chips={key}>
  {#each options as option (option.value)}
    <button
      type="button"
      class="tag-chip press"
      class:is-selected={option.value === value}
      role="radio"
      aria-checked={option.value === value}
      data-segment={option.value}
      onclick={() => onChange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  /* The chip's 6px hit-area overhang (.tag-chip::after) needs room above
     and below, or two wrapped rows' targets meet - PhotoChipRow's reason. */
  .choice-chips {
    padding: 6px 0;
  }
</style>
