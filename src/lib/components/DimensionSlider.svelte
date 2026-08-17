<script lang="ts">
  import { Slider } from 'melt/builders';
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

  // Melt UI slider (headless behaviour, our tokens do the styling).
  const slider = new Slider({
    min: () => dim.min,
    max: () => dim.max,
    step: 1,
    value: () => value ?? Math.round((dim.min + dim.max) / 2),
    onValueChange: (v) => onInput(v),
  });
</script>

<div class="dim-slider">
  <div class="dim-head">
    <span class="dim-name">{dim.name}</span>
    <output class="dim-value">{value ?? '—'}</output>
  </div>
  <div {...slider.root} class="melt-slider" aria-label={m.slider_aria({ name: dim.name, low: dim.low, high: dim.high })}>
    <div class="melt-track"><div class="melt-range"></div></div>
    <div {...slider.thumb} class="melt-thumb"></div>
  </div>
  <div class="dim-ends"><span>{dim.low}</span><span>{dim.high}</span></div>
</div>
