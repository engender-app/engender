<script lang="ts">
  /* Two recordings side by side, on the surface kit (phase 5 UX ticket 25).

     The picking list is written out rather than built from ListRow: a row
     here is not a destination and not an editor, it is one of two anchors
     being chosen, so it carries `aria-pressed` and a tick instead of a
     chevron. One screen wants that shape, so it stays here rather than
     becoming a prop the other twenty-five would never pass. */
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
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

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
    <ScreenHeader title={m.vc_compare()} back={() => (comparing = false)} />
    <p class="compare-gap">{gapLabel}</p>
    <div class="compare-wrap">
      {#each [{ i: pair.left, which: 'left' as const, canPrev: pair.left > 0, canNext: pair.left < pair.right - 1 }, { i: pair.right, which: 'right' as const, canPrev: pair.right > pair.left + 1, canNext: pair.right < recordings.length - 1 }] as side (side.which)}
        <div class="compare-side">
          <VoicePlayer fileName={recordings[side.i].fileName} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev}
              aria-label={m.vc_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(recordings[side.i].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext}
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
    <ScreenHeader title={m.recordings_label()} back="/more" />
    {#if recordingsQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={4} /></div>
    {:else if recordings.length}
      <div in:crossfade>
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
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each recordings as r (r.id)}
            <button
              class="kit-row"
              data-voice-cell={r.id}
              aria-pressed={orderedSelected.includes(r.id)}
              aria-label={m.vc_cell_aria({ date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
              onclick={() => toggle(r.id)}
            >
              <span class="kit-row-ico"><Icon name="mic" size={20} /></span>
              <span class="kit-row-text">
                <span class="kit-row-title">{fmtDay(r.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </span>
              <span class="kit-row-trail">
                {#if orderedSelected.includes(r.id)}<Icon name="check" size={20} />{/if}
              </span>
            </button>
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
    {:else}
      <div in:crossfade>
        <Notice
          icon="mic"
          key="voice-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.vc_empty_title()}
          text={m.vc_empty_body()}
        />
      </div>
    {/if}
  {/if}
</div>
