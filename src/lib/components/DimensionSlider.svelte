<script lang="ts">
  import { Slider } from 'melt/builders';
  import { m } from '$lib/paraglide/messages';
  import type { GenderDimension } from '$lib/data/types';

  let {
    dim,
    value = null,
    onInput,
  }: { dim: GenderDimension; value?: number | null; onInput: (v: number) => void } = $props();

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
