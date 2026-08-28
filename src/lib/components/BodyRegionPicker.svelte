<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '$lib/data/bodyMap';
  import DimensionSlider from './DimensionSlider.svelte';
  import type { BodyRegionAxis, BodyRegionFeeling } from '$lib/data/types';

  let {
    regions,
    values,
    onToggle,
    onAxisInput,
  }: {
    regions: { id: string; name: string }[];
    values: Record<string, BodyRegionFeeling>;
    onToggle: (id: string) => void;
    onAxisInput: (id: string, axis: BodyRegionAxis, value: number) => void;
  } = $props();

  /* Both axes, in a fixed order, neither of them the region's default: a
     picked region shows the pair unset and the person fills in whichever
     one they have something to say about (ticket 31). Dysphoria is listed
     first because it is the one that already existed, not because it is
     the one to answer - there is no pre-filled value on either, so neither
     is what the region says unless someone says it. */
  const AXES: { axis: BodyRegionAxis; label: () => string }[] = [
    { axis: 'dysphoria', label: () => m.body_region_axis_dysphoria() },
    { axis: 'euphoria', label: () => m.body_region_axis_euphoria() }
  ];
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
    {#each AXES as a (a.axis)}
      <DimensionSlider
        dim={{
          name: m.body_region_axis_slider({ region: r.name, axis: a.label() }),
          low: m.body_region_intensity_low(),
          high: m.body_region_intensity_high(),
          min: BODY_REGION_INTENSITY_MIN,
          max: BODY_REGION_INTENSITY_MAX
        }}
        value={values[r.id][a.axis]}
        onInput={(v) => onAxisInput(r.id, a.axis, v)}
      />
    {/each}
  {/each}
</div>
