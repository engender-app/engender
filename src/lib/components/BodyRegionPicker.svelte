<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '$lib/data/bodyMap';
  import Icon from './Icon.svelte';
  import DimensionSlider from './DimensionSlider.svelte';

  let {
    regions,
    values,
    onToggle,
    onIntensityInput,
  }: {
    regions: { key: string; name: string }[];
    values: Record<string, number>;
    onToggle: (key: string) => void;
    onIntensityInput: (key: string, value: number) => void;
  } = $props();
</script>

<div class="tag-picker">
  <div class="tag-row" role="group" aria-label={m.body_regions_group()}>
    {#each regions as r (r.key)}
      <button
        class="tag-chip"
        class:is-selected={r.key in values}
        aria-pressed={r.key in values}
        onclick={() => onToggle(r.key)}
      >
        {#if r.key in values}<Icon name="check" size={14} />{/if}{r.name}
      </button>
    {/each}
  </div>
  {#each regions.filter((r) => r.key in values) as r (r.key)}
    <DimensionSlider
      dim={{
        name: r.name,
        low: m.body_region_intensity_low(),
        high: m.body_region_intensity_high(),
        min: BODY_REGION_INTENSITY_MIN,
        max: BODY_REGION_INTENSITY_MAX
      }}
      value={values[r.key]}
      onInput={(v) => onIntensityInput(r.key, v)}
    />
  {/each}
</div>
