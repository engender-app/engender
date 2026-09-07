<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN, feelingToSliderValue, sliderToFeeling } from '$lib/data/bodyMap';
  import { disclose } from '$lib/motion/reveal';
  import DimensionSlider from './DimensionSlider.svelte';
  import type { BodyRegionFeeling } from '$lib/data/types';

  let {
    regions,
    values,
    onToggle,
    onFeeling,
  }: {
    regions: { id: string; name: string }[];
    values: Record<string, BodyRegionFeeling>;
    onToggle: (id: string) => void;
    onFeeling: (id: string, feeling: BodyRegionFeeling) => void;
  } = $props();

  /* One bipolar scale per picked region (ticket 99): dysphoria at the low
     end, euphoria at the high end, the same shape the day-level dimension
     takes, where the two per-axis sliders used to be. Storage keeps both
     axes - bodyMap.ts owns the projection both ways. */
</script>

<div class="tag-picker">
  <div class="tag-row" role="group" aria-label={m.body_regions_group()}>
    {#each regions as r (r.id)}
      <button
        class="tag-chip"
        class:is-selected={r.id in values}
        aria-pressed={r.id in values}
        onclick={() => onToggle(r.id)}
      >
        {r.name}
      </button>
    {/each}
  </div>
  {#each regions.filter((r) => r.id in values) as r (r.id)}
    <!-- `disclose`, not svelte/transition's `slide` (ticket 99 item 20,
         "body map sliders come out with a very slight yank, they also hide
         like that"). `slide` animates height and padding and leaves margin
         alone, and this row carries 16px of margin-top - so the box
         travelled smoothly and then gained or lost that 16px in the single
         frame at the end. `disclose` is this app's own answer to exactly
         that, margin and border included, and it is what every other
         opening box here already uses. -->
    <div class="body-region-feeling" transition:disclose>
      <DimensionSlider
        dim={{
          name: m.body_region_axis_slider({ region: r.name, axis: m.dim_euphoria_dysphoria() }),
          low: m.dim_euphoria_dysphoria_low(),
          high: m.dim_euphoria_dysphoria_high(),
          min: BODY_REGION_INTENSITY_MIN,
          max: BODY_REGION_INTENSITY_MAX
        }}
        value={feelingToSliderValue(values[r.id])}
        onInput={(v) => onFeeling(r.id, sliderToFeeling(v))}
      />
    </div>
  {/each}
</div>
