<script lang="ts">
  /* What the bands on a pitch figure are, where the figures come from, and
     the sentence saying they are averages (phase 8 features ticket 09,
     ADR-0059).

     Its own component because two figures can share one. On the compare
     view there are two takes side by side, and a caption under each of them
     is the same three paragraphs twice, in half the width, swamping the two
     charts they are about. So a figure may hand its caption over
     (`captionShared`), and whoever took it renders one of these for the
     pair.

     That is the only way to draw these bands without a caption underneath
     them, and it is deliberately not a way to draw them with no caption at
     all: ADR-0059 permits the bands only with their figures, their source
     and their caveat, and tests/voice-figure-surfaces.test.ts holds any
     caller that passes `captionShared` to also import this. */
  import { m } from '$lib/paraglide/messages';
  import { referenceBands, type BandLanguage } from '$lib/audio/bands';
  import { bandLabel, hzLabel } from '$lib/components/pitchBandCopy';

  let {
    language,
    languageGuessed = false
  }: {
    /** Whose figures are drawn: the language of the passage being read
        (bands.ts's `bandLanguageOf`), not the app's. */
    language: BandLanguage;
    /** True for a passage of somebody's own words, where the language above
        is the app's guess. The caption says so rather than letting a guess
        read as a fact. */
    languageGuessed?: boolean;
  } = $props();

  let bands = $derived(referenceBands(language));
</script>

<div class="pbc">
  <ul class="pbc-legend">
    {#each bands as band (band.key)}
      <li data-pitch-band={band.key}>
        <span
          class="pbc-swatch"
          class:is-between={band.key === 'between'}
          aria-hidden="true"
        ></span>
        <span class="pbc-text">
          {bandLabel(band)}
          <span class="pbc-figures">{hzLabel(band.lowHz)}-{hzLabel(band.highHz)}</span>
        </span>
      </li>
    {/each}
  </ul>
  <p class="pbc-note" data-pitch-source>
    {language === 'pl' ? m.vb_band_source_pl() : m.vb_band_source_en()}
  </p>
  {#if languageGuessed}
    <p class="pbc-note" data-pitch-guessed>{m.vb_band_guessed()}</p>
  {/if}
  <p class="pbc-note" data-pitch-caveat>{m.vb_band_caveat()}</p>
</div>

<style>
  .pbc {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .pbc-legend {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-xs);
    color: var(--muted);
  }

  .pbc-legend li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .pbc-swatch {
    flex: 0 0 auto;
    width: 1.4em;
    height: 0.7em;
    border-radius: 2px;
    background: color-mix(in oklab, var(--role-c) 18%, transparent);
  }

  /* Half a range's wash, bounded by the two ranges' own facing edges: the
     region between them holds fewer speakers than either, so it reads as
     less than they do rather than more. A denser middle band is the target
     zone ADR-0012 forbids. */
  .pbc-swatch.is-between {
    background: color-mix(in oklab, var(--role-c) 9%, transparent);
    border-top: 1px solid color-mix(in oklab, var(--role-c) 30%, transparent);
    border-bottom: 1px solid color-mix(in oklab, var(--role-c) 30%, transparent);
    border-radius: 0;
  }

  .pbc-text {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
  }

  .pbc-figures {
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
  }

  .pbc-note {
    margin: 0;
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--muted);
  }
</style>
