<!-- The injection rotation body map (phase 4 ticket 02): a tappable region
     per site, over a schematic body. Deliberately not the same control as
     the patch/gel application-site picker - a patch site is not rotated on
     an injection site's schedule, so that one is a flat row of chips and
     this one is a map you can see the last injection on.

     Real buttons positioned over a decorative SVG rather than tappable SVG
     shapes: a `<button>` gets the focus ring, the touch target and the
     accessible name for free, and the silhouette is then just a picture. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { INJECTION_SITES, type InjectionSiteKey, type InjectionSiteRegion } from '$lib/data/doseSchedule';
  import { injectionSiteLabel } from '$lib/data/vocabulary/doseLabels';

  let {
    value,
    lastUsed = null,
    onChange
  }: {
    /** `''` before anything is tapped. */
    value: InjectionSiteKey | '';
    /** The site the most recent injection went to, marked so the next one
        can be rotated away from it. Null when there is no history yet, or
        when that injection was imported with a site this build cannot place. */
    lastUsed?: string | null;
    onChange: (site: InjectionSiteKey) => void;
  } = $props();

  /** Where each region sits on the silhouette, as percentages of the box.
      The left/right pair mirrors around the midline, so one entry per region
      places both. Read against the SVG below, whose viewBox is twice as tall
      as it is wide: the torso runs from 15% to 44% of the height, the pelvis
      to 49%, and the legs from there down.

      Kept far enough apart that two neighbouring dots never overlap at the
      map's narrowest - six sided regions on one small figure is the tightest
      this layout gets. */
  const PLACEMENT: Record<InjectionSiteRegion, { top: number; inset: number }> = {
    deltoid: { top: 19, inset: 25 },
    abdomen: { top: 32, inset: 42 },
    loveHandle: { top: 39, inset: 35 },
    ventrogluteal: { top: 45, inset: 36 },
    dorsogluteal: { top: 51, inset: 29 },
    thigh: { top: 62, inset: 40 }
  };

  const positionOf = (site: (typeof INJECTION_SITES)[number]) => {
    const place = PLACEMENT[site.region];
    const left = site.side === 'left' ? place.inset : 100 - place.inset;
    return `top:${place.top}%;left:${left}%`;
  };
</script>

<div class="site-map" role="radiogroup" aria-label={m.dose_site_map_aria()}>
  <!-- Decorative: every site's name is on its button, so the silhouette
       carries no information a screen reader needs. -->
  <svg class="site-map-body" viewBox="0 0 100 200" aria-hidden="true" focusable="false">
    <circle cx="50" cy="16" r="11" />
    <rect x="33" y="29" width="34" height="59" rx="12" />
    <rect x="19" y="34" width="12" height="52" rx="6" />
    <rect x="69" y="34" width="12" height="52" rx="6" />
    <!-- The pelvis: the hip and buttock dots need something to sit on, and
         without it they floated beside the figure. -->
    <rect x="32" y="82" width="36" height="16" rx="8" />
    <rect x="34" y="94" width="14" height="52" rx="7" />
    <rect x="52" y="94" width="14" height="52" rx="7" />
    <rect x="35" y="144" width="12" height="44" rx="6" />
    <rect x="53" y="144" width="12" height="44" rx="6" />
  </svg>

  {#each INJECTION_SITES as site (site.key)}
    <button
      type="button"
      class="site-dot"
      class:is-selected={value === site.key}
      class:is-last={lastUsed === site.key && value !== site.key}
      style={positionOf(site)}
      role="radio"
      aria-checked={value === site.key}
      aria-label={lastUsed === site.key
        ? `${injectionSiteLabel(site.key)}, ${m.dose_site_last_used()}`
        : injectionSiteLabel(site.key)}
      data-site={site.key}
      onclick={() => onChange(site.key)}
    ></button>
  {/each}
</div>

{#if value}
  <p class="muted small site-map-caption">{injectionSiteLabel(value)}</p>
{/if}

<style>
  .site-map {
    position: relative;
    width: 100%;
    max-width: 280px;
    aspect-ratio: 1 / 2;
    margin: 0 auto var(--space-2);
  }
  .site-map-body {
    width: 100%;
    height: 100%;
    fill: var(--surface-2);
    stroke: var(--border);
    stroke-width: 1;
  }
  .site-dot {
    position: absolute;
    /* Centred on its coordinate, and the full touch target regardless of
       how small the visible dot is. */
    transform: translate(-50%, -50%);
    width: var(--touch-target);
    height: var(--touch-target);
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 50%;
  }
  /* The visible dot, drawn inside the touch target so neighbouring sites
     look separate while staying tappable. */
  .site-dot::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--accent-border);
    background: var(--surface);
    transition:
      background var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }
  .site-dot:hover::after {
    border-color: var(--accent);
  }
  .site-dot.is-selected::after {
    background: var(--accent);
    border-color: var(--accent);
  }
  /* Where the last injection went. A ring rather than a fill: it is history,
     not the current pick, and the two must not read alike. */
  .site-dot.is-last::after {
    border-color: var(--accent);
    border-style: dashed;
  }
  .site-map-caption {
    text-align: center;
    margin-bottom: var(--space-3);
  }
</style>
