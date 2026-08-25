<script lang="ts">
  /* A named scale with two endpoints, which is the labelled form of the
     app's one slider. The instrument itself is Slider.svelte; what this adds
     is the name, the readout that travels to the thumb while the control is
     being held, and the two endpoint words. */
  import Slider from './Slider.svelte';
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

</script>

<div class="dim-slider" class:is-unset={value == null}>
  <div class="dim-head">
    <span class="dim-name" data-dim-name>{dim.name}</span>
    <output class="dim-value" data-dim-value>{value ?? m.slider_unset()}</output>
  </div>
  <Slider
    min={dim.min}
    max={dim.max}
    {value}
    {onInput}
    unset={value == null}
    label={m.slider_aria({ name: dim.name, low: dim.low, high: dim.high })}
  />
  <div class="dim-ends"><span>{dim.low}</span><span>{dim.high}</span></div>
</div>
