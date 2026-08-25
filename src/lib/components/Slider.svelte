<script lang="ts">
  /* The app's one slider (phase 5 ticket 30).

     There used to be two: a native input[type="range"] whose thumb was 26px
     in Chromium and 20px in Gecko, and this hand-built one. Both are now
     this one, so there is nothing left for two engines to disagree about,
     and the photo review's onion-skin control - the last live native range,
     which had no thumb styling at all - wears it too.

     Melt's builder keeps the behaviour and the ARIA: role="slider" and the
     value attributes go on the root, which is also the tab stop and the
     keyboard target. The thumb is taken off the tab order here, because
     melt gives it tabindex="0" as well and two tab stops for one control
     means the second one is a focusable div with no role and no name. It
     keeps tabindex="-1" so melt's pointerdown can still focus it. */
  import { Slider as MeltSlider } from 'melt/builders';
  import { displayValue, sliderScaleStops, snapToStop } from './sliderScale';

  let {
    min = 0,
    max = 100,
    value,
    onInput,
    label,
    labelledBy,
    unset = false,
    holding = $bindable(false),
  }: {
    min?: number;
    max?: number;
    value: number | null;
    onInput: (v: number) => void;
    label: string;
    /** The id of visible text that already names this control. A `<label for>`
        cannot name a div, so where the name is on the screen it is tied by
        aria-labelledby instead - which keeps one string rather than repeating
        the visible text into an aria-label beside it. `label` stays the
        fallback and the accessible name where the two differ, as they do on a
        dimension, whose spoken name carries both endpoints. */
    labelledBy?: string;
    /** Dims the instrument without hiding it: there is a thumb position but
        no value behind it yet. */
    unset?: boolean;
    /** True while the control is being operated - a finger is down on it, or
        it holds keyboard focus. Bindable so a label outside the control can
        answer the same gesture; the readout in DimensionSlider is the reason
        this is not private state. */
    holding?: boolean;
  } = $props();

  const scale = $derived(sliderScaleStops(min, max));
  const shown = $derived(displayValue(value, min, max));
  /** Which mark the thumb is standing on, so that mark can answer. */
  const activeStop = $derived(
    scale.stops.length === 0 ? -1 : Math.round((shown - min) / scale.step)
  );

  const slider = new MeltSlider({
    min: () => min,
    max: () => max,
    step: () => scale.step,
    value: () => shown,
    /* Snapped here rather than left to melt: melt rounds a drag to the step
       but an arrow key just adds it, so a stored 63 on a step-of-5 scale
       would walk 58, 53, 48 and never land on a mark. */
    onValueChange: (v) => onInput(snapToStop(v, min, max, scale.step)),
  });

  /* Whether a finger is currently down, which the blur handler below needs to
     know: melt focuses the thumb on pointerdown, so pressing a slider that
     already had keyboard focus blurs the root mid-drag and would otherwise
     send the readout home while the finger is still on it. */
  let pressing = $state(false);

  /* Released anywhere, not just over the control - a drag that ends off the
     edge of the screen still ends. Bound only while the finger is down, so a
     screen with six sliders on it carries no listeners at rest. */
  $effect(() => {
    if (!pressing) return;
    const release = () => {
      pressing = false;
      holding = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  });

  /* Keyboard counts as holding the control: the readout travels to the thumb
     for the same reason either way, which is that the value belongs next to
     the thing that is changing it. :focus-visible rather than :focus so a tap
     does not leave the readout parked out there after the finger is gone. */
  function onFocus(event: FocusEvent) {
    const el = event.currentTarget;
    if (el instanceof HTMLElement && el.matches(':focus-visible')) holding = true;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  {...slider.root}
  class="slider"
  class:is-holding={holding}
  class:is-unset={unset}
  data-slider
  aria-label={labelledBy ? undefined : label}
  aria-labelledby={labelledBy}
  onpointerdowncapture={() => { pressing = true; holding = true; }}
  onfocus={onFocus}
  onblur={() => { if (!pressing) holding = false; }}
  onpointerup={() => { if (value == null) onInput(slider.value); }}
  onkeyup={() => { if (value == null) onInput(slider.value); }}
>
  <div class="slider-track"></div>
  <div class="slider-lane">
    <div class="slider-fill"></div>
    {#if scale.stops.length > 0}
      <div class="slider-ruler" aria-hidden="true">
        {#each scale.stops as stop, i (stop)}
          <span
            class="slider-tick"
            class:is-major={scale.majorEvery > 0 && i % scale.majorEvery === 0}
            class:is-here={i === activeStop}
          ></span>
        {/each}
      </div>
    {/if}
    <div {...slider.thumb} class="slider-thumb" tabindex="-1"></div>
  </div>
</div>
