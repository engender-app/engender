<script lang="ts">
  /* One span drives Look back. SpanTimeline bounds it from the earliest
     authored day to today, then the same dates feed the facts, the reading
     tiles and their full screens under /stats/<reading>.

     A reading tile shares its component's calculation with the full card.
     Readings with no data in the span leave the grid and the remaining tiles
     reflow. What it cost appears last when the span holds a cost. The mood
     strip renders in full above the grid.

     Below the readings, On this day opens inline. The Wrapped tile is the
     route into Wrapped and is omitted when that feature is off. */
  import { m } from '$lib/paraglide/messages';
  import { currentDay } from '$lib/stores/today.svelte';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { surfaceOn } from '$lib/unprompted/registry';
  import {
    defaultSpan,
    eraBands,
    eraOfferDue,
    getLastLookBackSpan,
    historyBands,
    historyStart,
    railFacts,
    setLastLookBackSpan,
    surgeryMarks,
    type Span
  } from '$lib/data/lookBackSpan';
  import { spanLabel } from '$lib/data/spanLabel';
  import { recapDimChange } from '$lib/data/recapDisplay';
  import type { RecapDimChange } from '$lib/data/recapDisplay';
  import { nativeValue, signedValue } from '$lib/data/wrappedDisplay';
  import { metricStandings } from '$lib/data/statsCharts';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { flagBarRole, roleAt, tileRoleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SpanFacts from '$lib/components/SpanFacts.svelte';
  import SpanTimeline from '$lib/components/SpanTimeline.svelte';
  import WrappedHomeCard from '$lib/components/WrappedHomeCard.svelte';
  import OnThisDayHomeCard from '$lib/components/OnThisDayHomeCard.svelte';
  import OnThisDayBlock from '$lib/components/OnThisDayBlock.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ReadingGrid from '$lib/components/kit/ReadingGrid.svelte';
  import ReadGroup from '$lib/components/kit/ReadGroup.svelte';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import DayByDayReading from '$lib/components/readings/DayByDayReading.svelte';
  import PlaneReading from '$lib/components/readings/PlaneReading.svelte';
  import DaysReading from '$lib/components/readings/DaysReading.svelte';
  import TagsReading from '$lib/components/readings/TagsReading.svelte';
  import BodyMapTile from '$lib/components/readings/BodyMapTile.svelte';
  import CompareTile from '$lib/components/readings/CompareTile.svelte';
  import CostReading from '$lib/components/readings/CostReading.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { collapse, crossfade, disclose, resize } from '$lib/motion/reveal';
  import { bezier, EASE_OUT_SOFT_POINTS } from '$lib/motion/blindSettle';
  import { EASE_OUT_CSS, EASE_OUT_SOFT_CSS, NIL_OPACITY, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped';
  import { averageLabel, metricChoices, shownMetric } from '$lib/data/metricChoices';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { playAfterPaint, readRevealDuration } from '$lib/motion/screenArrival';
  import { holdForArrival } from '$lib/motion/arrivalHold.svelte';
  import { useDoorActivity } from '$lib/navigation/doorActivity.svelte';

  const isDoorActive = useDoorActivity();

  /* Assign role 0 to charts because it is chromatic on every palette.
     Facts and resurfacing can use an achromatic role. Keep Look back's
     role stable independently of Care's interval folds. */
  const AREA_ROLE = { charts: 0, lookBack: 2 };

  /* Read on recompute rather than captured, so a session open across
     midnight moves on. */
  let today = $derived(currentDay());

  /* The rail: where the person's history starts, from
     the three things the journal already dates - its own entry bounds, the
     milestones (mirrored, ADR-0004, so no query), and the eras. */
  let erasQuery = liveList((j) => j.eras.getEras());
  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());
  let railLoading = $derived(erasQuery.loading || boundsQuery.loading);
  /* A rail answering with less than its fade's length of an Android tab
     arrival left keeps its skeleton until the field stops, then fades in
     at full length (screenArrival.ts). Before anything has painted there
     is no skeleton to hold. */
  let railPainted = false;
  $effect(() => {
    requestAnimationFrame(() => setTimeout(() => (railPainted = true)));
  });
  const railReleased = holdForArrival(() => !railLoading, () => railPainted);
  let railRevealed = $state(false);
  $effect.pre(() => {
    if (railReleased()) railRevealed = true;
  });
  let railStart = $derived(
    railLoading
      ? null
      : historyStart(
          {
            bounds: boundsQuery.value ?? null,
            milestones: vocabulary.milestones,
            eras: erasQuery.rows
          },
          today
        )
  );

  /* The rest of the rail's history: regimen episodes and
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
  /* The same facts as a list, for the finger the 8px bands are not for. One read behind
     both: the list is built from what the rail is already drawing, so a fact cannot be on
     one and missing from the other. */
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
     as the finger has it. Restored on Back navigation. */
  let span = $state<Span | null>(getLastLookBackSpan());
  let live = $state<Span | null>(getLastLookBackSpan());

  $effect(() => {
    if (!isDoorActive()) return;
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
  /* Picking an existing era counts as handled too: a stretch already named is not the "just
     dragged this out" moment the offer is for. Exact-match only, resolved with `eraBands`,
     the same clamp SpanTimeline draws the bands with. */
  let existingEraSpans = $derived(
    railStart === null ? [] : eraBands(erasQuery.rows, railStart, today).map((band) => ({ start: band.start, end: band.end }))
  );
  let readingsReplaced = $state(false);
  const readingFade = (_node: Element) => fadeOnly(isReducedMotion() ? 0 : motionDuration('--dur-fast'));
  const readingArrival = (node: Element) => ({
    ...readingFade(node),
    delay: readingsReplaced && !isReducedMotion() ? motionDuration('--dur-fast') : 0
  });
  let captureReadingSpace = () => {};
  const settleReadingSpace = (node: HTMLElement, active: boolean) => {
    if (isReducedMotion()) return;
    let previousTop = active ? node.getBoundingClientRect().top : 0;
    const restTransform = node.style.transform;
    const restClip = node.style.clipPath;
    let painted = false;
    let current: Animation | undefined;
    let clippingFrame = 0;
    let paintFrame = 0;
    let paintTimer: ReturnType<typeof setTimeout> | undefined;
    const stopMotion = () => {
      current?.cancel();
      current = undefined;
      cancelAnimationFrame(clippingFrame);
      node.style.transform = restTransform;
      node.style.clipPath = restClip;
    };
    const rebase = () => {
      painted = false;
      cancelAnimationFrame(paintFrame);
      clearTimeout(paintTimer);
      if (!active) return;
      paintFrame = requestAnimationFrame(() => {
        paintTimer = setTimeout(() => {
          if (!active) return;
          previousTop = node.getBoundingClientRect().top;
          painted = true;
        });
      });
    };
    const clipReadingSpace = () => {
      if (!active) return;
      const readingSpace = node.previousElementSibling!;
      let boundary = readingSpace.getBoundingClientRect().top;
      for (const slot of readingSpace.querySelectorAll('.lookback-reading-slot')) {
        const box = slot.getBoundingClientRect();
        boundary = Math.max(boundary, box.top + box.height * Number(getComputedStyle(slot).opacity));
      }
      const top = Math.min(node.getBoundingClientRect().height, Math.max(0, boundary - node.getBoundingClientRect().top));
      node.style.clipPath = `inset(${top}px 0 0)`;
    };
    captureReadingSpace = () => {
      if (!active) return;
      const translation = current ? new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 : 0;
      previousTop = node.getBoundingClientRect().top - translation;
    };
    rebase();
    /* Where the block's top was painted when the running travel set off. */
    let travelFrom = 0;
    const observer = new ResizeObserver(() => {
      if (!active || !painted) return;
      /* The offer opening above and the readings swapping push the block again on nearly
         every frame of its travel. Restarting the travel each time put it back at the slow
         start of --ease-out-soft, so the tiles stepped 22px on the first frame and then
         stood still for four (span-offer-appear). The running travel keeps its clock and
         its painted start; only its ends are measured again against where the block now
         lies. */
      if (current?.playState === 'running' && current.effect instanceof KeyframeEffect) {
        const top = node.getBoundingClientRect().top - new DOMMatrixReadOnly(getComputedStyle(node).transform).m42;
        if (Math.abs(top - previousTop) < 1) return;
        previousTop = top;
        node.style.transform = `translateY(${travelFrom - top}px)`;
        current.effect.setKeyframes([
          { transform: `translateY(${travelFrom - top}px)` },
          { transform: `translateY(${Math.min(top, innerHeight) - top}px)` }
        ]);
        return;
      }
      const translation = current ? new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 : 0;
      const from = previousTop + translation;
      stopMotion();
      const top = node.getBoundingClientRect().top;
      previousTop = top;
      if (from >= innerHeight || Math.abs(top - from) < 1) return;
      // Travel ends at the viewport edge; the remaining layout is offscreen.
      node.style.transform = `translateY(${from - top}px)`;
      travelFrom = from;
      const animation = node.animate([
        { transform: `translateY(${from - top}px)` },
        { transform: `translateY(${Math.min(top, innerHeight) - top}px)` }
      ], { duration: motionDuration('--dur-med'), easing: EASE_OUT_SOFT_CSS, fill: 'both' });
      current = animation;
      clipReadingSpace();
      const clipFrame = () => {
        if (!active || current !== animation) return;
        clipReadingSpace();
        clippingFrame = requestAnimationFrame(clipFrame);
      };
      clippingFrame = requestAnimationFrame(clipFrame);
      animation.finished.then(() => {
        if (!active || current !== animation) return;
        cancelAnimationFrame(clippingFrame);
        node.style.transform = restTransform;
        node.style.clipPath = restClip;
        animation.cancel();
        current = undefined;
        previousTop = node.getBoundingClientRect().top;
      }).catch(() => {});
    });
    observer.observe(node.parentElement!);
    for (const sibling of node.parentElement!.children) {
      if (sibling !== node) observer.observe(sibling);
    }
    return {
      update(next: boolean) {
        if (active === next) return;
        active = next;
        stopMotion();
        rebase();
      },
      destroy() {
        captureReadingSpace = () => {};
        observer.disconnect();
        cancelAnimationFrame(paintFrame);
        clearTimeout(paintTimer);
        stopMotion();
      }
    };
  };
  /* A hidden door still takes a span committed as it left (the rail's key
     move that was waiting for its beat); only what the change shows waits
     for the next visit. */
  const pickSpan = (next: Span) => {
    const shown = isDoorActive();
    if (shown) {
      captureReadingSpace();
      readingsReplaced = true;
      if (enoughEntries) factsExited = false;
    }
    span = next;
    live = next;
    setLastLookBackSpan(next);
    if (!shown) return;
    const isExistingEra = existingEraSpans.some((era) => era.start === next.start && era.end === next.end);
    const nextOffer = !isExistingEra && eraOfferDue(next, handledEraOfferSpans) ? next : null;
    if (!nextOffer || eraOfferSpan?.start !== nextOffer.start || eraOfferSpan.end !== nextOffer.end) offerOpened = false;
    eraOfferSpan = nextOffer;
  };

  /* The "name this stretch" offer: once a span the
     person dragged settles, one offer to turn it into an era, on this
     surface and nowhere else. Plain component state, gone on reload. */
  let eraOfferSpan = $state<Span | null>(null);
  let factsExited = $state(true);
  let offerOpened = $state(false);
  let handledEraOfferSpans = $state<Span[]>([]);
  const settleEraOffer = (handled: Span) => {
    handledEraOfferSpans = [...handledEraOfferSpans, handled];
    eraOfferSpan = null;
  };

  /* The offer moves several rows below it. The softer existing curve keeps
     its first frame from moving those rows 43px at once. */
  const discloseOffer = (node: Element) => ({ ...disclose(node, { skip: !isDoorActive() }), easing: bezier(EASE_OUT_SOFT_POINTS) });

  /* Facts and offer move together. For a thin span, wait for old facts to
     leave; for a full span, facts stay. Words wait for the room in both. */
  const markOfferOpened = (node: HTMLElement, selected: Span) => {
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const opened = () => {
      if (!isDoorActive() || eraOfferSpan !== selected || offerOpened) return;
      offerOpened = true;
      if (fallback) clearTimeout(fallback);
    };
    node.addEventListener('introend', opened, { once: true });
    /* An interrupted intro may skip introend. Reduced motion needs no wait. */
    if (isReducedMotion()) opened();
    else fallback = setTimeout(opened, motionDuration('--dur-med') + 50);
    return {
      destroy() {
        node.removeEventListener('introend', opened);
        if (fallback) clearTimeout(fallback);
      }
    };
  };

  /* Two epoch days to the journal, which never reads the clock for a
     domain answer: the span's own, and before the effect above has set it,
     the default span that effect is about to set. Inclusive of both ends. */
  let from = $derived(span?.start ?? defaultSpan(railStart ?? today, today).start);
  let to = $derived(span?.end ?? today);
  let resolvedSpan = $derived<Span>({ start: from, end: to });
  let liveLabel = $derived(live ? spanLabel(live, today) : '');

  let shown = $derived(shownMetric(metricChoices()));

  /* Read the recap and selected scale's average together (ADR-0010). Share
     entryCount with panels that use WRAPPED_ENTRY_FLOOR. One result updates
     the floor, average and scale arc together so the card closes once. */
  let factsQuery = liveQuery(async (j) => {
    const readSpan = { start: from, end: to };
    /* No span yet and the rail still loading: the span is not known, so
       wait for it rather than read a stand-in. The stand-in was a one-day
       read whose answer the real span replaced a hop later, and on a warm
       switch from Today its seven queries sat at the front of the worker's
       queue ahead of every tile's own reads. Re-runs when the rail answers. */
    if (span === null && railLoading) return new Promise<never>(() => {});
    const [recap, series] = await Promise.all([j.stats.recap(from, to), j.stats.dayAverages(shown.key, from, to)]);
    return { recap, series, readSpan };
  });
  let factsCurrent = $derived(
    factsQuery.value?.readSpan.start === from && factsQuery.value?.readSpan.end === to
  );

  /* Both this door's late reads share one "answered" condition (the ReadGroup below already
     gated on it): `vocabulary.ready` closes the gap named here - `shown` reads the
     vocabulary mirror for the active scale, and a cold boot can settle `factsQuery` before
     that mirror fills, so the average and scale-arc rows would arrive a beat after the
     entries row with nothing gating that second pop. */
  let factsAnswered = $derived(!factsQuery.loading && vocabulary.ready);

  /* Held at last visit's height until the read answers, then faded in:
     a cold load drew the facts at full opacity the
     frame the read resolved, and nothing reserved their room, so the quick
     picks below shoved down 94-184px in that one frame. Latched: a reserve
     must not put its placeholder back once the read has answered once. */
  let factsRevealed = $state(false);
  $effect.pre(() => {
    if (factsAnswered) factsRevealed = true;
  });
  const factsEstimate = readReserve('lookback-facts');
  const factsRemember = (px: number) => rememberReserve('lookback-facts', px);
  let entryCount = $derived(factsQuery.value?.recap.entryCount ?? 0);
  let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);
  let offerContentReady = $derived(offerOpened && (enoughEntries || factsExited));
  let dimChange = $derived(factsQuery.value ? recapDimChange(factsQuery.value.recap) : null);
  let activeAverage = $derived.by(() => {
    const standing = metricStandings([{ key: shown.key, range: { min: shown.min, max: shown.max } }], () => factsQuery.value?.series ?? [])[0];
    return standing && standing.value !== null ? nativeValue(shown.key, standing.value) : '';
  });

  /* The two optional rows freeze their content the instant the card itself decides to
     leave. The fold above (factsQuery) synced `activeAverage` and `dimChange` against each
     other, but the same reactive flush that drops `entryCount` under the floor also nulls
     both of them - so their own `{#if}`s saw that same flip and started their own
     `transition:collapse` at the same instant as the card's, one collapse nested inside the
     other, which read as the rows sliding into each other rather than the card closing as a
     block. `closingFacts` only updates while the card is staying open, so once
     `enoughEntries` goes false the rows keep showing whatever they last held and never see
     their own condition flip - the card's own collapse is what plays. While the card holds,
     a row's data genuinely emptying still updates here immediately, so that row's own
     collapse still runs as before. */
  let closingFacts = $state<{ activeAverage: string; dimChange: RecapDimChange | null }>({
    activeAverage: '',
    dimChange: null
  });
  /* `.pre`, so the card's first mount sees `closingFacts` already carrying the two optional
     rows rather than adding them a tick later: a plain `$effect` runs after the DOM commit
     that flips `enoughEntries`, so the Entries row painted alone and the average and
     scale-arc rows arrived in a second, ungated pop once this effect caught up. The guard
     is what protects the closing case (above), not which queue the effect runs in - a
     change here still sees the same `enoughEntries` this flush, before or after paint. */
  $effect.pre(() => {
    if (enoughEntries) closingFacts = { activeAverage, dimChange };
  });

  /* The on-this-day tile opens in place: the route it used to open was 844px holding one
     card and 500px of nothing. The block discloses under the pair; the tile's own href
     still points at the route, which a notification deep-links to. */
  let dayOpen = $state(false);
  $effect.pre(() => {
    if (isDoorActive()) return;
    dayOpen = false;
    eraOfferSpan = null;
    offerOpened = false;
    handledEraOfferSpans = [];
    factsExited = true;
    readingsReplaced = false;
    live = span;
  });

  /* What replaces the rail's skeleton fades in over it, the
     way ReadGate's answer does: the skeleton's `out:crossfade`
     only handles the leaving half, and on a journal with nothing dated the
     empty notice was drawn at full opacity in the frame the skeleton began
     to go - on the phone, in 16 of 16 cold loads. The branch is a run of
     separately spaced siblings of `.screen`, so no one `in:` can carry it;
     each child that was not there while the rail loaded is faded here, on
     the frame it first paints. */
  let screen = $state<HTMLElement>();
  let whileLoading = new Set<Element>();
  /* Still loading until the span exists too: the branch with the rail in it
     waits on `span`, which the effect above sets a tick after the rail
     answers. */
  let railPending = $derived(!railRevealed || (railStart !== null && span === null));
  $effect(() => {
    if (!isDoorActive() || !screen) return;
    if (railPending) {
      whileLoading = new Set(screen.children);
      return;
    }
    if (whileLoading.size === 0) return;
    /* Inside a tab's arrival the fade shares the field's deadline, as
       ReadGate's and ReadReserve's do, never shorter than --dur-fast: an
       answer with less than that left was held above until the field
       stopped. */
    const duration = readRevealDuration('--dur-fast');
    if (duration > 0) {
      const animations: Animation[] = [];
      for (const child of screen.children) {
        if (!whileLoading.has(child)) animations.push(child.animate([{ opacity: NIL_OPACITY }, { opacity: 1 }], { duration, easing: EASE_OUT_CSS }));
      }
      playAfterPaint(screen, animations, { fitArrival: true });
    }
    whileLoading = new Set();
  });
</script>

<div class="screen" bind:this={screen}>
  <!-- The door's title at 48 on the field, and nothing under it: the span
       is written under the rail, against the handles that move it.
       -->
  <ScreenHeader title={m.nav_lookback()} screen="stats" />

  <!-- The history, and the span pointed at on it.
       Entry data behind the rail's start, so it waits; a journal with
       nothing dated yet says so instead of drawing a rail from today to
       today. -->
  {#if !railRevealed}
    <div out:crossfade data-lookback-rail-wait><Skeleton variant="block" count={1} /></div>
  {:else if railStart === null}
    <Notice icon="stats" key="lookback-empty" title={m.lookback_empty_title()} text={m.lookback_empty_body()}
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

    <!-- The rail's own facts as a list, folded, directly under the rail: the way to an era,
         an episode, a tryout or a milestone that does not depend on hitting an 8px band,
         with every fact's exact dates written out. It sets the same span the band on the
         rail sets, so the two never disagree. -->
    {#if facts.length && isDoorActive()}
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
    <ReadReserve ready={factsRevealed} estimate={factsEstimate} onrest={factsRemember}>
      {#if enoughEntries}
        <div class="screen-part">
        <div data-lookback-facts transition:collapse onoutrostart={() => (factsExited = false)} onoutroend={() => (factsExited = true)}>
          <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}>
            <ListRow static data-lookback-fact title={m.wrapped_stat_entries()}>
              {#snippet trailing()}<b class="wrapped-figure-value">{entryCount}</b>{/snippet}
            </ListRow>
            {#if closingFacts.activeAverage}
              <div class="rows-divide" transition:collapse>
                <ListRow static fadeSwap data-lookback-fact title={averageLabel(shown)}>
                  {#snippet trailing()}<b class="wrapped-figure-value">{closingFacts.activeAverage}</b>{/snippet}
                </ListRow>
              </div>
            {/if}
            {#if closingFacts.dimChange}
              {@const dimChange = closingFacts.dimChange}
              <div class="rows-divide" transition:collapse>
                <ListRow
                  static
                  fadeSwap
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
        </div>
      {/if}
    </ReadReserve>

    <!-- "Name this stretch": a person who has just
         dragged out a span is offered the chance to name it, here and
         nowhere else. `disclose` opens and gives back its own height. -->
    {#if eraOfferSpan && factsCurrent}
      {@const offerSpan = eraOfferSpan}
      {#key `${offerSpan.start}:${offerSpan.end}`}
      <div class="era-offer" class:is-ready={offerContentReady} data-era-offer role="group" aria-labelledby="era-offer-title" inert={!offerContentReady} transition:discloseOffer|global use:markOfferOpened={offerSpan}>
        <div class="era-offer-said">
          <span class="kit-row-ico"><Icon name="era" size={22} /></span>
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
            {m.not_now()}
          </button>
        </div>
      </div>
      {/key}
    {/if}

    {#if !factsQuery.loading && !factsQuery.failed && !enoughEntries}
      <div transition:disclose>
        <button class="btn btn-soft btn-block" onclick={() => (ui.chooserOpen = true)}>{m.new_entry()}</button>
      </div>
    {/if}

    <!-- Each tile draws only when its span has data. Wait for recap
         and vocabulary so eligible tiles arrive together and never
         jump to make room for a late read. Put the mood strip above
         the grid because leaving tiles exit flow on span changes,
         which would lift a following strip through the fade. -->
    <!-- A new span replaces the reading group in its own space. Reusing
         its cells let the old tiles travel across the
         new figures while their independent reads answered. The old group
         fades before the new one appears in the same grid slot. The following
         block keeps its painted position with a transform while the reads
         answer, without animating the reading grid's height. -->
    <div class="screen-part">
    <div class="lookback-reading-swap">
    {#key `${resolvedSpan.start}:${resolvedSpan.end}`}
    <div class="lookback-reading-slot" in:readingArrival out:readingFade onoutrostart={(event) => ((event.currentTarget as HTMLElement).inert = true)}>
    <ReadGroup answered={factsAnswered && factsCurrent} count={2}>
    <DaysReading span={resolvedSpan} {enoughEntries} />
    <ReadingGrid label={m.stats_readings_group()} role={roleAt(activeFlag.roles, AREA_ROLE.charts)} data-lookback-readings>
      <DayByDayReading span={resolvedSpan} {today} view="tile" {enoughEntries} />
      <PlaneReading span={resolvedSpan} view="tile" />
      <TagsReading span={resolvedSpan} view="tile" />
      <BodyMapTile span={resolvedSpan} />
      <CompareTile span={resolvedSpan} firstEntryDay={boundsQuery.value?.firstEpochDay ?? null} />
      <CostReading span={resolvedSpan} view="tile" />
    </ReadingGrid>
    </ReadGroup>
    </div>
    {/key}
    </div>
    </div>

    <!-- The resurfacing block: the two look-back offers, moved here from
         Home, each gating itself on its own preference
         and its own floor. The on-this-day tile opens in place: the day,
         its photos and the way to the whole day disclose under the pair.
         One group for the same reason as the readings above:
         on its own, whichever card answered first stood full width for a
         frame before the other halved it. No fade: each tile's own clip
         from the left, on the grid's stagger, is the arrival. -->
    <div class="screen-part" use:resize use:settleReadingSpace={isDoorActive()}>
    <ReadGroup fade={false}>
    <TileGrid
      role={tileRoleAt(activeFlag.roles, AREA_ROLE.lookBack)}
      bar={flagBarRole(activeFlag.roles, tileRoleAt(activeFlag.roles, AREA_ROLE.lookBack))}
      data-tight
    >
      {#if surfaceOn(prefs.surfaceOverrides, 'wrapped')}
        <WrappedHomeCard />
      {/if}
      {#if surfaceOn(prefs.surfaceOverrides, 'on-this-day')}
        <OnThisDayHomeCard
          open={dayOpen}
          onOpen={(event) => {
            event.preventDefault();
            dayOpen = !dayOpen;
          }}
        />
      {/if}
    </TileGrid>
    </ReadGroup>
    </div>
    {#if dayOpen && surfaceOn(prefs.surfaceOverrides, 'on-this-day')}
      <div class="lookback-day" id="lookback-day" data-lookback-day transition:disclose={{ skip: !isDoorActive() }}>
        <OnThisDayBlock />
      </div>
    {/if}
  {/if}
</div>

<style>
  .lookback-reading-swap {
    display: grid;
  }

  .lookback-reading-slot {
    grid-area: 1 / 1;
    align-self: start;
    min-width: 0;
    contain: layout;
  }

  .lookback-rail {
    display: grid;
    gap: var(--space-3);
  }

  /* The opened day under the pair: its own stack, the screen's rhythm. */
  .lookback-day {
    display: grid;
    gap: var(--space-5);
  }

  /* The day's blocks now arrive through OnThisDayBlock's reserve, one wrapper down, spaced by the reserve's own 20 rather
     than this grid's gap. A grid item holds its content's last margin in,
     so the last block gives its 20 up here or the day ends 20px taller. */
  .lookback-day :global(.read-reserve-body > :last-child) {
    margin-bottom: 0;
  }

  /* The "name this stretch" offer, drawn as rule 13's
     offer row - the icon block, the title, one reason line, and the two
     labelled answers under them. Not a `Notice`: this offer lives on the
     surface the person just drove, not in the app's generic voice. */
  .era-offer {
    padding: var(--space-2) 0;
  }

  .era-offer > * {
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }

  .era-offer.is-ready > * {
    opacity: 1;
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
