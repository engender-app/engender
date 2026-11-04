<script lang="ts">
  /* One return moment per gap. The read holds its gap across writes and
     refreshes the waiting rows. Each row links to its owning screen; this
     step neither edits a dose nor closes a wear session. */
  import { goto } from '$app/navigation';
  import { navigating } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { wearReturningRowTitle } from '$lib/data/vocabulary/wearLabels';
  import { readReturnGap, readWhatIsWaiting, WAITING_TABLES } from '$lib/data/comingBackReads';
  import { waitingItemKey } from '$lib/data/comingBack';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { disclose } from '$lib/motion/reveal';
  import { roleAttrs } from '$lib/components/kit/role';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const today = $derived(currentDay());
  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* A return is one gap. Keep its boundary while waiting rows refresh. */
  const gap = readReturnGap(journal, todayEpochDay()); // mount-day: a return is one gap

  /* Seeded rather than left to discover itself: every one of `readWhatIsWaiting`'s
     five reads sits past the gap's own `await`, so an unseeded query would
     re-run once for nothing on every mount (phase 8 audit ticket 14). */
  let waitingQuery = liveQuery(async (j) => {
    const asOf = today; // before the await, so the read follows the day
    const since = await gap;
    return since === null ? null : readWhatIsWaiting(j, asOf, since);
  }, WAITING_TABLES);
  let waitingRows = liveListIn(waitingQuery, (surface) => surface?.items ?? []);

  let showing = $derived(waitingRows.rows);

  /* Wait for the read before saying nothing is waiting. */
  let line = $derived(
    !waitingRows.loading && showing.length === 0 ? m.coming_back_empty_body() : m.coming_back_intro()
  );

  /* Navigation owns the exit, so rows do not collapse behind it. */
  let panel = $derived({ skip: navigating.to !== null });

  /* Arriving is meeting it. Stamped as soon as the read answers, so a person
     who reads this and writes nothing is not shown it again tomorrow - and
     stamped with the gap's own last-write day, so a new gap later is a
     different value and opens the surface again with nothing to expire. */
  $effect(() => {
    const surface = waitingQuery.value;
    if (surface && prefs.comingBackSeenSince !== surface.sinceEpochDay) {
      prefs.comingBackSeenSince = surface.sinceEpochDay;
    }
  });

</script>

<div class="screen screen-return">
  <!-- The field with a title and nothing else (rule 15). No back control:
       the step has no parent, and the foot below is the way off. -->
  <ScreenHeader title={m.coming_back_title()} subtitle={line} screen="coming-back" />

  <ReadGate read={waitingRows} variant="line" count={4}>
    <!-- Nothing. The line under the field already says the true sentence,
         and a second surface saying it again is the contradiction the
         phase 8 review found. -->
    {#snippet empty()}{/snippet}

    {#snippet rows()}
      <!-- One flush list in the order comingBack.ts supplies. No empty
           card: its hairlines only belong to a list with rows. -->
      {#if showing.length > 0}
        <ListCard>
          {#each showing as item, i (waitingItemKey(item))}
            <div
              class="rows-divide"
              transition:disclose={panel}
              style:--row-index={Math.min(6, i)}
              {...roleAttrs(roleAt(activeFlag.roles, 0))}
            >
              {#if item.kind === 'letter'}
                <ListRow
                  key="coming-back-letter"
                  data-coming-back-item="letter"
                  icon="envelope"
                  title={m.coming_back_letter_title()}
                  subtitle={m.coming_back_letter_sub({ date: dayLong(item.unlockEpochDay) })}
                  href="/transition/letters"
                />
              {:else if item.kind === 'milestone'}
                <ListRow
                  key="coming-back-milestone"
                  data-coming-back-item="milestone"
                  icon="flag"
                  title={item.name}
                  subtitle={m.coming_back_milestone_sub({ date: dayLong(item.epochDay) })}
                  href="/transition/milestones"
                />
              {:else if item.kind === 'era'}
                <ListRow
                  key="coming-back-era"
                  data-coming-back-item="era"
                  icon="columns"
                  title={item.name}
                  subtitle={item.startEpochDay === null
                    ? m.coming_back_era_sub_no_start()
                    : m.coming_back_era_sub({ date: dayLong(item.startEpochDay) })}
                  href="/settings/eras"
                />
              {:else if item.kind === 'wear-session'}
                <ListRow
                  key="coming-back-wear-session"
                  data-coming-back-item="wear-session"
                  icon="watch"
                  title={wearReturningRowTitle(item.wearKind)}
                  subtitle={m.coming_back_wear_row_sub({ date: dayLong(item.startEpochDay) })}
                  href="/body/wear"
                />
              {:else}
                <ListRow
                  key="coming-back-dose"
                  data-coming-back-item="dose"
                  icon="clock"
                  title={m.coming_back_dose_row({ date: dayLong(item.slotEpochDay) })}
                  subtitle={m.coming_back_dose_row_sub({ amount: `${item.dose} ${item.doseUnit}` })}
                  href="/care/doses?add=1"
                />
              {/if}
            </div>
          {/each}
        </ListCard>
      {/if}
    {/snippet}
  </ReadGate>

  <!-- Rule 12's foot, with rule 15's one control: pinned to the bottom edge
       above a hairline, and it never moves. Somebody who has read this and
       wants none of it should not have to work out that back is how you
       agree to nothing - and with the route chromeless there is no back to
       work out. Primary because it is the screen's only call to action, on
       a screen that is asking for nothing else. -->
  <div class="return-foot">
    <button class="btn btn-primary btn-block" data-coming-back-done onclick={() => goto('/')}>
      <span>{m.coming_back_done_action()}</span>
    </button>
  </div>
</div>

<style>
  /* A column, so the foot can be pushed to the bottom edge on a screen with
     one row on it and stay there on a screen with nine. */
  .screen-return {
    display: flex;
    flex-direction: column;
  }

  /* Every item arrives as a block does: its icon square clips open from its
     own left edge over --dur-slow, one --stagger-step per row of the
     arrival, the words beside it cutting (rule 10, ADR-0078; the agenda's
     day block on Home is the same movement at the same size). --row-index
     is set by the list and capped at the seventh where the tiles' stagger
     is. Filled both ways so the 1ms reduced-motion clamp ends it where it
     rests, and outset by 6px for the focus ring, as every block's is.

     :global because these squares are drawn inside ListRow and a
     scoped selector would never reach them. Here rather than in
     kit.css because a row icon is not a block that moves anywhere else in
     the app yet - that is ticket 20's sweep to make, not this ticket's. */
  .screen-return :global(.kit-row-ico) {
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--row-index, 0) * var(--stagger-step));
  }

  .screen-return :global(.kit-row-sub) {
    overflow-wrap: anywhere;
  }

  /* ---- the foot ----------------------------------------------------
     Rule 12's foot with rule 15's one control, pinned to the window's
     bottom edge above a hairline and never moving between states.

     `margin-top: auto` puts it on the bottom edge of a screen whose list is
     short; `position: sticky` keeps it there when the list is long enough
     to scroll under it. The negative offset is what a sticky bottom costs:
     it is measured from the scroll port's padding edge and the region holds
     --nav-clearance of padding there, so a foot that means to sit *on* the
     window's edge gives that breath back. The system inset stays, as the
     foot's own padding.

     Kept where it is by carpet 26, which moved the save bar out of the
     column and into the frame for having this same shape (`.app-savebar`,
     app.css, and $lib/stores/saveBar.svelte for why). Two things make this
     one different: it is opaque and it hugs the window's edge rather than
     sitting on a floating bar there is none of, and carpet 28's occlusion
     pass reads this screen clean - the list is short by rule 15 and nothing
     interactive ends up under it. A screen where that stops being true
     takes the frame's foot instead of thickening this one. */
  .return-foot {
    position: sticky;
    bottom: calc(-1 * var(--space-5));
    margin-top: auto;
    margin-bottom: 0;
    /* Out through .screen's own 20 so the hairline runs the window's width,
       then padded back in so the control starts where the rows do. */
    margin-inline: calc(-1 * var(--space-5));
    padding: var(--space-3) var(--space-5) calc(var(--space-3) + var(--inset-bottom));
    border-top: 1px solid var(--hairline);
    /* Opaque, or the rows scroll through it. */
    background: var(--bg);
  }

</style>
