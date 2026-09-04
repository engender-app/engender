<script lang="ts">
  /* One figure, explained (phase 8 features ticket 27, ADR-0060).

     Ticket 09 left six numbers in a definition list, one of them with a
     picture and two cited bands behind it and five with nothing. A screen
     that draws a band on one figure and nothing on five, and never says
     why, reads as five omissions or five bugs. So this is the explanation,
     and the explanation is the feature rather than a caption on it.

     Seven fields, always all seven, in one order, from
     data/voice/metricLabels.ts. Nothing here decides which of them to
     render: a figure ships explained or not at all, and the type is what
     makes that true (metricLabels.ts's own note).

     **The ranges are drawn from the data, not written into the copy.**
     Field 5 is the only field whose prose is followed by figures, and only
     for the one Referenced figure. Those figures come through
     `bandsOf`, which is bands.ts's mean plus or minus one standard
     deviation per language, so what the citation says and what the pitch
     graph draws cannot drift apart. A language the citation does not cover
     draws nothing rather than the English ranges (ADR-0060's first rule),
     which is why this asks per language instead of formatting whatever it
     is handed.

     No badge for the tier, no verdict colour, no target, no mention of the
     reader's own numbers: this explains and never instructs (ADR-0060,
     ADR-0012). The heading above each section is the route's, so the
     anchor a figure links to is the route's too. */
  import { m } from '$lib/paraglide/messages';
  import { bandsOf, type VoiceMetric } from '$lib/data/voice/metrics';
  import { bandSource, metricFields, passageLanguageName } from '$lib/data/voice/metricLabels';
  import { bandLabel, hzRangeLabel } from '$lib/components/pitchBandCopy';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  let {
    metric,
    role
  }: {
    metric: VoiceMetric;
    role?: Role;
  } = $props();

  let fields = $derived(metricFields(metric.key));

  /** The languages this figure has published ranges for, each with the
      ranges themselves. Empty for every Own-series figure, which is what
      leaves field 5 as its sentence alone. */
  let sourced = $derived(
    metric.bandLanguages.flatMap((language) => {
      const bands = bandsOf(metric, language);
      return bands ? [{ language, bands }] : [];
    })
  );
</script>

<div class="vms kit-panel" data-metric={metric.key} data-metric-tier={metric.tier} {...roleAttrs(role)}>
  {#each fields as field (field.field)}
    <section class="vms-field" data-metric-field={field.field}>
      <h3>{field.heading}</h3>
      <p>{field.body}</p>

      {#if field.field === 'typical'}
        {#each sourced as { language, bands } (language)}
          <div class="vms-bands" data-metric-bands={language}>
            <p class="vms-lang">{passageLanguageName(language)}</p>
            <!-- Names and figures rather than a drawing: the graph on the
                 take is where a range is a shape, and here it is a
                 published number with a citation under it. -->
            <ul>
              {#each bands as band (band.key)}
                <li>
                  <span>{bandLabel(band)}</span>
                  <span class="vms-figures">{hzRangeLabel(band)}</span>
                </li>
              {/each}
            </ul>
            <p class="vms-source">{bandSource(language)}</p>
          </div>
        {/each}
        {#if sourced.length > 0}
          <!-- The same sentence the graph carries, once for the section:
               averages, per language, and nothing here is a target
               (ADR-0059). -->
          <p class="vms-source" data-metric-caveat>{m.vb_band_caveat()}</p>
        {/if}
      {/if}
    </section>
  {/each}
</div>

<style>
  .vms {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Seven fields read as seven answers rather than as one wall: the
     question in the section's own ink, the answer under it in body text.
     A field is never omitted, so the rhythm is the same in all six
     sections and a person who reads two of them knows where the sentence
     they came for is. */
  .vms-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .vms-field h3 {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--role-ink);
  }

  .vms-field p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--text-1);
  }

  /* The published ranges, indented off the sentence that introduces them
     and marked by the section's own stripe rather than by a swatch: a
     coloured block here would be a legend for a graph this section does
     not draw. */
  .vms-bands {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-3);
    padding-left: var(--space-3);
    border-left: 2px solid color-mix(in oklab, var(--role-c) 40%, transparent);
  }

  .vms-lang {
    font-weight: var(--weight-medium);
  }

  .vms-bands ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .vms-bands li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    color: var(--muted);
  }

  .vms-figures {
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
  }

  /* Written as a compound selector rather than with !important: the
     field's own paragraph rule is what it has to outrank. */
  .vms-field p.vms-source {
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--muted);
  }
</style>
