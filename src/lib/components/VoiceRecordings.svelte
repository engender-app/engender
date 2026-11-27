<script lang="ts">
  /* This tab reads entry-attached memos via journal.voice.inJournal(). Recording and
     deletion stay with the entry. The tab owns no records or archive section.

     Keep VoicePlayer and the entry link as siblings to avoid nesting a button inside an
     anchor. The tab starts with count and total duration. Sum durations as players load
     file metadata because duration is derived from the file (ADR-0010). */
  import { page } from '$app/state';
  import { withListReturn } from '$lib/navigation/sourceRecord';
  import { m } from '$lib/paraglide/messages';
  import { SvelteMap } from 'svelte/reactivity';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { formatClock } from '$lib/media/playback';
  import { countUp } from '$lib/motion/countUp';
  import Icon from '$lib/components/Icon.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let memosQuery = liveList((j) => j.voice.inJournal());
  let memos = $derived(memosQuery.rows);

  /** Each memo's length, by recording id, as its player works it out. */
  const lengths = new SvelteMap<string, number>();
  /* Summed over the recordings that are here now rather than over everything
     the map has ever been told: a memo deleted from its entry while this
     tab is open leaves its length behind in the map, and a reading that
     kept counting it would be saying something that stopped being true -
     which is the one thing rule 16 asks this line not to do. */
  const total = $derived(memos.reduce((sum, r) => sum + (lengths.get(r.id) ?? 0), 0));

  /** The total as it is being drawn, which trails `total` by one count-up. */
  let shownTotal = $state(0);
  $effect(() => {
    const to = Math.round(total);
    return countUp(shownTotal, to, (n) => (shownTotal = n));
  });
</script>

<div class="screen-part">
  <ReadGate read={memosQuery} variant="line" count={3}>
    {#snippet rows()}
      <p class="memo-reading" data-memo-reading>
        {m.vm_summary({ count: memos.length, total: formatClock(shownTotal) })}
      </p>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each memos as r (r.id)}
          <div class="kit-row is-static memo-row" data-memo-row={r.id}>
            <div class="memo-row-body">
              <div class="memo-row-head">
                <span class="kit-row-title">
                  {fmtDay(r.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <a
                  class="icon-btn"
                  href={withListReturn(`/entry/${r.entryId}`, page.url)}
                  data-open-entry={r.id}
                  aria-label={m.vm_open_entry_aria({
                    date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                  })}
                >
                  <Icon name="chevronRight" size={20} />
                </a>
              </div>
              <VoicePlayer
                fileName={r.fileName}
                onDuration={(seconds) => lengths.set(r.id, seconds)}
              />
            </div>
          </div>
        {/each}
      </ListCard>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="mic"
        key="voice-memos-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.vm_empty_title()}
      />
    {/snippet}
  </ReadGate>
</div>

<style>
  .memo-reading {
    margin: 0 0 var(--space-3);
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  /* Two lines: the day it belongs to with the way through to it, and the transport under
     them across the row's whole width. The leading mic square this row used to carry went -
     the play control says what the row holds, and 36px of icon was 36px the waveform
     wanted. The row's main span is still a static container rather than a link: the entry
     link and the player are the two real controls (kit.css's own note on .kit-row.is-split
     makes the same split for a different pair). */
  .memo-row-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-block: var(--space-2);
  }

  .memo-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
</style>
