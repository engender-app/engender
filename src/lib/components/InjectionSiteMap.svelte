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
     is recency, a solid ring is the site tapped for this dose, and a
     dashed ring is where the last injection went. Nothing here says a site
     is due. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { INJECTION_SITES, type InjectionSiteKey } from '$lib/data/doseSchedule';
  import { recencyHeatLevel, recencySpan } from '$lib/data/metricRange';
  import { injectionSiteLabel } from '$lib/data/vocabulary/doseLabels';
  import { sitePosition } from './injectionSiteMap';

  const listHeadId = $props.id();

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

  /** The ramp shades across this journal's own span of recency rather than
      across day bands the app picked, so a weekly rotation and a
      fortnightly one both use the whole ramp (metricRange.ts). */
  const span = $derived(recency ? recencySpan(Object.values(recency)) : null);

  /** The swatch a site's recency lands on, or null where the caller passed
      no recency at all. Level 0 is the never-used state, which is drawn as
      an empty dot rather than as the pale end of the ramp: neither a large
      number nor zero reads as "never". */
  const levelOf = (key: InjectionSiteKey) =>
    recency && span ? recencyHeatLevel(recency[key], span) : null;

  /** The dot's fill as a custom property, so the list's swatches can be
      the same colour by the same route. Level 0 sets nothing: an empty dot
      is drawn by the absence of a fill rather than by a colour that stands
      for absence. */
  const swatchStyle = (level: number | null) =>
    level === null || level === 0 ? '' : `--dot-fill:var(--heat-${level})`;

  const dotStyle = (site: (typeof INJECTION_SITES)[number]) => {
    const { top, left } = sitePosition(site);
    return `top:${top}%;left:${left}%;${swatchStyle(levelOf(site.key))}`;
  };
</script>

<div class="site-map" role="radiogroup" aria-label={m.dose_site_map_aria()}>
  <!-- Decorative: every site's name is on its button, so the silhouette
       carries no information a screen reader needs. -->
  <svg class="site-map-body" viewBox="0 0 100 150" aria-hidden="true" focusable="false">
    <circle cx="50" cy="10" r="8.5" />
    <!-- Torso, then the arms beside it: the deltoid dot is a shoulder, so
         the arms start high enough to have one. -->
    <rect x="33" y="20" width="34" height="50" rx="12" />
    <rect x="19" y="24" width="12" height="46" rx="6" />
    <rect x="69" y="24" width="12" height="46" rx="6" />
    <!-- The pelvis: the hip and buttock dots need something to sit on, and
         without it they floated beside the figure. -->
    <rect x="32" y="66" width="36" height="22" rx="10" />
    <!-- Thighs to the foot of the box, and no shins. Every one of the six
         regions is above the knee, so the lower legs were 130px of picture
         that carried no site and pushed the map past the height the sheet
         can show at once. -->
    <rect x="32" y="84" width="16" height="66" rx="8" />
    <rect x="52" y="84" width="16" height="66" rx="8" />
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

<!-- The ramp's key, on the pattern of the calendar heat-map's (ADR-0012):
     the ends carry the reading's own endpoints rather than worst and best,
     and the empty swatch gets its own item because "never" is not a step of
     the ramp. It sits under the figure rather than in the hint above it: at
     four lines of prose the hint pushed the map itself off a 390px screen,
     and a ramp is quicker to show than to describe.

     Hidden from a screen reader, which the silhouette above it is too. Every
     row of the list below says its own state in words, which is the
     equivalent this ticket owes; hearing the ramp described as well would be
     the same information twice. -->
{#if recency}
  <div class="site-legend" aria-hidden="true">
    <span class="site-legend-scale">
      <span class="site-legend-end">{m.dose_site_legend_oldest()}</span>
      {#each [1, 2, 3, 4] as level (level)}
        <span class="site-legend-swatch" style={swatchStyle(level)}></span>
      {/each}
      <span class="site-legend-end">{m.dose_site_legend_newest()}</span>
    </span>
    <span class="site-legend-never">
      <span class="site-legend-swatch is-never"></span>
      {m.dose_site_never_used()}
    </span>
  </div>
{/if}

<!-- Ticket 10's list, kept: a colour ramp is not readable by a screen
     reader, so this is the recency in words rather than a duplicate to be
     tidied away now the map carries it. Each row shows its own dot's
     swatch, which makes the list the map's key as well as its equivalent. -->
{#if recency}
  <!-- The heading is what the list's accessible name has always said, now
       said on screen as well: the list is 500px below the figure on a phone,
       so it arrives on its own with nothing to say what the numbers are. -->
  <p class="muted small site-recency-head" id={listHeadId}>{m.dose_site_recency_aria()}</p>
  <ul class="site-recency-list" aria-labelledby={listHeadId}>
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
    /* injectionSiteMap.ts spaces the dots against these two numbers in px,
       and its test holds the closest pair a touch target and a gap apart.
       The height is what the sheet can show at once; see MAP_HEIGHT. */
    max-width: 280px;
    aspect-ratio: 2 / 3;
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
  /* The swatch, in both places it appears: the visible dot on the figure
     and the chip on its row in the list. Stated once so the map and its own
     key cannot drift apart.

     --outline-strong, not --border: this is palettes.css's line for a
     control that has to hold its own edge against a fill, and the dot has
     to hold it against the silhouette's own surface as well - --border over
     --surface-2 is close to invisible in both themes. */
  .site-dot::after,
  .site-recency-swatch {
    border-radius: 50%;
    border: 1.5px solid var(--outline-strong);
    background: var(--dot-fill, var(--surface));
  }
  /* Never used: no fill and a firmer edge, at the same size as the rest.
     Hollow against filled is the whole difference, and it has to hold
     against the faintest step of the ramp rather than against nothing - a
     dot a size down would also read as a site the map thinks less of, and
     a site nobody has used yet is a site to consider. */
  .site-dot.is-never::after,
  .site-recency-row.is-never .site-recency-swatch {
    background: none;
    border-width: 2px;
  }
  /* The dot is drawn inside the touch target so neighbouring sites look
     separate while staying tappable. */
  .site-dot::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 22px;
    height: 22px;
    transition:
      background var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }
  .site-dot:hover::after {
    border-color: var(--accent);
  }
  /* Both of the map's other two things are a ring around the dot rather
     than a change to it, because the dot itself is spoken for: neither
     picking a site nor having used it last may erase what the map says
     about when it was used.

     One ring, two strokes. They cannot appear together - a site that is
     the current pick is not also marked as history - so the difference
     they have to carry is against the plain dot, not against each other.

     Drawn on every dot and revealed, so the ring has something to ease
     from; base.css flattens the transition under reduced motion. */
  .site-dot::before {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid transparent;
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.82);
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }
  /* The site tapped for this dose. */
  .site-dot.is-selected::before {
    border-color: var(--accent);
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  /* Where the last injection went. Dashed: it is history, not a pick. */
  .site-dot.is-last::before {
    border-width: 1.5px;
    border-style: dashed;
    border-color: var(--accent);
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  .site-map-caption {
    text-align: center;
    margin-bottom: var(--space-3);
  }
  /* The key, on the calendar legend's measurements (HeatMap.svelte). */
  .site-legend {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    justify-content: center;
    font-size: var(--text-xs);
    color: var(--text-2);
    margin-bottom: var(--space-3);
  }
  .site-legend-scale,
  .site-legend-never {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .site-legend-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: inline-block;
    border: 1.5px solid var(--outline-strong);
    background: var(--dot-fill, var(--surface));
  }
  .site-legend-swatch.is-never {
    background: none;
    border-width: 2px;
  }
  .site-recency-head {
    margin: 0 0 var(--space-1);
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
  }
  .site-recency-row span:last-child {
    white-space: nowrap;
  }
</style>
