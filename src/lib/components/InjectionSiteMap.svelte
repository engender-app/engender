<!-- The injection rotation body map (phase 4 ticket 02): a tappable region
     per site, over a schematic body. Deliberately not the same control as
     the patch/gel application-site picker - a patch site is not rotated on
     an injection site's schedule, so that one is a flat row of chips and
     this one is a map you can see the last injection on.

     Real buttons positioned over a decorative SVG rather than tappable SVG
     shapes: a `<button>` gets the focus ring, the touch target and the
     accessible name for free, and the silhouette is then just a picture.

     Phase 6 ticket 13: each dot now shades by how long ago its site was
     used, so the question "where should this one go" is answered off the
     picture instead of by reading a twelve-row table against it. The dots
     carry three things at once and each one has its own channel: the fill
     is recency, an outer ring is the site tapped for this dose, and a
     dashed edge is where the last injection went. Nothing here says a site
     is due. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { INJECTION_SITES, type InjectionSiteKey } from '$lib/data/doseSchedule';
  import { recencyHeatLevel } from '$lib/data/metricRange';
  import { injectionSiteLabel } from '$lib/data/vocabulary/doseLabels';
  import { sitePosition } from './injectionSiteMap';

  let {
    value,
    lastUsed = null,
    recency,
    onChange
  }: {
    /** `''` before anything is tapped. */
    value: InjectionSiteKey | '';
    /** The site the most recent injection went to, marked so the next one
        can be rotated away from it. Null when there is no history yet, or
        when that injection was imported with a site this build cannot place. */
    lastUsed?: string | null;
    /** Days since each site was last used, or null for a site never used
        (ticket 10: doseSchedule.ts's siteRecency). Omitted where the caller
        has no dose history at hand - the dots then carry no recency and the
        list below is absent. */
    recency?: Record<InjectionSiteKey, number | null>;
    onChange: (site: InjectionSiteKey) => void;
  } = $props();

  /** The swatch a site's recency lands on, or null where the caller passed
      no recency at all. Level 0 is the never-used state, which is drawn as
      an empty dot rather than as the pale end of the ramp: neither a large
      number nor zero reads as "never". */
  const levelOf = (key: InjectionSiteKey) =>
    recency ? recencyHeatLevel(recency[key]) : null;

  /** The dot's own two colours as custom properties. `--on-heat-N` is the
      ink palettes.css already tunes for a fill that deep, which is what
      keeps the dashed last-used edge legible on the strongest swatch and on
      the empty one alike. */
  const swatchStyle = (level: number | null) =>
    level === null
      ? ''
      : `--dot-fill:var(--heat-${level});--dot-ink:var(--on-heat-${level})`;

  const dotStyle = (site: (typeof INJECTION_SITES)[number]) => {
    const { top, left } = sitePosition(site);
    return `top:${top}%;left:${left}%;${swatchStyle(levelOf(site.key))}`;
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
    <!-- The upper legs run flush with the pelvis: the buttock dot sits at
         the top of one, and at 14 units wide it hung off the side. -->
    <rect x="32" y="94" width="16" height="52" rx="8" />
    <rect x="52" y="94" width="16" height="52" rx="8" />
    <rect x="35" y="144" width="12" height="44" rx="6" />
    <rect x="53" y="144" width="12" height="44" rx="6" />
  </svg>

  {#each INJECTION_SITES as site (site.key)}
    <button
      type="button"
      class="site-dot"
      class:is-selected={value === site.key}
      class:is-last={lastUsed === site.key && value !== site.key}
      class:is-never={levelOf(site.key) === 0}
      style={dotStyle(site)}
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

<!-- Ticket 10's list, kept: a colour ramp is not readable by a screen
     reader, so this is the recency in words rather than a duplicate to be
     tidied away now the map carries it. Each row shows its own dot's
     swatch, which makes the list the map's key as well as its equivalent. -->
{#if recency}
  <ul class="site-recency-list" aria-label={m.dose_site_recency_aria()}>
    {#each INJECTION_SITES as site (site.key)}
      {@const days = recency[site.key]}
      <li
        class="site-recency-row"
        class:is-never={days === null}
        data-site={site.key}
        style={swatchStyle(levelOf(site.key))}
      >
        <span class="site-recency-swatch" aria-hidden="true"></span>
        <span>{injectionSiteLabel(site.key)}</span>
        <span class="muted">
          {days === null ? m.dose_site_never_used() : m.dose_site_days_ago({ days: m.n_days({ n: days }) })}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .site-map {
    position: relative;
    width: 100%;
    /* injectionSiteMap.ts spaces the dots against this number in px, and
       its test holds the two apart by a touch target. */
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
     look separate while staying tappable. Its fill is the recency swatch;
     the hairline edge is what keeps the palest swatch and the empty one
     visible against the silhouette's own surface. */
  .site-dot::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--dot-fill, var(--surface));
    transition:
      background var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }
  /* Never used. Empty and a size down, two channels rather than one,
     because the faintest step of the ramp is a 22% tint and "never" must
     not read as "a long time ago". */
  .site-dot.is-never::after {
    width: 15px;
    height: 15px;
    background: none;
  }
  .site-dot:hover::after {
    border-color: var(--accent);
  }
  /* The site tapped for this dose. A ring around the dot rather than a
     fill, because the fill is spoken for: picking a site must not erase
     what the map says about it. */
  .site-dot.is-selected::before {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid var(--accent);
  }
  /* Where the last injection went. Dashed, in the ink tuned for whatever
     swatch it sits on: it is history, not the current pick, and the two
     must not read alike. */
  .site-dot.is-last::after {
    border-color: var(--dot-ink, var(--accent));
    border-style: dashed;
  }
  .site-map-caption {
    text-align: center;
    margin-bottom: var(--space-3);
  }
  .site-recency-list {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }
  .site-recency-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  /* The same dot, at row scale: the list says in words what the map says
     in colour, and this is the join between them. */
  .site-recency-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--dot-fill, var(--surface));
  }
  .site-recency-row.is-never .site-recency-swatch {
    width: 9px;
    height: 9px;
    margin: 0 1.5px;
    background: none;
  }
  .site-recency-row span:last-child {
    white-space: nowrap;
  }
</style>
