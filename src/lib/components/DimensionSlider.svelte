<script lang="ts">
  /* A named scale with two endpoints, which is the labelled form of the
     app's one slider. The instrument itself is Slider.svelte; what this adds
     is the name, the readout that travels to the thumb while the control is
     being held, and the two endpoint words. */
  import Slider from './Slider.svelte';
  import { percentAlong } from './sliderScale';
  import { m } from '$lib/paraglide/messages';

  /** A gender dimension satisfies this structurally; so does anything else
      with a name, two endpoint labels and a range - a body-region
      intensity (BodyRegionPicker.svelte), say - without having to carry
      builtIn/hidden fields that mean nothing for it. */
  export interface SliderScale {
    name: string;
    low: string;
    high: string;
    min: number;
    max: number;
  }

  let {
    dim,
    value = null,
    onInput,
  }: { dim: SliderScale; value?: number | null; onInput: (v: number) => void } = $props();

  let holding = $state(false);

  /* The same fraction the control positions its thumb by. The readout lives
     above the control rather than inside it, and a custom property set on the
     control does not reach it. */
  const percent = $derived(percentAlong(value, dim.min, dim.max));
</script>

<div
  class="dim-slider"
  class:is-unset={value == null}
  class:is-holding={holding}
  style:--slider-pct={percent}
>
  <div class="dim-head">
    <span class="dim-name" data-dim-name>{dim.name}</span>
    <div class="dim-readout">
      <output class="dim-value" data-dim-value>{value ?? m.slider_unset()}</output>
    </div>
  </div>
  <Slider
    bind:holding
    min={dim.min}
    max={dim.max}
    {value}
    {onInput}
    unset={value == null}
    label={m.slider_aria({ name: dim.name, low: dim.low, high: dim.high })}
  />
  <div class="dim-ends"><span>{dim.low}</span><span>{dim.high}</span></div>
</div>
