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
  import { REFERENCE_BANDS } from '$lib/audio/bands';
  import { bandLabel, caveatText, hzLabel, sourceText } from '$lib/components/pitchBandCopy';
</script>

<div class="pbc">
  <ul class="pbc-legend">
    {#each REFERENCE_BANDS as band (band.key)}
      <li data-pitch-band={band.key}>
        <span class="pbc-swatch" class:is-overlap={band.key === 'overlap'} aria-hidden="true"></span>
        <span class="pbc-text">
          {bandLabel(band.key)}
          <span class="pbc-figures">{hzLabel(band.lowHz)}-{hzLabel(band.highHz)}</span>
        </span>
      </li>
    {/each}
  </ul>
  <p class="pbc-note" data-pitch-source>{sourceText()}</p>
  <p class="pbc-note" data-pitch-caveat>{caveatText()}</p>
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

  /* Two of those on top of each other, with the band's own two edges: the
     same arithmetic the figure draws the overlap by. */
  .pbc-swatch.is-overlap {
    background: color-mix(in oklab, var(--role-c) 33%, transparent);
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
