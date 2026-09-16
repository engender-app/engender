<script lang="ts">
  /* The memo browser, as a tab of the voice screen (phase 11 ticket 17). It
     was its own screen at /media/voice/memos (phase 8 features ticket 11) -
     the render showed two rows and 520px of black rather than the grid with
     compare and export ADR-0036's media grouping pictured, so this is a
     presentation merge and not a change of what a memo is: it stays entry
     content, recorded in the editor and attached to the entry
     (voiceRecordings.ts), and this component still owns no records,
     registers no archive section, and deletes nothing. `/media/voice/memos`
     redirects here.

     It reads back `journal.voice.inJournal()`, built for ticket 25's voice
     compare picker and never called until ticket 11 - that comparison was
     cut from the voice screen before it shipped (ticket 09's own note),
     leaving the query with no caller until the memo browser gave it one.

     Playback is VoicePlayer's own transport (ticket 46), which is the app's
     rather than the browser's. It cannot sit inside the row's own link to
     the entry (a button inside an anchor is not markup a browser can
     resolve, the same reasoning ListRow's own `action` slot states), so each
     row is a plain, non-pressable container holding both real controls: the
     player, and a small link through to the entry.

     The tab opens by saying what is true now (DIRECTION rule 16): how many
     recordings there are and how long they run altogether. The total is the
     players' own durations as they arrive - a recording's length is not
     stored, being derivable from the file (ADR-0010), and the row is already
     loading that file's metadata to play it. It counts up rather than
     landing, because a number that changes is a number that moves. */
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
                  href={`/entry/${r.entryId}`}
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
        text={m.vm_empty_body()}
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

  /* Two lines: the day it belongs to with the way through to it, and the
     transport under them across the row's whole width. The leading mic
     square this row used to carry went with ticket 46 - the play control
     says what the row holds, and 36px of icon was 36px the waveform wanted.
     The row's main span is still a static container rather than a link: the
     entry link and the player are the two real controls (kit.css's own note
     on .kit-row.is-split makes the same split for a different pair). */
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
