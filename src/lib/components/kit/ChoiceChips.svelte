<script lang="ts">
  /* One of a set, drawn as chips that wrap (phase 15 release-blockers
     ticket 05). For a choice whose labels do not fit a Segmented's equal
     shares: a new tryout's kinds and the measurement types, where the
     scrolling track cut "Garment" to "Gar" and "Underbust" to "U" at 390px,
     with nothing but a chevron saying more was there. Measurement types
     also grow with every custom type someone adds, which a fixed set of
     shares was never sized for.

     The row wraps the way the photo library's chips do (PhotoChipRow), so
     every option is on screen and readable at 320px. A second line costs
     one row of height; a hidden option costs the choice.

     The selection moves by colour alone, on `.tag-chip`'s own transition
     (components.css), so a pick crossfades the old chip out and the new one
     in rather than repainting either in one frame.

     `data-segment` on each option is the handle Segmented gave the same
     choices, kept so the walkthrough and the screen checks grip the option
     and not the control drawing it (ADR-0029). */
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
