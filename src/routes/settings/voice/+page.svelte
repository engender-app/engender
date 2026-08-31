<script lang="ts">
  /* Two recordings side by side, on the surface kit (phase 5 UX ticket 25),
     now also two benchmarks (phase 5 deepening ticket 16).

     A benchmark is a second kind of anchor this surface compares, not a
     second screen: a segmented control switches which list the picker
     shows, and compare-state.ts (generalized to any dated anchor) never
     needs to know which kind it is holding. Picking is scoped to one kind
     at a time, so a memo can never end up paired against a benchmark -
     switching kind clears the pick outright rather than leaving a stale
     half-selection from the other list.

     What a benchmark adds beyond audio playback: a trend of every
     benchmark's pitch over time, and, once two are picked, a plain
     description of what changed between them (audio/benchmarkDelta.ts owns
     that arithmetic and the same-passage gate). Neither reads a direction
     into the numbers (PRODUCT.md:109) - the delta states Hz and semitones
     and stops.

     The picking list is still written out rather than built from ListRow's
     own checkbox semantics: a row here is one of two anchors being chosen,
     so it carries `aria-pressed` and a tick rather than a chevron. The
     benchmark row additionally owns a delete action, which is why it is
     hand-rolled rather than passed through ListRow's `action` prop - that
     prop moves `aria-pressed` off the actual pressable button and onto a
     wrapping div (appointment-prep's own note on the same conflict), which
     would break the exact contract this picker needs. */
  import { m } from '$lib/paraglide/messages';
  import { annotationSpan, narrowAnnotations } from '$lib/charts/annotations';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal, liveList, type LiveList } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration, fmtRangeEnds } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import {
    orderAnchorsByJourney,
    stepCompareAnchor,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/voice/compare-state';
  import type { DatedRecording } from '$lib/data/journal/voiceRecordings';
  import { acousticDelta } from '$lib/audio/benchmarkDelta';
  import { paddedSeries } from '$lib/charts/geometry';
  import type { VoiceBenchmark } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  type Kind = 'recordings' | 'benchmarks';
  type Anchor = DatedRecording | VoiceBenchmark;

  /* The trend takes role 0, the picker's stripe after it - the same split
     the labs screen makes between its chart and its results. */
  const SECTION_ROLE = { trend: 0, list: 1 };

  let kind = $state<Kind>('recordings');

  /* The audio counterpart to settings/photos (ticket 25): same picker and
     compare interaction over journal.voice.inJournal's dated, oldest-first
     list, or now journal.voiceBenchmarks.getBenchmarks' (ticket 16). */
  let recordingsQuery = liveList((j) => j.voice.inJournal());
  let benchmarksQuery = liveList((j) => j.voiceBenchmarks.getBenchmarks());
  /* What was happening between the takes (ticket 23). Benchmarks are months
     apart and a regimen episode is the thing they are read against, so the
     trend's range is however long there have been benchmarks. */
  let span = $derived(annotationSpan(benchmarksQuery.rows.map((b) => b.epochDay), todayEpochDay()));
  let annotationsQuery = liveList((j) => j.chartAnnotations.getAnnotations(span.from, span.to, todayEpochDay()));
  let activeQuery: LiveList<Anchor> = $derived(kind === 'recordings' ? recordingsQuery : benchmarksQuery);
  let anchors = $derived<Anchor[]>(kind === 'recordings' ? recordingsQuery.rows : benchmarksQuery.rows);

  let selected = $state<string[]>([]);
  let comparing = $state(false);
  let deleteTarget = $state<string | null>(null);

  let orderedSelected = $derived(orderAnchorsByJourney(selected, anchors));
  let pair = $derived(toComparePair(selected, anchors));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(anchors[pair.left].epochDay, anchors[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  /* Only two benchmarks have a delta at all - comparing two recordings, or
     comparing across different passages, has nothing to compute (the
     passage gate lives in benchmarkDelta.ts itself, not here). Narrowed
     rather than cast: `kind` and `anchors` agreeing is an invariant this
     function should verify, not assume. */
  let delta = $derived.by(() => {
    if (!pair) return undefined;
    const left = anchors[pair.left];
    const right = anchors[pair.right];
    return isBenchmark(left) && isBenchmark(right) ? acousticDelta(left, right) : undefined;
  });

  /* F0 median over every benchmark, oldest first - independent of which two
     are picked to compare. The trend and the pair compare are two
     different questions, the same way a lab's whole series and its two
     compared results are. */
  let trend = $derived(
    paddedSeries(
      benchmarksQuery.rows.map((b) => ({ x: b.epochDay, y: b.f0MedianHz })),
      5
    )
  );

  function toggle(id: string) {
    selected = toggleCompareAnchor(selected, id, anchors);
  }

  function step(which: 'left' | 'right', direction: -1 | 1) {
    selected = stepCompareAnchor(selected, which, direction, anchors);
  }

  function changeKind(next: string) {
    kind = next as Kind;
    // A pick from one kind means nothing against the other's list.
    selected = [];
    comparing = false;
  }

  function isBenchmark(anchor: Anchor): anchor is VoiceBenchmark {
    return 'passageFileName' in anchor;
  }

  function fileNameOf(anchor: Anchor): string {
    return isBenchmark(anchor) ? anchor.passageFileName : anchor.fileName;
  }

  function cellAria(anchor: Anchor): string {
    const date = fmtDay(anchor.epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
    return kind === 'recordings' ? m.vc_cell_aria({ date }) : m.vc_benchmark_cell_aria({ date });
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
        <div class="compare-side">
          <VoicePlayer fileName={fileNameOf(anchors[side.i])} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev}
              aria-label={m.vc_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(anchors[side.i].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext}
              aria-label={m.vc_later()} onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
        </div>
      {/each}
    </div>

    {#if kind === 'benchmarks'}
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
    {/if}

    <div>
      <button class="btn btn-soft" onclick={() => { comparing = false; selected = []; }}>
        <span>{m.vc_back_to_all()}</span>
      </button>
    </div>
  {:else}
    <ScreenHeader title={m.recordings_label()} back="/more" />
    <div class="screen-part">
      <Segmented
        name={m.recordings_label()}
        options={[
          { value: 'recordings', label: m.vc_kind_recordings() },
          { value: 'benchmarks', label: m.vc_kind_benchmarks() }
        ]}
        value={kind}
        onChange={changeKind}
        compact
        key="voice-kind"
      />
    </div>
    <ReadGate read={activeQuery} variant="line" count={4}>
      {#snippet rows()}
        {#if kind === 'benchmarks'}
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
                  scrubLabel={(_point, index) => fmtDay(benchmarksQuery.rows[index].epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
                  annotations={narrowAnnotations(annotationsQuery.rows, trend.from, trend.to)}
                  ariaLabel={m.vc_trend_heading()}
                />
              {:else}
                <ChartEmpty>{m.vc_trend_too_little()}</ChartEmpty>
              {/if}
            </ChartCard>
          </div>
        {/if}
        <div class="screen-part">
          {#if comparing && !pair}
            <p class="muted small" style="margin-bottom:var(--space-2)">{m.vc_compare_reset()}</p>
          {/if}
          <p class="muted small" style="margin-bottom:var(--space-4)">
            {orderedSelected.length === 0
              ? kind === 'recordings' ? m.vc_pick_two() : m.vc_benchmarks_pick_two()
              : orderedSelected.length === 1
                ? m.vc_one_selected()
                : m.vc_two_selected()}
          </p>
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.list)}>
            {#if kind === 'recordings'}
              {#each anchors as r (r.id)}
                <ListRow
                  data-voice-cell={r.id}
                  aria-pressed={orderedSelected.includes(r.id)}
                  aria-label={cellAria(r)}
                  onclick={() => toggle(r.id)}
                  chevron={false}
                  title={fmtDay(r.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
                >
                  {#snippet leading()}<span class="kit-row-ico"><Icon name="mic" size={20} /></span>{/snippet}
                  {#snippet trailing()}
                    {#if orderedSelected.includes(r.id)}<Icon name="check" size={20} />{/if}
                  {/snippet}
                </ListRow>
              {/each}
            {:else}
              <!-- Hand-rolled rather than ListRow (same reason
                   appointment-prep's own rows are): the row needs
                   `aria-pressed` on its actual pressable button and a
                   separate delete action beside it, and ListRow's `action`
                   prop puts the two on different elements. -->
              {#each anchors as b (b.id)}
                <div class="kit-row is-split" data-voice-cell={b.id}>
                  <button
                    type="button"
                    class="kit-row-main"
                    aria-pressed={orderedSelected.includes(b.id)}
                    aria-label={cellAria(b)}
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
            {/if}
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
          {#if kind === 'recordings'}
            <Notice
              icon="mic"
              key="voice-empty"
              role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
              title={m.vc_empty_title()}
              text={m.vc_empty_body()}
            />
          {:else}
            <Notice
              icon="mic"
              key="voice-benchmark-empty"
              role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
              title={m.vc_benchmarks_empty_title()}
              text={m.vc_benchmarks_empty_body()}
            />
          {/if}
        </div>
      {/snippet}
    </ReadGate>
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
