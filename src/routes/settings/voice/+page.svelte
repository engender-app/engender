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
  import { bandLanguageIsGuessed, bandLanguageOf, comfortBand } from '$lib/audio/bands';
  import { acousticDelta } from '$lib/audio/benchmarkDelta';
  import { paddedSeries } from '$lib/charts/geometry';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PitchBandsCaption from '$lib/components/PitchBandsCaption.svelte';
  import PresentationChipRow from '$lib/components/PresentationChipRow.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import VoiceBenchmarkFlow from '$lib/components/VoiceBenchmarkFlow.svelte';
  import VoiceComfortBand from '$lib/components/VoiceComfortBand.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import VoicePractice from '$lib/components/VoicePractice.svelte';
  import VoiceTake from '$lib/components/VoiceTake.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  type Tab = 'record' | 'practise' | 'compare';
  const TABS: Tab[] = ['record', 'practise', 'compare'];

  /* The trend takes role 0, the picker's stripe after it - the same split
     the labs screen makes between its chart and its results. */
  const SECTION_ROLE = { trend: 0, list: 1 };

  let requested = page.url.searchParams.get('tab');
  let tab = $state<Tab>(TABS.includes(requested as Tab) ? (requested as Tab) : 'record');

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
     what ADR-0059 asks of it. */
  let pairLanguage = $derived(
    pair ? bandLanguageOf(anchors[pair.left].passageKey, getLocale()) : bandLanguageOf('', getLocale())
  );
  let pairLanguageGuessed = $derived(
    pair ? bandLanguageIsGuessed(anchors[pair.left].passageKey) : true
  );

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
    <div class="compare-wrap">
      {#each [{ i: pair.left, which: 'left' as const, canPrev: pair.left > 0, canNext: pair.left < pair.right - 1 }, { i: pair.right, which: 'right' as const, canPrev: pair.right > pair.left + 1, canNext: pair.right < anchors.length - 1 }] as side (side.which)}
        {@const benchmark = anchors[side.i]}
        <div class="compare-side">
          <VoicePlayer fileName={benchmark.passageFileName} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev}
              aria-label={m.vc_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(benchmark.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext}
              aria-label={m.vc_later()} onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <!-- Each side's own take, on the same axis and behind the same
               bands, which is what makes two of them readable side by side
               at all (ticket 09). -->
          <VoiceTake
            data-vc-take={benchmark.id}
            {comfort}
            captionShared
            language={bandLanguageOf(benchmark.passageKey, getLocale())}
            role={roleAt(activeFlag.roles, SECTION_ROLE.trend)}
            pitchTrack={benchmark.pitchTrack}
            medianHz={benchmark.f0MedianHz}
            p10Hz={benchmark.f0P10Hz}
            p90Hz={benchmark.f0P90Hz}
          />
        </div>
      {/each}
    </div>

    <!-- One caption for the pair. Two of them, each in half the width, is
         the same three paragraphs twice over the two charts they are about
         (PitchBandsCaption.svelte's own note). -->
    <div class="screen-part" {...roleAttrs(roleAt(activeFlag.roles, SECTION_ROLE.trend))}>
      <PitchBandsCaption language={pairLanguage} languageGuessed={pairLanguageGuessed} />
    </div>

    <div class="screen-part vc-delta" data-benchmark-delta>
      <h3>{m.vc_delta_title()}</h3>
      {#if delta}
        <dl class="vc-delta-figures">
          <div><dt>{m.vb_pitch()}</dt>
            <dd>{m.vb_hz({ value: signed(delta.f0DeltaHz, 0) })} ({m.vb_semitones({ value: signed(delta.f0DeltaSemitones, 1) })})</dd></div>
          <div><dt>{m.vb_resonance()}</dt>
            <dd>
              {#if delta.f1DeltaHz !== null && delta.f2DeltaHz !== null}
                {m.vb_hz({ value: signed(delta.f1DeltaHz, 0) })} · {m.vb_hz({ value: signed(delta.f2DeltaHz, 0) })}
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
          { value: 'compare', label: m.vb_tab_compare() }
        ]}
        value={tab}
        onChange={changeTab}
        compact
        key="voice-tab"
      />
    </div>

    {#if tab === 'record'}
      <VoiceBenchmarkFlow onSaved={() => (tab = 'compare')} />
    {:else if tab === 'practise'}
      <VoicePractice />
      <div class="screen-part">
        <!-- The comfort band lives on the practise tab: it is the band
             somebody is working towards while they are speaking, and this
             is the tab they are speaking on. It draws on every figure once
             it is set. -->
        <VoiceComfortBand role={roleAt(activeFlag.roles, SECTION_ROLE.list)} />
      </div>
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
                    <span class="kit-row-ico"><Icon name="mic" size={20} /></span>
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
            <div class="editor-savebar">
              <button class="btn btn-primary press" data-compare onclick={() => (comparing = true)}>
                <Icon name="columns" size={20} /><span>{m.vc_compare()}</span>
              </button>
            </div>
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
  /* Voice benchmark delta (phase 5 deepening ticket 16). Same dt/dd-row
     shape as VoiceBenchmarkFlow.svelte's own .vb-figures, which is scoped to
     that component and out of reach here - two surfaces wanting the same
     small layout is not yet a third one worth lifting into a shared class. */
  .vc-delta h3 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
  .vc-delta-figures { display: grid; gap: var(--space-3); margin: 0; }
  .vc-delta-figures > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
  .vc-delta-figures dt { color: var(--muted); font-size: var(--text-sm); }
  .vc-delta-figures dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: var(--weight-semibold); text-align: right; }
  .vc-aside { color: var(--muted); font-weight: 400; }
</style>
