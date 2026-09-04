<script lang="ts">
  /* What a take measured, with a sentence under each number saying what
     the number is (phase 8 features ticket 27, ADR-0060).

     It was six rows of a definition list inside the recording flow, which
     is where Alicja's complaint on 2026-09-04 landed: "it is very
     important to not just leave the user with a bunch of numbers that
     don't mean anything to them." So each figure now carries one sentence
     and that sentence is the way into its own section of the metric
     reference. One sentence and not two: a caption long enough to teach
     makes the list unreadable, which is the whole reason the reference
     screen exists.

     Its own component rather than markup in the flow for the ordinary
     reason - the flow owns a microphone, a two-step take and a quality
     gate, and none of that is needed to state six numbers - and for one
     specific one: the figure names, the sentences and the links all come
     off the same registry keys (data/voice/metrics.ts), and a second place
     writing a figure's label is how a link ends up pointing at a section
     about something else.

     Every row goes through one snippet, so a figure cannot be written
     without its sentence and its link. That is the ticket's rule in the
     markup: the explanation is the feature, not a caption on it.

     Nothing here reads anything into a voice (PRODUCT.md:109, ADR-0012).
     A number, its unit, and what the number is. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import type { PassageFigures } from '$lib/audio/benchmark';
  import { noteName } from '$lib/audio/pitch';
  import type { Formants } from '$lib/audio/resonance';
  import { metricHref, type VoiceMetricKey } from '$lib/data/voice/metrics';
  import { metricLine, metricName } from '$lib/data/voice/metricLabels';

  let {
    figures,
    formants,
    snrDb
  }: {
    figures: PassageFigures;
    /** Null where the vowel step was skipped or measured nothing, which a
        take can be while still clearing the gate. */
    formants: Formants | null;
    /** Null where there was no vowel take to measure the room from. */
    snrDb: number | null;
  } = $props();

  /** A figure as the screen states it: a fixed number of places, as text.
      Named for what it produces rather than for rounding, which is what it
      does on the way. */
  const figure = (value: number, places = 0) => value.toFixed(places);
</script>

<!-- One row: the name, the figure, and the sentence that leads to the
     section explaining it. `value` is a snippet because the six figures
     are six different shapes - a frequency with a note beside it, a range,
     a count of semitones - and only their surroundings are shared. -->
{#snippet row(key: VoiceMetricKey, value: Snippet)}
  <div data-figure={key}>
    <dt>{metricName(key)}</dt>
    <dd>{@render value()}</dd>
    <!-- Inside the row's own `dd` rather than in a second one: the
         sentence is about the figure, and a definition list with two
         definitions per term reads as two answers to one question. -->
    <dd class="vf-line">
      <a href={metricHref(key)}>{metricLine(key)}</a>
    </dd>
  </div>
{/snippet}

<dl class="vf kit-panel">
  {#snippet pitchValue()}
    {m.vb_hz({ value: figure(figures.f0MedianHz) })}
    <span class="vf-aside">{noteName(figures.f0MedianHz)}</span>
  {/snippet}
  {@render row('pitch', pitchValue)}

  {#snippet spanValue()}
    {m.vb_hz_range({ low: figure(figures.f0P10Hz), high: figure(figures.f0P90Hz) })}
  {/snippet}
  {@render row('span', spanValue)}

  {#snippet spreadValue()}
    {m.vb_semitones({ value: figure(figures.semitoneSd, 1) })}
  {/snippet}
  {@render row('spread', spreadValue)}

  {#snippet rateValue()}
    {m.vb_wpm({ value: figure(figures.wordsPerMinute) })}
  {/snippet}
  {@render row('rate', rateValue)}

  {#snippet resonanceValue()}
    {#if formants}
      {m.vb_hz({ value: figure(formants.f1Hz) })} · {m.vb_hz({ value: figure(formants.f2Hz) })}
    {:else}
      <span class="vf-aside">{m.vb_not_measured()}</span>
    {/if}
  {/snippet}
  {@render row('resonance', resonanceValue)}

  {#snippet roomValue()}
    {#if snrDb === null}
      <span class="vf-aside">{m.vb_not_measured()}</span>
    {:else}
      {m.vb_db({ value: figure(snrDb) })}
    {/if}
  {/snippet}
  {@render row('room', roomValue)}
</dl>

<style>
  .vf {
    display: grid;
    gap: var(--space-4);
    margin: 0;
  }

  /* Two columns for the name and the number, and the sentence across both
     underneath. A row is a small block now rather than one line, so the
     gap between rows is a step wider than it was: at the old spacing a
     sentence sat as close to the next figure's name as to its own. */
  .vf > div {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0 var(--space-3);
  }

  .vf dt {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .vf dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-weight: var(--weight-semibold);
    text-align: right;
  }

  .vf-aside {
    color: var(--muted);
    font-weight: var(--weight-regular);
  }

  /* The sentence spans the row and reads left to right, unlike the figure
     above it. */
  .vf dd.vf-line {
    grid-column: 1 / -1;
    margin-top: var(--space-1);
    font-variant-numeric: normal;
    font-weight: var(--weight-regular);
    text-align: left;
  }

  /* The whole sentence is the link, because the sentence is what says
     where it goes. Underlined only on the words, not the block: this is
     prose that happens to be pressable, not a button. */
  .vf-line a {
    color: var(--muted);
    font-size: var(--text-xs);
    line-height: 1.5;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, var(--role-c) 55%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }

  .vf-line a:hover {
    color: var(--role-ink);
    text-decoration-color: var(--role-c);
  }
</style>
