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
     anchor a figure links to, and the stripe this inherits, are the
     route's too. */
  import { m } from '$lib/paraglide/messages';
  import { bandsOf, type VoiceMetric } from '$lib/data/voice/metrics';
  import { bandSource, metricFields, passageLanguageName } from '$lib/data/voice/metricLabels';
  import { bandLabel, hzRangeLabel } from '$lib/components/pitchBandCopy';

  let { metric }: { metric: VoiceMetric } = $props();

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

<!-- The stripe is the section's, set by the screen on the element the
     anchor is on, and inherited from there: kit.css derives what a role
     paints with into custom properties, so a surface inside one needs no
     role of its own (kit/role.ts). -->
<div class="vms kit-panel" data-metric={metric.key} data-metric-tier={metric.tier}>
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
                 published number with its citation under it. The figures
                 hold their own column, so three ranges can be read down
                 rather than hunted for at the end of three sentences. -->
            <dl>
              {#each bands as band (band.key)}
                <div>
                  <dt>{bandLabel(band)}</dt>
                  <dd class="vms-figures">{hzRangeLabel(band)}</dd>
                </div>
              {/each}
            </dl>
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
    font-weight: var(--weight-semibold);
    color: var(--role-ink);
  }

  .vms-field p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--text-1);
  }

  /* The published ranges, set off from the sentence that introduces them by
     a hairline rather than by a coloured bar: this is data under a claim,
     not a callout, and a tinted rail here would read as the legend of a
     graph the section does not draw. */
  .vms-bands {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    /* kit.css's own hairline, in the section's stripe: the ranges belong to
       this figure rather than to the screen. */
    border-top: var(--role-hairline);
  }

  .vms-lang {
    font-weight: var(--weight-medium);
  }

  .vms-bands dl {
    display: grid;
    gap: var(--space-1);
    margin: 0;
  }

  /* Name on the left, figures in their own column on the right, tabular so
     the digits line up down the three ranges. */
  .vms-bands dl > div {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0 var(--space-3);
    font-size: var(--text-sm);
  }

  .vms-bands dt {
    color: var(--muted);
  }

  .vms-bands dd {
    margin: 0;
  }

  .vms-figures {
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
    text-align: right;
  }

  /* Written as a compound selector rather than with !important: the
     field's own paragraph rule is what it has to outrank. */
  .vms-field p.vms-source {
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--muted);
  }

  /* The averages sentence is about both language blocks, so it sits clear
     of the second one rather than trailing it. */
  .vms-field p.vms-source[data-metric-caveat] {
    margin-top: var(--space-3);
  }
</style>
