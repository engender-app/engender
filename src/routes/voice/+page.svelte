<script lang="ts">
  /* Voice groups benchmarking, practice, comparison and recordings on
     one route. VoiceBenchmarkFlow owns the benchmark capture. Recordings
     are entry content. The comparison uses benchmarks and their fixed
     conditions.

     The compare view shows pitch history and, for a selected pair, the
     measured changes. benchmarkDelta.ts checks passage compatibility
     and reports Hz and semitones without assigning a direction.

     A tab opens from ?tab= and updates the current address so Back from
     a linked record restores it without adding a step. Keep aria-pressed
     on the actual selection button. Each benchmark row has a separate
     delete button. */
  import { offerUndo, undoable } from '$lib/stores/deleteUndo';
  import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { onDestroy, tick } from 'svelte';
  import { EASE_OUT_CSS, isReducedMotion, motionDuration, scrollBehavior } from '$lib/motion/tokens';
  import { navigating, page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { deleter } from '$lib/stores/attempt.svelte';
  import { getLocale } from '$lib/paraglide/runtime';
  import { annotationSpan, narrowAnnotations } from '$lib/charts/annotations';
  import { highlightedPositions } from '$lib/charts/presentationHighlight';
  import { currentDay } from '$lib/stores/today.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { presentationRole } from '$lib/data/vocabulary/entryPresentation';
  import { fmtApart, fmtDay, fmtRangeEnds } from '$lib/data/dates';
  import {
    orderAnchorsByJourney,
    stepCompareAnchor,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/voice/compare-state';
  import { comfortBand, pitchAxis } from '$lib/audio/bands';
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
  import { collapse, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Three tasks. Recordings left for a Media row of their own; an old `?tab=recordings`
     link opens on Benchmark. */
  type Tab = 'record' | 'practise' | 'compare';
  const TABS: Tab[] = ['record', 'practise', 'compare'];

  /* The trend takes role 0, the picker's stripe after it - the same split
     the labs screen makes between its chart and its results.

     The own-series card shares the trend's stripe rather than
     taking one of its own: it is the same question about the same
     benchmarks, one figure at a time, and giving it role 1 would have
     recoloured the picking list under it for no reason anybody reading the
     screen could name. Its second line takes the stripe after, which is
     the list's - two lines on one plot have to be told apart, and the flag
     has no spare band on trans, which yields three. */
  const SECTION_ROLE = { trend: 0, own: 0, ownPaired: 1, list: 1 };

  /* A Svelte out-transition also runs when the page unmounts the block during
     navigation, and reveal.ts cannot see a SvelteKit navigation, so the screen
     says so - the same reading the More hub's own lists take. */
  let leaving = $derived(navigating.to !== null);

  let requested = page.url.searchParams.get('tab');
  const initialTab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'record';
  let tab = $state<Tab>(initialTab);
  let displayedTab = $state<Tab>(initialTab);
  let panel = $state<HTMLDivElement>();
  let panelMotion: Animation | undefined;
  let switching = false;
  let destroyed = false;

  onDestroy(() => {
    destroyed = true;
    panelMotion?.cancel();
  });

  /* The metric reference, as a sheet over whichever tab is open rather than a screen of its
     own.

     Kept in sync with `?metric=` rather than read once the way `tab` is: a figure's own
     link (`metricHref`) is a real navigation to this same route with a new query, which is
     what actually changes `page.url` - shallow routing would not (`replaceState` writes the
     address bar and `page.state`, never `page.url`, see the memo on that trap). Closing the
     sheet only clears the local flag and never writes the query back, the same asymmetry a
     sheet opened from a query is supposed to have: it is state the query can open but the
     back gesture and this close both just forget locally. */
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
    const scrollToSection = () => document.getElementById(key)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
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

  /* What was happening between the takes. Benchmarks are
     months apart and a regimen episode is the thing they are read against,
     so the trend's range is however long there have been benchmarks. */
  let span = $derived(annotationSpan(anchors.map((b) => b.epochDay), currentDay()));
  let annotationsQuery = liveList((j) =>
    j.chartAnnotations.getAnnotations(span.from, span.to, currentDay())
  );

  let selected = $state<string[]>([]);
  let comparing = $state(false);
  let deleteTarget = $state<string | null>(null);

  let orderedSelected = $derived(orderAnchorsByJourney(selected, anchors));
  let pair = $derived(toComparePair(selected, anchors));
  let comfort = $derived(comfortBand(prefs.voiceComfortLowHz, prefs.voiceComfortHighHz));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    return fmtApart(anchors[pair.left].epochDay, anchors[pair.right].epochDay);
  });

  /* Two benchmarks read against each other. Comparing across different
     passages has nothing to compute, and that gate lives in
     benchmarkDelta.ts itself rather than here. */
  let delta = $derived(pair ? acousticDelta(anchors[pair.left], anchors[pair.right]) : undefined);

  /* The pair as one picture. Two stacked time plots is
     what this view was, and two forty-second scribbles is not what somebody
     comparing two months of work is reading: the question is where the
     voice sat, which is one axis with both takes' shapes on it, back to
     back on the same hertz axis.

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

  /* The presentation chip (ADR-0048):
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

  /* The benchmark flow owns its unsaved take, so a switch away from its tab asks it first. */
  let benchmarkFlow = $state<ReturnType<typeof VoiceBenchmarkFlow> | undefined>();

  function changeTab(next: string) {
    if (displayedTab === 'record' && next !== 'record' && benchmarkFlow) benchmarkFlow.leave(() => showTab(next));
    else showTab(next);
  }

  async function showTab(next: string) {
    if (next === tab) return;
    tab = next as Tab;
    const target = new URL(page.url);
    target.searchParams.set('tab', tab);
    void replaceRoute(target, { noScroll: true, keepFocus: true });
    if (switching) return;
    switching = true;
    while (!destroyed && displayedTab !== tab) {
      if (panel && !isReducedMotion()) {
        panel.inert = true;
        panelMotion = panel.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: motionDuration('--dur-fast'), easing: EASE_OUT_CSS, fill: 'forwards'
        });
        await panelMotion.finished.catch(() => {});
      }
      if (destroyed) return;
      displayedTab = tab;
      await tick();
      if (destroyed) return;
      panelMotion?.cancel();
      if (panel) {
        panel.inert = false;
        if (!isReducedMotion()) {
          panelMotion = panel.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: motionDuration('--dur-med'), easing: EASE_OUT_CSS, fill: 'backwards'
          });
          await panelMotion.finished.catch(() => {});
          panelMotion.cancel();
        }
      }
    }
    switching = false;
    // A pick belongs to the compare tab, and a half-made pick left behind a
    // tab switch is a state nobody can see to undo.
    if (tab !== 'compare') {
      selected = [];
      comparing = false;
    }
  }

  const removing = deleter();
  async function confirmDeleteBenchmark() {
    const target = deleteTarget;
    if (!target) return;
    let deletion: UndoableDelete | undefined;
    if (!(await removing.run(async () => { deletion = await undoable((j) => j.voiceBenchmarks.deleteBenchmark(target)); }))) return;
    deleteTarget = null;
    offerUndo(deletion!, m.record_deleted());
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
    <ScreenHeader title={m.compare()} back={() => (comparing = false)} />
    <p class="compare-gap">{gapLabel}</p>

    <!-- Where each read sat, on one axis. The
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

    <div class="screen-part vc-delta" data-benchmark-delta>
      <h3>{m.vc_delta_title()}</h3>
      {#if delta}
        <dl class="vc-delta-figures">
          <!-- Each figure's name is the way into its own section of the
               metric reference. A sentence per figure belongs
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
    <div class="screen-part voice-tabs">
      <Segmented
        name={m.vb_screen_title()}
        options={[
          { value: 'record', label: m.vb_tab_record() },
          { value: 'practise', label: m.vb_tab_practise() },
          { value: 'compare', label: m.compare() }
        ]}
        value={tab}
        onChange={changeTab}
        compact
        key="voice-tab"
      />

      <!-- Explain Benchmark beside Recordings until the first benchmark exists.
           Memos do not answer that question, so they do not dismiss the line.

           At 390px, the four tabs occupy the 340px track. Longer recording labels
           would add at least 20px and put the last tab behind the scroll fade.
           disclose opens the space when the read settles. skip keeps the line
           from collapsing over a page exit. -->
      {#if benchmarksQuery.empty}
        <p class="muted small voice-tasks-lead" data-voice-tasks-lead transition:disclose={{ skip: leaving }}>
          {m.vb_tasks_lead()}
        </p>
      {/if}
    </div>

    <div class="voice-panel" bind:this={panel}>
    {#if displayedTab === 'record'}
      <VoiceBenchmarkFlow bind:this={benchmarkFlow} onSaved={() => showTab('compare')} />
      <!-- Saying you are done with this area,
           at the Record tab's own foot now rather than at screen level:
           the passage and the Record control open the
           tab, and "Mark this as finished"/"Pause this for now" are the
           last thing on it - a decision about the whole practice belongs
           after the thing the tab is for, not ahead of it. -->
      <AreaFinish group="voice" />
    {:else if displayedTab === 'practise'}
      <VoicePractice />
      <div class="screen-part">
        <!-- The comfort band lives on the practise tab: it is the band
             somebody is working towards while they are speaking, and this
             is the tab they are speaking on. It draws on every figure once
             it is set. -->
        <VoiceComfortBand role={roleAt(activeFlag.roles, SECTION_ROLE.list)} />
      </div>
      <!-- Sealed takes, read back. Below the
           comfort band: recording is the reason someone opened this tab,
           the comfort band is what a live figure is read against, and a
           past take's own record is what happened once already. -->
      <VoicePracticeTakes role={roleAt(activeFlag.roles, SECTION_ROLE.list)} />
    {:else}
      <ReadGate read={benchmarksQuery} variant="line" count={4}>
        {#snippet rows()}
          <PresentationChipRow value={selectedPresentation} onPick={(id) => (selectedPresentation = id)} />
          <ChartCard level={2} heading={m.vc_trend_heading()} kind="voice-benchmark-trend" role={roleAt(activeFlag.roles, SECTION_ROLE.trend)}>
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
          <!-- Own-series figures, each against the person's own earlier takes. Under the
               pitch trend, which is the one figure with a published range to read against,
               and above the picking list, because both cards answer "what has my own
               history been" while the list is where a pair gets chosen. -->
          <VoiceOwnSeries
            benchmarks={anchors}
            marked={pair ? [pair.left, pair.right] : []}
            role={roleAt(activeFlag.roles, SECTION_ROLE.own)}
            pairedRole={roleAt(activeFlag.roles, SECTION_ROLE.ownPaired)}
          />
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
              <div transition:collapse class="kit-row is-split" data-voice-cell={b.id}>
                <button
                  type="button"
                  class="kit-row-main"
                  aria-pressed={orderedSelected.includes(b.id)}
                  aria-label={m.vc_benchmark_cell_aria({
                    pitch: m.vb_hz({ value: String(Math.round(b.f0MedianHz)) }),
                    date: fmtDay(b.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })
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
          {#if pair}
            <SaveBar>
              <button class="btn btn-primary press" data-compare onclick={() => (comparing = true)}>
                <Icon name="columns" size={20} /><span>{m.compare()}</span>
              </button>
            </SaveBar>
          {/if}
        {/snippet}
        {#snippet empty()}
          <Notice
            icon="waveform"
            key="voice-benchmark-empty"
            role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
            title={m.vc_benchmarks_empty_title()}
            text={m.vc_benchmarks_empty_body()}
            action={{ label: m.record(), onclick: () => showTab('record') }}
          />
        {/snippet}
      </ReadGate>
    {/if}
    </div>
  {/if}

  <!-- The metric reference. Reference data like `/support/resources`: the table is compiled
       in, so there is nothing to wait for and nothing that can be empty - only the figure
       each section opens with reads the journal, through `anchors`, already fetched for the
       compare tab above. -->
  <Sheet
    open={metricSheetKey !== null}
    title={m.vm_title()}
    onClose={() => (metricSheetKey = null)}
  >
    <h3>{m.vm_title()}</h3>
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
    onCancel={() => { deleteTarget = null; removing.dismiss(); }}
    busy={removing.busy}
    failed={removing.failed}
  />
</div>

<style>
  /* Under the control it is answering, at the gap a screen part's own rows
     take from each other rather than a paragraph's default block margin. */
  .voice-tasks-lead {
    margin: calc(var(--space-5) + var(--space-3)) 0 0;
  }
  /* The strip keeps no margin of its own, so the whole gap above the line
     is the line's, and arrives with it: disclose opens the line's top
     margin along with its height. With the strip's own 20
     under it, the two margins would collapse and the line's 32 would only
     start to move anything once it passed 20. At rest the gap is the 32px
     it always was. */
  .voice-tabs > :global(.segmented-wrap) {
    margin-bottom: 0;
  }

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

  /* The two takes stack rather than sitting side by side. Two pitch figures in half of
     390px is 160px of plot each, and the gutter numbers alone are 40 of it.

     Its own class rather than a change to `.compare-wrap`, which is the two-up grid the
     progress-photo comparison uses: two photographs side by side is what that layout is for
     and it is not this ticket's to move (screens.css's own note on the same conflict). */
  .vc-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  /* The earlier/later row under a take. It lived in screens.css while the progress-photo
     comparison read it too; put that comparison on one draggable divider
     (PhotoWipe.svelte), which left this screen as the only consumer and
     check-screens-classes.mjs asking for the rule here. Its buttons were sized 36px until
     SH-106 and take `.icon-btn`'s own 44px since; the rule carries no size of its own. */
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
     inside the box would crowd the marks, and the two dates are the only
     thing that says which shape is the earlier read. */
  .vc-sides {
    display: flex;
    justify-content: space-between;
    margin: var(--space-2) 0 0;
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
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

  /* Voice benchmark delta. Same dt/dd-row
     shape as VoiceBenchmarkFlow.svelte's own .vb-figures, which is scoped to
     that component and out of reach here - two surfaces wanting the same
     small layout is not yet a third one worth lifting into a shared class. */
  .vc-delta h3 { margin: 0 0 var(--space-3); font-size: var(--text-md); }
  .vc-delta-figures { display: grid; gap: var(--space-3); margin: 0; }
  .vc-delta-figures > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
  .vc-delta-figures dt { color: var(--text-2); font-size: var(--text-sm); }
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
  .vc-delta-figures dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: var(--weight-medium); text-align: right; }
  .vc-aside { color: var(--text-2); font-weight: 400; }
</style>
