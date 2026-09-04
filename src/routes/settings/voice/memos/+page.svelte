<script lang="ts">
  /* The memo browser (phase 8 features ticket 11). A voice memo is recorded
     inside the entry editor and used to be reachable only through the entry
     it was attached to - somebody looking for a recording had to remember
     which day it was. This screen is every memo in the journal, newest
     first, next to photos in the Media group (ADR-0036: a memo and a photo
     are the same kind of thing, media attached to an entry, browsed and
     compared).

     A memo is entry content: this screen owns no records, registers no
     archive section, and deletes nothing (that stays the entry editor's
     job, out of scope here). It reads back `journal.voice.inJournal()`,
     built for ticket 25's voice compare picker and never called until now -
     that comparison was cut from the voice screen before it shipped
     (ticket 09's own note), leaving the query with no caller until this
     one.

     Playback reuses VoicePlayer's plain <audio controls>, the same choice
     the entry editor and the voice compare screen already made - no
     scrubber built for this. It cannot sit inside the row's own link to the
     entry (a button inside an anchor is not markup a browser can resolve,
     the same reasoning ListRow's own `action` slot states), so each row is
     a plain, non-pressable container holding both real controls side by
     side: the player, and a small link through to the entry. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let memosQuery = liveList((j) => j.voice.inJournal());
  let memos = $derived(memosQuery.rows);
</script>

<div class="screen">
  <ScreenHeader title={m.recordings_label()} back="/more" />
  <ReadGate read={memosQuery} variant="line" count={3}>
    {#snippet rows()}
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each memos as r (r.id)}
          <div class="kit-row is-static memo-row" data-memo-row={r.id}>
            <span class="kit-row-ico"><Icon name="mic" size={20} /></span>
            <div class="memo-row-body">
              <span class="kit-row-title">
                {fmtDay(r.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <VoicePlayer fileName={r.fileName} />
            </div>
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
        {/each}
      </ListCard>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="mic"
          key="voice-memos-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.vm_empty_title()}
          text={m.vm_empty_body()}
        />
      </div>
    {/snippet}
  </ReadGate>
</div>

<style>
  /* The row's main span is a static container, not a link - the entry link
     and the player are the two real controls, side by side (kit.css's own
     note on .kit-row.is-split makes the same split for a different pair).
     Stacked rather than in a row: a native <audio controls> wants its full
     width to lay out play/scrub/volume, which the row's own leading icon
     and trailing link leave no room for beside it. */
  .memo-row-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-block: var(--space-2);
  }

  /* .voice-player's own flex:1 (components.css) is sized for a row-direction
     parent, where flex-basis 0% grows its width; here the parent is column-
     direction, so the same flex-basis lands on height and collapses the
     player to 0px tall (screens.css's own note on the voice compare screen
     hitting the identical trap). */
  .memo-row-body :global(.voice-player) {
    flex: none;
    width: 100%;
  }
</style>
