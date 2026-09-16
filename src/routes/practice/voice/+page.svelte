<script lang="ts">
  /* One voice screen, three tabs (phase 8 features ticket 09).

     Recording a benchmark and reading benchmarks back were two routes and
     two hub rows carrying the same icon, which is one feature described as
     two. They are one screen now: record a benchmark, practise with the
     live graph, compare benchmarks. The route stays where it was - the move
     that would have relocated it was rejected in the deepening audit - and
     the flow that used to be `/settings/voice/record` is a component
     (VoiceBenchmarkFlow.svelte) rather than a page.

     **Comparing is benchmarks only.** This screen used to compare voice
     memos as well, on a segmented control that switched which list the
     picker showed. A memo is entry content, browsed and compared the way a
     photo is, and it gets its own screen next to photos in ticket 11; a
     benchmark is a standardized take whose whole point is that its
     conditions were fixed. Until ticket 11 lands, a memo is reachable
     through the entry it belongs to and not from here.

     What the compare tab shows: a trend of every benchmark's pitch over
     time, and, once two are picked, both takes drawn and a plain
     description of what changed between them (audio/benchmarkDelta.ts owns
     that arithmetic and the same-passage gate). Neither reads a direction
     into the numbers - the delta states Hz and semitones and stops.

     The tab is local state, read once from `?tab=` so a search hit or a
     Home tile can open the screen on the half it means. Switching tabs does
     not write to history: three views of one feature are not three places a
     back gesture should walk through.

     The picking list is still written out rather than built from ListRow's
     own checkbox semantics: a row here is one of two anchors being chosen,
     so it carries `aria-pressed` and a tick rather than a chevron. It also
     owns a delete action, which is why it is hand-rolled rather than passed
     through ListRow's `action` prop - that prop moves `aria-pressed` off
     the actual pressable button and onto a wrapping div
     (appointment-prep's own note on the same conflict), which would break
     the exact contract this picker needs. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { annotationSpan, narrowAnnotations } from '$lib/charts/annotations';
  import { highlightedPositions } from '$lib/charts/presentationHighlight';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { presentationRole } from '$lib/data/vocabulary/entryPresentation';
  import { fmtDay, fmtDuration, fmtRangeEnds } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import {
    orderAnchorsByJourney,
    stepCompareAnchor,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/voice/compare-state';
  import { bandsFor, comfortBand, pitchAxis } from '$lib/audio/bands';
  import { decodePitchTrack } from '$lib/audio/track';
  import { pitchDensity } from '$lib/audio/density';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { metricHref, VOICE_METRICS, VOICE_METRICS_REVIEWED_ON, type VoiceMetricKey } from '$lib/data/voice/metrics';
  import { metricName } from '$lib/data/voice/metricLabels';
  import { voiceMetricFigure } from '$lib/data/voice/metricFigures';
  import { acousticDelta } from '$lib/audio/benchmarkDelta';
  import { paddedSeries } from '$lib/charts/geometry';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PitchBandsCaption from '$lib/components/PitchBandsCaption.svelte';
  import PresentationChipRow from '$lib/components/PresentationChipRow.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import VoiceBenchmarkFlow from '$lib/components/VoiceBenchmarkFlow.svelte';
  import VoiceComfortBand from '$lib/components/VoiceComfortBand.svelte';
  import VoiceMetricSection from '$lib/components/VoiceMetricSection.svelte';
  import VoiceOwnSeries from '$lib/components/VoiceOwnSeries.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import VoicePractice from '$lib/components/VoicePractice.svelte';
  import VoicePracticeTakes from '$lib/components/VoicePracticeTakes.svelte';
  import VoiceRecordings from '$lib/components/VoiceRecordings.svelte';
  import PitchFigure from '$lib/components/PitchFigure.svelte';
  import { hzLabel } from '$lib/components/pitchBandCopy';
  import AreaFinish from '$lib/components/AreaFinish.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  type Tab = 'record' | 'practise' | 'compare' | 'recordings';
  const TABS: Tab[] = ['record', 'practise', 'compare', 'recordings'];

  /* The trend takes role 0, the picker's stripe after it - the same split
     the labs screen makes between its chart and its results.

     The own-series card (ticket 29) shares the trend's stripe rather than
     taking one of its own: it is the same question about the same
     benchmarks, one figure at a time, and giving it role 1 would have
     recoloured the picking list under it for no reason anybody reading the
     screen could name. Its second line takes the stripe after, which is
     the list's - two lines on one plot have to be told apart, and the flag
     has no spare band on trans, which yields three. */
  const SECTION_ROLE = { trend: 0, own: 0, ownPaired: 1, list: 1 };

  let requested = page.url.searchParams.get('tab');
  let tab = $state<Tab>(TABS.includes(requested as Tab) ? (requested as Tab) : 'record');

  /* The metric reference, as a sheet over whichever tab is open rather than
     a screen of its own (phase 11 ticket 17, ADR-0060).

     Kept in sync with `?metric=` rather than read once the way `tab` is:
     a figure's own link (`metricHref`) is a real navigation to this same
     route with a new query, which is what actually changes `page.url` -
     shallow routing would not (`replaceState` writes the address bar and
     `page.state`, never `page.url`, see the memo on that trap). Closing
     the sheet only clears the local flag and never writes the query back,
     the same asymmetry a sheet opened from a query is supposed to have:
     it is state the query can open but the back gesture and this close
     both just forget locally. */
  let metricSheetKey = $state<VoiceMetricKey | null>(null);
  $effect(() => {
    const requested = page.url.searchParams.get('metric');
    if (VOICE_METRICS.some((metric) => metric.key === requested)) metricSheetKey = requested as VoiceMetricKey;
  });

  /* Scrolled to the section a figure's own link named, once the sheet has
     actually settled - a plain `scrollIntoView` rather than a new
     mechanism, the way every other landing-on-an-anchor in this app
     already works (OnThisDayBlock.svelte, media/photos/+page.svelte). Not
     on mount: the sheet's own entrance (`sheetRise`) is still animating
     its height then, and a `scrollIntoView` read against a box that has
     not reached its own resting size lands short of the mark - measured on
     a built preview, off by exactly the sheet's still-growing height.
     `introend` is Sheet.svelte's own settle signal (its `focusInitial`
     listens for the same event on the same node, for the same reason);
     not smooth, since the sheet's own motion is the one somebody is
     watching and a second, independent scroll racing it would be a second
     thing moving at once. */
  $effect(() => {
    const key = metricSheetKey;
    if (!key) return;
    const sheetEl = document.querySelector('[data-sheet]');
    const scrollToSection = () => document.getElementById(key)?.scrollIntoView({ block: 'start' });
    if (!sheetEl) {
      requestAnimationFrame(scrollToSection);
      return;
    }
    sheetEl.addEventListener('introend', scrollToSection, { once: true });
    return () => sheetEl.removeEventListener('introend', scrollToSection);
  });

  const metricsReviewedEpochDay = epochDayFromDateInputValue(VOICE_METRICS_REVIEWED_ON);
  const metricsReviewedOn =
    metricsReviewedEpochDay === null
      ? VOICE_METRICS_REVIEWED_ON
      : fmtDay(metricsReviewedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let benchmarksQuery = liveList((j) => j.voiceBenchmarks.getBenchmarks());
  let anchors = $derived(benchmarksQuery.rows);

  /* What was happening between the takes (phase 6 ticket 23). Benchmarks are
     months apart and a regimen episode is the thing they are read against,
     so the trend's range is however long there have been benchmarks. */
  let span = $derived(annotationSpan(anchors.map((b) => b.epochDay), todayEpochDay()));
  let annotationsQuery = liveList((j) =>
    j.chartAnnotations.getAnnotations(span.from, span.to, todayEpochDay())
  );

  let selected = $state<string[]>([]);
  let comparing = $state(false);
  let deleteTarget = $state<string | null>(null);

  let orderedSelected = $derived(orderAnchorsByJourney(selected, anchors));
  let pair = $derived(toComparePair(selected, anchors));
  let comfort = $derived(comfortBand(prefs.voiceComfortLowHz, prefs.voiceComfortHighHz));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(anchors[pair.left].epochDay, anchors[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  /* Two benchmarks read against each other. Comparing across different
     passages has nothing to compute, and that gate lives in
     benchmarkDelta.ts itself rather than here. */
  let delta = $derived(pair ? acousticDelta(anchors[pair.left], anchors[pair.right]) : undefined);

  /* The pair's shared caption takes its language from the left take. Safe
     because a pair is only comparable at all when both were read from the
     same passage, which is benchmarkDelta.ts's own gate - and where they
     were not, the caption still names whose figures the bands are, which is
     what ADR-0059 asks of it. The no-pair arm is never displayed (the
     caption renders inside `{#if comparing && pair}`) but is still
     evaluated, so it has to be something rather than an index into null. */
  let pairBands = $derived(bandsFor(pair ? anchors[pair.left].passageKey : '', getLocale()));

  /* The pair as one picture (redesign ticket 42). Two stacked time plots is
     what this view was, and two forty-second scribbles is not what somebody
     comparing two months of work is reading: the question is where the
     voice sat, which is one axis with both takes' shapes on it, back to
     back, inside the same cited bands.

     One axis over both takes rather than one each. Two shapes placed
     against private axes would read as comparable while putting the same
     frequency at two heights, which is the whole failure the absolute axis
     exists to prevent (audio/bands.ts). */
  let pairFigure = $derived.by(() => {
    if (!pair) return null;
    const takes = [anchors[pair.left], anchors[pair.right]].map((benchmark) => ({
      benchmark,
      trace: decodePitchTrack(benchmark.pitchTrack)
    }));
    const [earlier, later] = takes;
    if (!earlier.trace || !later.trace) return null;

    const axis = pitchAxis({
      hz: takes.flatMap((take) => [
        ...take.trace!.map((frame) => frame.hz),
        take.benchmark.f0MedianHz
      ]),
      comfort
    });
    const side = (take: (typeof takes)[number]) => {
      const density = pitchDensity(take.trace!, axis);
      return density && { density, medianHz: take.benchmark.f0MedianHz };
    };
    const sides = [side(earlier), side(later)];
    /* Both or neither: a figure with one shape on a shared spine says the
       other take had no voice in it, which is a worse claim than the
       sentence a trackless take already carries. */
    if (!sides[0] || !sides[1]) return null;
    return { axis, earlier: sides[0], later: sides[1] };
  });

  /* F0 median over every benchmark, oldest first - independent of which two
     are picked to compare. The trend and the pair compare are two different
     questions, the same way a lab's whole series and its two compared
     results are. */
  let trend = $derived(
    paddedSeries(
      anchors.map((b) => ({ x: b.epochDay, y: b.f0MedianHz })),
      5
    )
  );

  /* The presentation chip (phase 8 features ticket 17, ADR-0048):
     highlights which benchmarks were taken under the chosen mode. A
     benchmark carries no presentation of its own - only an entry does - so
     this reads whichever days in the trend's own span an entry logged it,
     exact day for day since the trend is not bucketed the way a calendar
     chart is. */
  let selectedPresentation = $state<string | null>(null);
  let presentationDaysQuery = liveList((j) =>
    selectedPresentation
      ? j.stats.presentationDays(selectedPresentation, span.from, span.to)
      : Promise.resolve([])
  );
  let highlightRole = $derived(presentationRole(selectedPresentation));
  let highlightedDays = $derived(highlightedPositions(presentationDaysQuery.rows, null, 'day'));
  let trendHighlight = $derived(
    highlightRole && trend
      ? { at: trend.points.map((p) => highlightedDays.has(p.x)), role: highlightRole }
      : undefined
  );

  function toggle(id: string) {
    selected = toggleCompareAnchor(selected, id, anchors);
  }

  function step(which: 'left' | 'right', direction: -1 | 1) {
    selected = stepCompareAnchor(selected, which, direction, anchors);
  }

  function changeTab(next: string) {
    tab = next as Tab;
    // A pick belongs to the compare tab, and a half-made pick left behind a
    // tab switch is a state nobody can see to undo.
    if (tab !== 'compare') {
      selected = [];
      comparing = false;
    }
  }

  async function confirmDeleteBenchmark() {
    if (!deleteTarget) return;
    await journal.voiceBenchmarks.deleteBenchmark(deleteTarget);
    deleteTarget = null;
  }

  /** A delta figure as the screen states it: signed, so +35 and -35 are told
      apart, and 0 carries no sign at all - the sign follows the number
      actually shown, not the raw value, so a difference too small for the
      places kept never rounds to "-0". */
  function signed(value: number, places: number): string {
    const fixed = Math.abs(value).toFixed(places);
    if (Number(fixed) === 0) return fixed;
    return value > 0 ? `+${fixed}` : `-${fixed}`;
  }
</script>

<div class="screen">
  {#if comparing && pair}
    <ScreenHeader title={m.vc_compare()} back={() => (comparing = false)} />
    <p class="compare-gap">{gapLabel}</p>

    <!-- Where each read sat, on one axis, inside the same bands. The
         earlier take reads leftward from the spine and the later one
         rightward; which is which is said in words under it, because
         nothing on this screen may read as a direction of travel
         (ADR-0012). -->
    <div class="screen-part vc-pair" data-vc-pair {...roleAttrs(roleAt(activeFlag.roles, SECTION_ROLE.trend))}>
      {#if pairFigure}
        <PitchFigure
          axis={pairFigure.axis}
          trace={[]}
          pair={{ earlier: pairFigure.earlier, later: pairFigure.later }}
          tickLabel={hzLabel}
          language={pairBands.language}
          languageGuessed={pairBands.guessed}
          captionShared
          role={roleAt(activeFlag.roles, SECTION_ROLE.trend)}
        />
        <p class="vc-sides">
          <span>{fmtDay(anchors[pair.left].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span>{fmtDay(anchors[pair.right].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </p>
      {:else}
        <!-- One of the two was recorded before the app kept pitch over
             time, so there is no shape to draw for it. The figures below
             are all either take has. -->
        <p class="muted small" data-vc-no-track>{m.vb_take_no_track()}</p>
      {/if}
    </div>

    <div class="vc-stack">
      {#each [{ i: pair.left, which: 'left' as const, canPrev: pair.left > 0, canNext: pair.left < pair.right - 1 }, { i: pair.right, which: 'right' as const, canPrev: pair.right > pair.left + 1, canNext: pair.right < anchors.length - 1 }] as side (side.which)}
        {@const benchmark = anchors[side.i]}
        <div class="vc-take">
          <VoicePlayer fileName={benchmark.passageFileName} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev}
              aria-label={m.vc_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(benchmark.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext}
              aria-label={m.vc_later()} onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
        </div>
      {/each}
    </div>

    <!-- One caption for the pair. Two of them, each in half the width, is
         the same three paragraphs twice over the two charts they are about
         (PitchBandsCaption.svelte's own note). -->
    <div class="screen-part" {...roleAttrs(roleAt(activeFlag.roles, SECTION_ROLE.trend))}>
      <PitchBandsCaption language={pairBands.language} languageGuessed={pairBands.guessed} />
    </div>

    <div class="screen-part vc-delta" data-benchmark-delta>
      <h3>{m.vc_delta_title()}</h3>
      {#if delta}
        <dl class="vc-delta-figures">
          <!-- Each figure's name is the way into its own section of the
               metric reference (ticket 27). A sentence per figure belongs
               on the take, where somebody is reading their own numbers for
               the first time; two deltas do not need teaching under them,
               they need a way to ask what the figure is. -->
          <div><dt><a href={metricHref('pitch')}>{metricName('pitch')}</a></dt>
            <dd>{m.vb_hz({ value: signed(delta.f0DeltaHz, 0) })} ({m.vb_semitones({ value: signed(delta.f0DeltaSemitones, 1) })})</dd></div>
          <div><dt><a href={metricHref('resonance')}>{metricName('resonance')}</a></dt>
            <dd>
              {#if delta.f1DeltaHz !== null && delta.f2DeltaHz !== null}
                {m.vb_hz({ value: signed(delta.f1DeltaHz, 0) })} · {m.vb_hz({ value: signed(delta.f2DeltaHz, 0) })}
              {:else if !delta.sameChain}
                <!-- Refused rather than missing (ADR-0061). Saying "not
                     measured" about two takes that were both measured, on
                     two different microphones, would be the one thing this
                     cell must not do. -->
                <span class="vc-aside">{m.vc_delta_other_mic()}</span>
              {:else}
                <span class="vc-aside">{m.vb_not_measured()}</span>
              {/if}
            </dd></div>
        </dl>
      {:else}
        <p class="muted small">{m.vc_delta_different_passage()}</p>
      {/if}
    </div>

    <div>
      <button class="btn btn-soft" onclick={() => { comparing = false; selected = []; }}>
        <span>{m.vc_back_to_all()}</span>
      </button>
    </div>
  {:else}
    <ScreenHeader title={m.vb_screen_title()} back="/more" />
    <div class="screen-part">
      <Segmented
        name={m.vb_screen_title()}
        options={[
          { value: 'record', label: m.vb_tab_record() },
          { value: 'practise', label: m.vb_tab_practise() },
          { value: 'compare', label: m.vb_tab_compare() },
          { value: 'recordings', label: m.vb_tab_recordings() }
        ]}
        value={tab}
        onChange={changeTab}
        compact
        key="voice-tab"
      />
    </div>

    {#if tab === 'record'}
      <VoiceBenchmarkFlow onSaved={() => (tab = 'compare')} />
      <!-- Saying you are done with this area (phase 8 features ticket 04),
           at the Record tab's own foot now rather than at screen level
           (phase 11 ticket 17): the passage and the Record control open the
           tab, and "Mark this as finished"/"Pause this for now" are the
           last thing on it - a decision about the whole practice belongs
           after the thing the tab is for, not ahead of it. -->
      <AreaFinish group="voice" />
    {:else if tab === 'practise'}
      <VoicePractice />
      <div class="screen-part">
        <!-- The comfort band lives on the practise tab: it is the band
             somebody is working towards while they are speaking, and this
             is the tab they are speaking on. It draws on every figure once
             it is set. -->
        <VoiceComfortBand role={roleAt(activeFlag.roles, SECTION_ROLE.list)} />
      </div>
      <!-- Sealed takes, read back (phase 8 features ticket 10). Below the
           comfort band: recording is the reason someone opened this tab,
           the comfort band is what a live figure is read against, and a
           past take's own record is what happened once already. -->
      <VoicePracticeTakes role={roleAt(activeFlag.roles, SECTION_ROLE.list)} />
    {:else if tab === 'recordings'}
      <VoiceRecordings />
    {:else}
      <ReadGate read={benchmarksQuery} variant="line" count={4}>
        {#snippet rows()}
          <div class="screen-part">
            <PresentationChipRow value={selectedPresentation} onPick={(id) => (selectedPresentation = id)} />
          </div>
          <div class="screen-part">
            <ChartCard heading={m.vc_trend_heading()} kind="voice-benchmark-trend" role={roleAt(activeFlag.roles, SECTION_ROLE.trend)}>
              {#if trend}
                {@const ends = fmtRangeEnds(trend.from, trend.to)}
                <AreaChart
                  points={trend.points}
                  min={trend.min}
                  max={trend.max}
                  from={ends.from}
                  to={ends.to}
                  formatValue={(v) => m.vb_hz({ value: String(Math.round(v)) })}
                  scrubLabel={(_point, index) => fmtDay(anchors[index].epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
                  annotations={narrowAnnotations(annotationsQuery.rows, trend.from, trend.to)}
                  highlight={trendHighlight}
                  ariaLabel={m.vc_trend_heading()}
                />
              {:else}
                <ChartEmpty>{m.vc_trend_too_little()}</ChartEmpty>
              {/if}
            </ChartCard>
          </div>
          <div class="screen-part">
            <!-- The five figures that carry no band, each against the
                 person's own earlier takes (ticket 29, ADR-0060). Under
                 the pitch trend, which is the one figure with a published
                 range to read against, and above the picking list, because
                 both cards answer "what has my own history been" while the
                 list is where a pair gets chosen. -->
            <VoiceOwnSeries
              benchmarks={anchors}
              marked={pair ? [pair.left, pair.right] : []}
              role={roleAt(activeFlag.roles, SECTION_ROLE.own)}
              pairedRole={roleAt(activeFlag.roles, SECTION_ROLE.ownPaired)}
            />
          </div>
          <div class="screen-part">
            {#if comparing && !pair}
              <p class="muted small" style="margin-bottom:var(--space-2)">{m.vc_compare_reset()}</p>
            {/if}
            <p class="muted small" style="margin-bottom:var(--space-4)">
              {orderedSelected.length === 0
                ? m.vc_benchmarks_pick_two()
                : orderedSelected.length === 1
                  ? m.vc_one_selected()
                  : m.vc_two_selected()}
            </p>
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.list)}>
              {#each anchors as b (b.id)}
                <div class="kit-row is-split" data-voice-cell={b.id}>
                  <button
                    type="button"
                    class="kit-row-main"
                    aria-pressed={orderedSelected.includes(b.id)}
                    aria-label={m.vc_benchmark_cell_aria({
                      date: fmtDay(b.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                    })}
                    onclick={() => toggle(b.id)}
                  >
                    <!-- The take's own pitch, as the block rule 3 allows
                         behind a value: choosing two benchmarks was a date,
                         a mic glyph and a tick, which is blind. With the
                         figure on every row the list is itself a coarse
                         reading of the series, and the glyph - the same one
                         on every row of a list of benchmarks - was saying
                         nothing the screen had not already said.

                         19px bold, which is large text, because rule 11
                         holds small text on a stripe to 4.5:1 and this list
                         takes whichever role the areas hand it. -->
                    <span class="vc-row-pitch" data-voice-row-pitch>{m.vb_hz({ value: String(Math.round(b.f0MedianHz)) })}</span>
                    <span class="kit-row-text">
                      <span class="kit-row-title">{fmtDay(b.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </span>
                    <span class="kit-row-trail">
                      {#if orderedSelected.includes(b.id)}<Icon name="check" size={20} />{/if}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="kit-row-act press"
                    data-delete-benchmark={b.id}
                    aria-label={m.vc_benchmark_delete_aria({ date: fmtDay(b.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                    onclick={() => (deleteTarget = b.id)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              {/each}
            </ListCard>
          </div>
          {#if pair}
            <SaveBar>
              <button class="btn btn-primary press" data-compare onclick={() => (comparing = true)}>
                <Icon name="columns" size={20} /><span>{m.vc_compare()}</span>
              </button>
            </SaveBar>
          {/if}
        {/snippet}
        {#snippet empty()}
          <div class="screen-part">
            <Notice
              icon="mic"
              key="voice-benchmark-empty"
              role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
              title={m.vc_benchmarks_empty_title()}
              text={m.vc_benchmarks_empty_body()}
              action={{ label: m.vb_record(), onclick: () => (tab = 'record') }}
            />
          </div>
        {/snippet}
      </ReadGate>
    {/if}
  {/if}

  <!-- The metric reference (phase 8 features ticket 27, ADR-0060; a sheet
       rather than its own screen since ticket 17). Reference data like
       `/practice/resources`: the table is compiled in, so there is nothing
       to wait for and nothing that can be empty - only the figure each
       section opens with reads the journal, through `anchors`, already
       fetched for the compare tab above. -->
  <Sheet
    open={metricSheetKey !== null}
    title={m.vm_title()}
    onClose={() => (metricSheetKey = null)}
  >
    <h3>{m.vm_title()}</h3>
    <p class="muted small">{m.vm_intro()}</p>
    <p class="muted small" data-metrics-distance>{m.vm_distance()}</p>
    {#each VOICE_METRICS as metric, i (metric.key)}
      <section id={metric.key} class="vm-metric" {...roleAttrs(roleAt(activeFlag.roles, i))}>
        <SectionHeading text={metricName(metric.key)} />
        <VoiceMetricSection {metric} figure={voiceMetricFigure(anchors, metric.key, getLocale())} />
      </section>
    {/each}
    <p class="muted small" data-metrics-reviewed>{m.roadmap_reviewed_on({ date: metricsReviewedOn })}</p>
  </Sheet>

  <ConfirmDeleteSheet
    open={deleteTarget !== null}
    title={m.vc_benchmark_delete_sheet()}
    question={m.vc_benchmark_delete_q()}
    hint={m.vc_benchmark_delete_hint()}
    confirmLabel={m.vc_benchmark_delete_sheet()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-benchmark': '' }}
    onConfirm={confirmDeleteBenchmark}
    onCancel={() => (deleteTarget = null)}
  />
</div>

<style>
  /* The section owns the gap between its heading and its panel; the sheet
     owns the gap between sections (`.sheet`'s own, kit.css). */
  .vm-metric {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    /* So landing on `#spread` puts the heading below the sheet's own
       handle rather than under it. */
    scroll-margin-top: var(--space-5);
  }

  /* The two takes stack rather than sitting side by side (Alicja,
     2026-09-04: "in the compare module, it shouldn't be side-by-side - not
     enough space for that"). Two pitch figures in half of 390px is 160px
     of plot each, and the gutter numbers alone are 40 of it.

     Its own class rather than a change to `.compare-wrap`, which is the
     two-up grid the progress-photo comparison uses: two photographs side by
     side is what that layout is for and it is not this ticket's to move
     (screens.css's own note on the same conflict). */
  .vc-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  /* The earlier/later row under a take. It lived in screens.css while the
     progress-photo comparison read it too; redesign ticket 55 put that
     comparison on one draggable divider (PhotoWipe.svelte), which left this
     screen as the only consumer and check-screens-classes.mjs asking for
     the rule here. Its buttons were sized 36px until SH-106 and take
     `.icon-btn`'s own 44px since; the rule carries no size of its own. */
  .compare-nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .vc-take {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* The pitch on a picking row. A block of the section's stripe with its
     own ink, 6px corners and the edge drawn inside, which is rule 3's block
     behind a value; the row keeps its 48px because the block is 36 of it. */
  .vc-row-pitch {
    display: inline-flex;
    align-items: center;
    flex: none;
    height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--role-draw);
    color: var(--role-fill-ink);
    font-size: 19px;
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Which side is which, under the figure rather than on it: a label
     inside the box would sit on the bands, and the two dates are the only
     thing that says which shape is the earlier read. */
  .vc-sides {
    display: flex;
    justify-content: space-between;
    margin: var(--space-2) 0 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
  }

  /* VoicePlayer's own `flex: 1` is sized for .recording-row, a row-direction
     flex parent, where flex-basis 0% grows its width. This is
     column-direction, so the same flex-basis lands on height instead and
     collapses the player to 0px tall - which is exactly what happened when
     these rows stopped being `.compare-side`, where screens.css had carried
     this rule for the photo comparison. It was in the render as a missing
     player, not in any test. */
  .vc-take :global(.voice-player) {
    flex: none;
    width: 100%;
  }

  /* Voice benchmark delta (phase 5 deepening ticket 16). Same dt/dd-row
     shape as VoiceBenchmarkFlow.svelte's own .vb-figures, which is scoped to
     that component and out of reach here - two surfaces wanting the same
     small layout is not yet a third one worth lifting into a shared class. */
  .vc-delta h3 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
  .vc-delta-figures { display: grid; gap: var(--space-3); margin: 0; }
  .vc-delta-figures > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
  .vc-delta-figures dt { color: var(--muted); font-size: var(--text-sm); }
  /* The name is the link, so it keeps the label's own colour and says it
     is pressable with an underline in the section's stripe rather than by
     turning blue. Same treatment as the sentences on a take
     (VoiceFigures.svelte). */
  /* The name is the link into that figure's own reference section. Padded
     out to the app's 48dp touch floor and given straight back as negative
     margin, because a one-line label is about 20px of text. Underlined in
     --role-mark, the contrast-corrected stripe: kit.css:57 says the raw
     --role-c is for the fallback ink and nothing else, and at 1px it
     disappears on half the palettes. */
  .vc-delta-figures dt a {
    display: inline-block;
    padding-block: 15px;
    margin-block: -15px;
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, var(--role-mark) 65%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .vc-delta-figures dt a:hover { color: var(--role-ink); text-decoration-color: var(--role-mark); }
  .vc-delta-figures dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: var(--weight-semibold); text-align: right; }
  .vc-aside { color: var(--muted); font-weight: 400; }
</style>
