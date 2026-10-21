<script lang="ts">
  /* A benchmark metric explained in seven fields, with a small figure
     for the person's latest take. No population band is drawn. */
  import { m } from '$lib/paraglide/messages';
  import { type VoiceMetric, type VoiceMetricKey } from '$lib/data/voice/metrics';
  import { metricFields } from '$lib/data/voice/metricLabels';
  import { hzLabel } from '$lib/components/pitchBandCopy';
  import MetricFigure from '$lib/components/MetricFigure.svelte';
  import type { MetricFigureData } from '$lib/data/voice/metricFigures';

  let { metric, figure = null }: { metric: VoiceMetric; figure?: MetricFigureData | null } = $props();

  let fields = $derived(metricFields(metric.key));

  /** How this figure's own axis writes a number - the same places
      VoiceOwnSeries.svelte's trend card writes them in, so a tick here and
      a scrub readout there never disagree about how many decimals a figure
      gets. Pitch reuses PitchFigure's own `hzLabel` rather than repeating
      the rounding rule a third place. */
  const TICK_LABEL: Record<VoiceMetricKey, (value: number) => string> = {
    pitch: hzLabel,
    span: (value) => m.vb_hz({ value: value.toFixed(0) }),
    spread: (value) => m.vb_semitones({ value: value.toFixed(1) }),
    rate: (value) => m.vb_wpm({ value: value.toFixed(0) }),
    resonance: (value) => m.vb_hz({ value: value.toFixed(0) }),
    room: (value) => m.vb_db({ value: value.toFixed(0) }),
    scale: (value) => m.vb_scale_value({ value: value.toFixed(2) })
  };
  let tickLabel = $derived(TICK_LABEL[metric.key]);

</script>

<!-- The stripe is the section's, set by the screen on the element the
     anchor is on, and inherited from there: kit.css derives what a role
     paints with into custom properties, so a surface inside one needs no
     role of its own (kit/role.ts). -->
<div class="vms kit-panel" data-metric={metric.key} data-metric-tier={metric.tier}>
  {#if figure}
    <MetricFigure low={figure.low} high={figure.high} value={figure.value} {tickLabel} />
  {/if}
  {#each fields as field (field.field)}
    <section class="vms-field" data-metric-field={field.field}>
      <h3>{field.heading}</h3>
      <p>{field.body}</p>

    </section>
  {/each}
</div>

<style>
  .vms {
    display: flex;
    flex-direction: column;
    /* Generous between fields, tight inside one: seven answers read as
       seven answers rather than as one wall of text (app.css's own rule
       about a heading belonging to what comes after it, one level down). */
    gap: var(--space-5);
  }

  .vms-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  /* The question, at body size in the section's own ink. Not a
     letterspaced grey micro-label: the redesign took those out of this app
     and a question the reader is meant to read is not an eyebrow. Weight
     and colour carry the step down to the answer, which is the same size
     because both are prose. */
  .vms-field h3 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--role-ink);
  }

  .vms-field p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--text);
  }

</style>
