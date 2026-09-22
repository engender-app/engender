<script lang="ts">
  /* The Look back door: the person's own history as a rail, the span
     pointed at on it, that span's facts, and a short set of deep readings
     each opening a screen at the same span (phase 11 ticket 07).

     What it was before this: a scroll of eleven cards, eight defaulting
     to mood, roughly six viewports, with one section heading and nothing
     sticky - the whole-app audit's finding 6. Every card was drawn in full
     under the rail, so the deepest reading on the door (the constellation)
     sat 510px into the scroll where nobody scrubbed it, and a person who
     dragged a span read four cards before reaching the one they meant.

     The door now, top to bottom: the field and the title; the rail with
     its legend and state line (ticket 06); the span's three facts (ticket
     05); the quick picks and the way into the span's wrapped; a grid of
     reading tiles, each stating one headline figure for the span and
     opening `/stats/<reading>` where the full card draws with its
     controls; and the resurfacing block, the wrapped tile beside the
     on-this-day tile, which opens in place. Nothing else.

     A tile is a summary of a screen rather than the screen (Revolut's
     analytics, MacroFactor's insights), flush on the page between hairlines
     rather than a block of the stripe - Alicja's call on the rendered spike
     (2026-09-16). A reading with no data in the span has no tile ("absent,
     never empty"), so the count varies with the span and the grid rewraps.
     Every reading component here draws itself twice - as its tile and, on
     its own route, as its card - so the figure on the door and the card
     behind it are one read, never two.

     Three cards left the door for good in this ticket rather than becoming
     tiles: "Each scale, this period" draws under the day-by-day chart on
     that reading's screen, since it reads the same series; "Days at each
     mood" and "What you write about" are one tile, "How the days fell",
     since both ask what the span was made of; and the journey anchor's
     caption is wrapped's own line now, not a fourth thing on this door.

     Redesign ticket 11: one span drives every read on this screen. The rail
     runs from the earliest day the person authored anything dated to today
     (SpanTimeline, lookBackSpan.ts), two handles bound a span, and that
     span is what every tile and every screen behind it is read over - and
     the retrospective the "wrapped for this span" link opens, which is
     /wrapped/range at the same query the range picker writes. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import {
    defaultSpan,
    eraBands,
    eraOfferDue,
    getLastLookBackSpan,
    historyBands,
    historyStart,
    railFacts,
    setLastLookBackSpan,
    spanRangeQuery,
    surgeryMarks,
    type Span
  } from '$lib/data/lookBackSpan';
  import { spanLabel } from '$lib/data/spanLabel';
  import { recapDimChange } from '$lib/data/recapDisplay';
  import { nativeValue, signedValue } from '$lib/data/wrappedDisplay';
  import { metricStandings } from '$lib/data/statsCharts';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { flagBarRole, roleAt, tileRoleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SpanFacts from '$lib/components/SpanFacts.svelte';
  import SpanTimeline from '$lib/components/SpanTimeline.svelte';
  import WordsReading from '$lib/components/WordsReading.svelte';
  import WrappedHomeCard from '$lib/components/WrappedHomeCard.svelte';
  import OnThisDayHomeCard from '$lib/components/OnThisDayHomeCard.svelte';
  import OnThisDayBlock from '$lib/components/OnThisDayBlock.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ReadingGrid from '$lib/components/kit/ReadingGrid.svelte';
  import DayByDayReading from '$lib/components/readings/DayByDayReading.svelte';
  import PlaneReading from '$lib/components/readings/PlaneReading.svelte';
  import DaysReading from '$lib/components/readings/DaysReading.svelte';
  import TagsReading from '$lib/components/readings/TagsReading.svelte';
  import HighestReading from '$lib/components/readings/HighestReading.svelte';
  import ThemesReading from '$lib/components/readings/ThemesReading.svelte';
  import BodyMapTile from '$lib/components/readings/BodyMapTile.svelte';
  import CompareTile from '$lib/components/readings/CompareTile.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { collapse, crossfade, disclose } from '$lib/motion/reveal';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { readingHref } from '$lib/data/lookBackReadings';
  import { metricChoices, shownMetric } from '$lib/data/metricChoices';

  /* Which stripe each area of the screen takes (DIRECTION.md, "flag colour
     reaches the whole app, categorically"). Every drawing on the door
     shares role 0, the brief's own exception rather than a shortcut:
     "colour that carries a value takes role 0", because index 0 is the only
     one guaranteed to be a colour on all 8 palettes. The facts and the
     resurfacing pair take the stripe after it, where an achromatic band is
     not a problem. `1` was the two interval folds' own stripe, moved to
     Care with them (redesign ticket 05); `lookBack` keeps its index. */
  const AREA_ROLE = { charts: 0, lookBack: 2 };

  /* Read on recompute rather than captured, so a session open across
     midnight moves on (ticket 10). */
  let today = $derived(todayEpochDay());

  /* The rail (redesign ticket 11): where the person's history starts, from
     the three things the journal already dates - its own entry bounds, the
     milestones (mirrored, ADR-0004, so no query), and the eras. */
  let erasQuery = liveList((j) => j.eras.getEras());
  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());
  let railLoading = $derived(erasQuery.loading || boundsQuery.loading);
  let railStart = $derived(
    railLoading
      ? null
      : historyStart(
          { bounds: boundsQuery.value ?? null, milestones: vocabulary.milestones, eras: erasQuery.rows },
          today
        )
  );

  /* The rest of the rail's history (ticket 06): regimen episodes and
     tryouts as bands, procedures as marks - one question over the whole
     rail rather than four, since `getAnnotations` is already the app's
     single "what happened between these days" query. */
  let railAnnotationsQuery = liveList(async (j) => {
    const start = railStart;
    if (start === null) return [];
    return j.chartAnnotations.getAnnotations(start, today, today);
  });
  let railHistory = $derived(historyBands(railAnnotationsQuery.rows));
  let railSurgeries = $derived(surgeryMarks(railAnnotationsQuery.rows));
  /* The same facts as a list, for the finger the 8px bands are not for
     (phase 11 UI/UX ticket 25). One read behind both: the list is built
     from what the rail is already drawing, so a fact cannot be on one and
     missing from the other. */
  let facts = $derived(
    railStart === null
      ? []
      : railFacts(
          {
            eras: eraBands(erasQuery.rows, railStart, today),
            history: railHistory,
            milestones: vocabulary.milestones,
            surgeries: railSurgeries
          },
          railStart,
          today
        )
  );

  /* The span, settled. Null until the rail is known, then wrapped's own
     default window; from there it is the person's. `live` is the same span
     as the finger has it. Restored on Back navigation (phase 11 ticket 32). */
  let span = $state<Span | null>(getLastLookBackSpan());
  let live = $state<Span | null>(getLastLookBackSpan());

  $effect(() => {
    const start = railStart;
    if (start === null) return;
    if (span !== null) {
      if (span.start < start || span.end > today) {
        span = defaultSpan(start, today);
        live = span;
        setLastLookBackSpan(span);
      }
      return;
    }
    span = defaultSpan(start, today);
    live = span;
    setLastLookBackSpan(span);
  });
  /* Picking an existing era counts as handled too (redesign ticket 48
     review): a stretch already named is not the "just dragged this out"
     moment the offer is for. Exact-match only, resolved with `eraBands`,
     the same clamp SpanTimeline draws the bands with. */
  let existingEraSpans = $derived(
    railStart === null ? [] : eraBands(erasQuery.rows, railStart, today).map((band) => ({ start: band.start, end: band.end }))
  );
  const pickSpan = (next: Span) => {
    span = next;
    live = next;
    setLastLookBackSpan(next);
    const isExistingEra = existingEraSpans.some((era) => era.start === next.start && era.end === next.end);
    eraOfferSpan = !isExistingEra && eraOfferDue(next, handledEraOfferSpans) ? next : null;
  };

  /* The "name this stretch" offer (redesign ticket 48): once a span the
     person dragged settles, one offer to turn it into an era, on this
     surface and nowhere else. Plain component state, gone on reload. */
  let eraOfferSpan = $state<Span | null>(null);
  let handledEraOfferSpans = $state<Span[]>([]);
  const settleEraOffer = (handled: Span) => {
    handledEraOfferSpans = [...handledEraOfferSpans, handled];
    eraOfferSpan = null;
  };

  /* Two epoch days to the journal, which never reads the clock for a
     domain answer: the span's own, and wrapped's default until the rail
     has answered, so the readings have something honest to read while it
     does. Inclusive of both ends. */
  let from = $derived(span?.start ?? defaultSpan(today, today).start);
  let to = $derived(span?.end ?? today);
  let resolvedSpan = $derived<Span>({ start: from, end: to });
  let liveLabel = $derived(live ? spanLabel(live, today) : '');

  /* Week, month and year, one tap each, to the cadence routes. Links, so
     the group is a nav and each is its own screen. */
  const QUICK_PICKS = [
    { value: 'week', href: '/wrapped/week', label: () => m.wrapped_cadence_week() },
    { value: 'month', href: '/wrapped/month', label: () => m.wrapped_cadence_month() },
    { value: 'year', href: '/wrapped/year', label: () => m.wrapped_cadence_year() }
  ];

  let shown = $derived(shownMetric(metricChoices()));

  /* ---------------------------------------------------------------------
     The recap, for three things at once (ADR-0056). `entryCount` is the
     floor every summary panel on this door is held to - WRAPPED_ENTRY_FLOOR,
     the same bar a retrospective clears - and `biggestDimensionChange`
     feeds the span's facts (redesign ticket 05). One read answers both,
     and the tiles that hold to the floor are handed its answer rather than
     asking again (ADR-0010). */
  let recapQuery = liveQuery((j) => j.stats.recap(from, to));
  let entryCount = $derived(recapQuery.value?.entryCount ?? 0);
  let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);

  /* The span's facts (redesign ticket 05: "zero facts in the first
     viewport"). Wrapped's own three-line shape, with one deliberate
     difference: the second line is whichever scale the person has active,
     so the door's first number is never a scale nobody keeps. The active
     scale's average is one read of its own series here - the door no
     longer draws every scale's standing, that card is the day-by-day
     reading's now. */
  let dimChange = $derived(recapQuery.value ? recapDimChange(recapQuery.value) : null);
  let activeSeriesQuery = liveList((j) => j.stats.dayAverages(shown.key, from, to));
  let activeAverage = $derived.by(() => {
    const standing = metricStandings([{ key: shown.key, range: { min: shown.min, max: shown.max } }], () => activeSeriesQuery.rows)[0];
    return standing && standing.value !== null ? nativeValue(shown.key, standing.value) : '';
  });

  /* The on-this-day tile opens in place (phase 11 ticket 07, the audit's
     finding 8): the route it used to open was 844px holding one card and
     500px of nothing. The block discloses under the pair; the tile's own
     href still points at the route, which a notification deep-links to. */
  let dayOpen = $state(false);
</script>

<div class="screen">
  <!-- The door's title at 48 on the field, and nothing under it: the span
       is written under the rail, against the handles that move it
       (ticket 06). -->
  <ScreenHeader title={m.nav_lookback()} screen="stats" />

  <!-- The history, and the span pointed at on it (redesign ticket 11).
       Entry data behind the rail's start, so it waits; a journal with
       nothing dated yet says so instead of drawing a rail from today to
       today. -->
  {#if railLoading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if railStart === null}
    <Notice icon="clock" key="lookback-empty" title={m.lookback_empty_title()} text={m.lookback_empty_body()}
      action={{ label: m.new_entry(), primary: true, onclick: () => (ui.chooserOpen = true) }} />
  {:else if span}
    <div class="lookback-rail" data-lookback-rail>
      <SpanTimeline
        {railStart}
        {today}
        {span}
        eras={erasQuery.rows}
        milestones={vocabulary.milestones}
        history={railHistory}
        surgeries={railSurgeries}
        firstEntryDay={boundsQuery.value?.firstEpochDay ?? null}
        hintSeen={prefs.spanRailHintDismissed}
        flagFill={activeFlag.fill}
        roles={activeFlag.roles}
        onChange={pickSpan}
        onLive={(next) => (live = next)}
        onHintSeen={() => (prefs.spanRailHintDismissed = true)}
      />
    </div>

    <!-- The rail's own facts as a list, folded, directly under the rail
         (phase 11 UI/UX ticket 25): the way to an era, an episode, a
         tryout or a milestone that does not depend on hitting an 8px band,
         with every fact's exact dates written out. It sets the same span
         the band on the rail sets, so the two never disagree. -->
    {#if facts.length}
      <SpanFacts
        {facts}
        {railStart}
        {today}
        {span}
        role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}
        onPick={pickSpan}
      />
    {/if}

    <!-- The span's facts, directly under the rail and before anything
         else: entries, the active scale's average, the scale that moved
         furthest. `enoughEntries` is the one floor every summary panel
         here shares; under it the thin-body line below says why there is
         nothing to open, so this draws nothing rather than a second "not
         enough" message for the same span. -->
    {#if recapQuery.loading || activeSeriesQuery.loading}
      <Skeleton variant="line" count={3} />
    {:else if enoughEntries}
      <div data-lookback-facts transition:collapse>
        <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}>
          <ListRow static data-lookback-fact title={m.wrapped_stat_entries()}>
            {#snippet trailing()}<b class="wrapped-figure-value">{entryCount}</b>{/snippet}
          </ListRow>
          {#if activeAverage}
            <div class="rows-divide" transition:collapse>
              <ListRow static data-lookback-fact title={m.lookback_facts_average({ name: shown.name })}>
                {#snippet trailing()}<b class="wrapped-figure-value">{activeAverage}</b>{/snippet}
              </ListRow>
            </div>
          {/if}
          {#if dimChange}
            <div class="rows-divide" transition:collapse>
              <ListRow
                static
                data-lookback-fact
                title={m.wrapped_scale_arc()}
                subtitle={m.wrapped_scale_arc_body({
                  name: dimChange.name,
                  from: String(Math.round(dimChange.from)),
                  to: String(Math.round(dimChange.to))
                })}
              >
                {#snippet trailing()}
                  <b class="wrapped-figure-value">{signedValue(dimChange.change, (n) => String(Math.round(n)))}</b>
                {/snippet}
              </ListRow>
            </div>
          {/if}
        </ListCard>
      </div>
    {/if}

    <!-- "Name this stretch" (redesign ticket 48): a person who has just
         dragged out a span is offered the chance to name it, here and
         nowhere else. `disclose` opens and gives back its own height. -->
    {#if eraOfferSpan}
      {@const offerSpan = eraOfferSpan}
      <div class="era-offer" data-era-offer role="group" aria-labelledby="era-offer-title" transition:disclose>
        <div class="era-offer-said">
          <span class="kit-row-ico"><Icon name="columns" size={22} /></span>
          <span class="kit-row-text">
            <span class="kit-row-title" id="era-offer-title">{m.lookback_era_offer_title()}</span>
            <span class="kit-row-sub">{m.lookback_era_offer_body()}</span>
          </span>
        </div>
        <div class="era-offer-answers">
          <a
            class="era-offer-yes"
            data-era-offer-confirm
            data-span-keep
            href={`/settings/eras?start=${offerSpan.start}&end=${offerSpan.end}`}
            onclick={() => settleEraOffer(offerSpan)}
          >
            {m.lookback_era_offer_confirm()}
          </a>
          <button type="button" class="era-offer-no" data-era-offer-dismiss onclick={() => settleEraOffer(offerSpan)}>
            {m.lookback_era_offer_dismiss()}
          </button>
        </div>
      </div>
    {/if}

    <!-- The three completed cadences at their own routes, one tap each, in
         the square track. None is current here. After the facts rather
         than above the rail (ticket 07): the first thing under the title
         is the history, and the first thing under the rail is a fact
         about the span. -->
    <Segmented
      name={m.wrapped_cadence_group()}
      options={QUICK_PICKS.map((pick) => ({ value: pick.value, label: pick.label(), href: pick.href }))}
      value=""
      compact
      key="lookback-quick"
    />

    <!-- The way into the span's retrospective: the same range read wrapped
         already makes, at the URL the range picker itself would write for
         these two days. Under the floor the line says why there is nothing
         to open, in the words the range view uses for the same case. -->
    <div class="lookback-line">
      {#if recapQuery.loading}
        <span class="lookback-thin" aria-hidden="true"></span>
      {:else if enoughEntries}
        <a class="lookback-read" data-lookback-read data-span-keep href={`/wrapped/range${spanRangeQuery(span)}`}>
          {m.lookback_read_span()}
        </a>
      {:else}
        <span class="lookback-thin" data-lookback-thin>
          {m.wrapped_thin_body({ count: entryCount, floor: String(WRAPPED_ENTRY_FLOOR) })}
        </span>
      {/if}
    </div>

    {#if !recapQuery.loading && !recapQuery.failed && !enoughEntries}
      <div data-lookback-new-entry transition:disclose>
        <button class="btn btn-soft btn-block" onclick={() => (ui.chooserOpen = true)}>{m.new_entry()}</button>
      </div>
    {/if}

    <!-- The readings, as tiles. Each component draws its own tile off its
         own read and stays absent where the span holds nothing for it;
         the grid draws the hairlines between whatever is there. In the
         ticket's order: the two over the scales first, then what the span
         was made of, then the two screens that were screens already, then
         the one that moved here from Safe space. -->
    <ReadingGrid label={m.stats_readings_group()} role={roleAt(activeFlag.roles, AREA_ROLE.charts)} data-lookback-readings>
      <DayByDayReading span={resolvedSpan} {today} view="tile" {enoughEntries} />
      <PlaneReading span={resolvedSpan} view="tile" />
      <DaysReading span={resolvedSpan} view="tile" {enoughEntries} />
      <WordsReading view="tile" span={resolvedSpan} href={readingHref('words', resolvedSpan)} />
      <TagsReading span={resolvedSpan} view="tile" />
      <HighestReading span={resolvedSpan} {today} view="tile" {enoughEntries} />
      <BodyMapTile span={resolvedSpan} />
      <CompareTile span={resolvedSpan} firstEntryDay={boundsQuery.value?.firstEpochDay ?? null} />
      <ThemesReading span={resolvedSpan} view="tile" />
    </ReadingGrid>

    <!-- The resurfacing block: the two look-back offers, moved here from
         Home (redesign ticket 11), each gating itself on its own preference
         and its own floor. The on-this-day tile opens in place: the day,
         its photos and the way to the whole day disclose under the pair
         (ticket 07). -->
    <TileGrid
      role={tileRoleAt(activeFlag.roles, AREA_ROLE.lookBack)}
      bar={flagBarRole(activeFlag.roles, tileRoleAt(activeFlag.roles, AREA_ROLE.lookBack))}
      data-tight
    >
      {#if prefs.wrappedEnabled}
        <WrappedHomeCard />
      {/if}
      {#if prefs.onThisDayEnabled}
        <OnThisDayHomeCard
          open={dayOpen}
          onOpen={(event) => {
            event.preventDefault();
            dayOpen = !dayOpen;
          }}
        />
      {/if}
    </TileGrid>
    {#if dayOpen && prefs.onThisDayEnabled}
      <div class="lookback-day" id="lookback-day" data-lookback-day transition:disclose>
        <OnThisDayBlock />
      </div>
    {/if}
  {/if}
</div>

<style>
  .lookback-rail {
    display: grid;
    gap: var(--space-3);
  }

  /* The way into the span's wrapped, at the secondary size. The link is
     the underlined ink a heading's action takes (kit.css,
     `.kit-heading-action`): on a page whose colour is spent as blocks, an
     accent-coloured word is a fourth voice. */
  .lookback-line {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .lookback-read {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    color: var(--text);
    font-weight: var(--weight-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
  }

  .lookback-thin {
    min-width: 0;
  }

  /* The opened day under the pair: its own stack, the screen's rhythm. */
  .lookback-day {
    display: grid;
    gap: var(--space-5);
  }

  /* The "name this stretch" offer (redesign ticket 48), drawn as rule 13's
     offer row - the icon block, the title, one reason line, and the two
     labelled answers under them. Not a `Notice`: this offer lives on the
     surface the person just drove, not in the app's generic voice. */
  .era-offer {
    padding: var(--space-2) 0;
  }

  .era-offer-said {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
  }

  /* Indented to the text column - 36 is the icon square and 12 is the
     row's gap. */
  .era-offer-answers {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding-left: calc(36px + var(--space-3));
  }

  .era-offer-yes,
  .era-offer-no {
    min-height: var(--touch-target);
    display: inline-flex;
    align-items: center;
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
  }

  .era-offer-yes {
    color: var(--text);
  }

  .era-offer-no {
    color: var(--text-2);
  }
</style>
