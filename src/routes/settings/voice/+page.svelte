<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import {
    orderAnchorsByJourney,
    stepCompareAnchor,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/voice/compare-state';
  import Icon from '$lib/components/Icon.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* The audio counterpart to settings/photos (ticket 25): same picker and
     compare interaction over journal.voice.inJournal's dated, oldest-first
     list instead of journal.photos.inJournal's. Recordings are entry-only
     (CONTEXT: "Voice recording"), so there is no milestone-vs-entry caption
     to show under each side the way the photo compare view does. */
  let recordingsQuery = liveQuery(['voiceRecording', 'entry'], (j) => j.voice.inJournal());
  let recordings = $derived(recordingsQuery.value ?? []);

  let selected = $state<string[]>([]);
  let comparing = $state(false);

  let orderedSelected = $derived(orderAnchorsByJourney(selected, recordings));
  let pair = $derived(toComparePair(selected, recordings));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(recordings[pair.left].epochDay, recordings[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  function toggle(id: string) {
    selected = toggleCompareAnchor(selected, id, recordings);
  }

  function step(which: 'left' | 'right', delta: -1 | 1) {
    selected = stepCompareAnchor(selected, which, delta, recordings);
  }
</script>

<div class="screen">
  {#if comparing && pair}
    <header class="screen-header">
      <button class="icon-btn" aria-label={m.back()} onclick={() => (comparing = false)}><Icon name="arrowLeft" /></button>
      <h1 class="screen-title">{m.vc_compare()}</h1>
      <div class="header-action"></div>
    </header>
    <p class="compare-gap">{gapLabel}</p>
    <div class="compare-wrap">
      {#each [{ i: pair.left, which: 'left' as const, canPrev: pair.left > 0, canNext: pair.left < pair.right - 1 }, { i: pair.right, which: 'right' as const, canPrev: pair.right > pair.left + 1, canNext: pair.right < recordings.length - 1 }] as side (side.which)}
        <div class="compare-side">
          <VoicePlayer fileName={recordings[side.i].fileName} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev} style={side.canPrev ? '' : 'opacity:.3'}
              aria-label={m.vc_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(recordings[side.i].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext} style={side.canNext ? '' : 'opacity:.3'}
              aria-label={m.vc_later()} onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
        </div>
      {/each}
    </div>

    <div style="margin-top:var(--space-6)">
      <button class="btn btn-soft" onclick={() => { comparing = false; selected = []; }}>
        <span>{m.vc_back_to_all()}</span>
      </button>
    </div>
  {:else}
    <header class="screen-header">
      <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
      <h1 class="screen-title">{m.recordings_label()}</h1>
      <div class="header-action"></div>
    </header>
    {#if recordingsQuery.loading}
      <Skeleton variant="line" count={4} />
    {:else if recordings.length}
      {#if comparing && !pair}
        <p class="muted small" style="margin-bottom:var(--space-2)">{m.vc_compare_reset()}</p>
      {/if}
      <p class="muted small" style="margin-bottom:var(--space-4)">
        {orderedSelected.length === 0
          ? m.vc_pick_two()
          : orderedSelected.length === 1
            ? m.vc_one_selected()
            : m.vc_two_selected()}
      </p>
      <div class="list-group">
        {#each recordings as r (r.id)}
          <button class="list-row" class:is-selected={orderedSelected.includes(r.id)} aria-pressed={orderedSelected.includes(r.id)}
            aria-label={m.vc_cell_aria({ date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            onclick={() => toggle(r.id)}>
            <span class="row-icon"><Icon name="mic" size={20} /></span>
            <span class="row-text">
              <span class="row-title">{fmtDay(r.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </span>
            {#if orderedSelected.includes(r.id)}<span class="row-trailing"><Icon name="check" size={18} /></span>{/if}
          </button>
        {/each}
      </div>
      {#if pair}
        <div class="editor-savebar">
          <button class="btn btn-primary" data-compare onclick={() => (comparing = true)}>
            <Icon name="columns" size={20} /><span>{m.vc_compare()}</span>
          </button>
        </div>
      {/if}
    {:else}
      <EmptyState
        title={m.vc_empty_title()}
        text={m.vc_empty_body()}
      />
    {/if}
  {/if}
</div>
