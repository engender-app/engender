<script lang="ts">
  import { slide } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN, feelingToSliderValue, sliderToFeeling } from '$lib/data/bodyMap';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';
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
    <div
      class="body-region-feeling"
      transition:slide={{ duration: motionDuration('--dur-med'), easing: EASE_OUT }}
    >
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
