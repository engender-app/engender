<script lang="ts">
  /* What a take measured, and one way to find out what any of it means
     (phase 8 features ticket 27, ADR-0060).

     It was six rows of a definition list inside the recording flow, which
     is where Alicja's complaint on 2026-09-04 landed: "it is very
     important to not just leave the user with a bunch of numbers that
     don't mean anything to them."

     **One link at the foot rather than a sentence under each figure**, her
     call on 2026-09-04 after seeing both built. The ticket asked for a
     sentence per figure linking into that figure's own section; six
     dotted sentences in one panel turned the list a person came to read
     into a page of links, and the numbers are what they came for. So the
     figures are bare and the way in is one line under them. The trade she
     took with it: arriving at the reference screen means finding your own
     figure among six sections rather than landing on it. The per-figure
     anchors are still live and the compare view's two labels still use
     them.

     Its own component rather than markup in the flow for the ordinary
     reason - the flow owns a microphone, a two-step take and a quality
     gate, and none of that is needed to state six numbers - and for one
     specific one: the figure names come off the same registry keys the
     reference screen builds its sections from (data/voice/metrics.ts), so
     a name cannot be renamed on one surface and not the other.

     Nothing here reads anything into a voice (PRODUCT.md:109, ADR-0012).
     A number, its unit, and where to go to find out what it is. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import type { PassageFigures } from '$lib/audio/benchmark';
  import { noteName } from '$lib/audio/pitch';
  import type { Formants } from '$lib/audio/resonance';
  import { VOICE_METRICS_ROUTE, type VoiceMetricKey } from '$lib/data/voice/metrics';
  import { metricName } from '$lib/data/voice/metricLabels';
  import { roleAttrs } from '$lib/components/kit/role';
  import type { Role } from '$lib/theme/roles';

  let {
    figures,
    formants,
    snrDb,
    role
  }: {
    figures: PassageFigures;
    /** Null where the vowel step was skipped or measured nothing, which a
        take can be while still clearing the gate. */
    formants: Formants | null;
    /** Null where there was no vowel take to measure the room from. */
    snrDb: number | null;
    /** The area's own stripe. It is what the sentences are underlined in,
        so a link reads as pressable without turning blue. */
    role?: Role;
  } = $props();

  /** A figure as the screen states it: a fixed number of places, as text.
      Named for what it produces rather than for rounding, which is what it
      does on the way. */
  const figure = (value: number, places = 0) => value.toFixed(places);
</script>

<!-- One row: the figure's name and the figure. `value` is a snippet
     because the six are six different shapes - a frequency with a note
     beside it, a range, a count of semitones - and only their
     surroundings are shared. -->
{#snippet row(key: VoiceMetricKey, value: Snippet)}
  <div data-figure={key}>
    <dt>{metricName(key)}</dt>
    <dd>{@render value()}</dd>
  </div>
{/snippet}

<dl class="vf kit-panel" {...roleAttrs(role)}>
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

<!-- The one way in. Outside the list rather than as a last row of it: it
     is not a figure, and a definition list is a poor place for a control.
     Its own words are the screen's title, so the link says where it goes
     without a second string to keep in step. -->
<p class="vf-more">
  <a href={VOICE_METRICS_ROUTE}>
    <span>{m.vm_title()}</span>
    <Icon name="chevronRight" size={16} />
  </a>
</p>

<style>
  .vf {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }

  /* Name on the left, figure on the right, one line each. */
  .vf > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
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

  .vf-more {
    margin: var(--space-3) 0 0;
  }

  /* A quiet control rather than a run of coloured words, and a real touch
     target: the height comes from the app's own floor rather than from the
     line box of two words. The chevron says it leads somewhere, which is
     what stops the line reading as a caption on the panel above it. */
  .vf-more a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    color: var(--role-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }

  .vf-more a:hover span {
    text-decoration: underline;
    text-decoration-color: var(--role-mark);
    text-underline-offset: 3px;
  }
</style>
