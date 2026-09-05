<script lang="ts">
  /* Saying you are done with an area, on the area's own screen (phase 8
     features ticket 04, ADR-0052, ADR-0045).

     Not in Settings and not in a menu: the area is where the person is when
     they decide they are done with it, and a decision about the size log
     belongs on the size log. Eight screens mount this, one line each, and it
     is one component rather than eight copies because the risk here is copy
     and eight copies of a sentence drift.

     ## The states, and why the middle ones are sheets

     Not finished, it is one quiet row at the foot of the screen - two, on
     voice and hair removal, since pausing is the other thing those two
     screens can say (phase 8 features ticket 51, ADR-0052 amendment).
     Finished, it is what the person said and a row to undo it - two rows,
     not an icon button, because un-finishing has to be at least as easy as
     finishing and an unlabelled glyph is not. Suspended reads the same way,
     with "resume" standing in for "pick it back up".

     A stream is active, suspended or finished, never two of those at once
     (`journal/areaStates.ts` enforces it on write), so the card never has to
     choose which of two conflicting rows to draw - only one of the three
     states is ever true, and finishing while suspended (or the reverse) just
     moves it from one to the other.

     The confirmation exists for the reason the photo-section milestone's
     does: the gesture reads as destructive and nothing is destroyed, so the
     sheet's whole job is to say what actually happens. Records stay, search
     still finds them, the prompts stop, and this can be undone. It is a
     primary button and not a danger one for the same reason.

     It also names the two consequences that leave this screen, which is the
     part a shorter sentence would have left out: the day is drawn on every
     chart covering it and printed in the clinician summary. Somebody who
     stopped a course of treatment for a hard reason should not find that out
     from a page they are about to hand a doctor.

     Three sentences, where docs/ui-copy.md puts an explanation at two. That
     file's own exception is for the screens where "the sentence must be
     exactly as final as the behaviour" and where "three or four sentences
     there beat a short sentence that leaves something out". Printing a line
     onto a document meant for a doctor is that case, so the rule is being
     used rather than missed.

     ## The offer

     An area with something in it and nothing added for half a year may be
     offered. It is a registered offer (`offers.ts`) rather than a fifth
     hand-wiring of one, and its yes opens the same sheet - pre-filled with
     the day of the last write, since that is the honest guess at when the
     practice stopped - so there is one confirmation and one write, and both
     go through `answerOffer`. Its words are the registry's too, the way every
     other offer's screen reads them, so the list stays auditable as copy. Its
     no is kept forever in `areaFinishOfferDeclined`, per section rather than
     per row, so the question is asked at most once per area for the life of
     the journal and a later regroup cannot un-say it.

     ## Motion

     Tier 3, change within a screen, and the verb is a settle rather than a
     dissolve. The card is one object saying something different at three
     different moments, not one piece of content replacing another, so it
     stays mounted and `resize` carries the height from a row to two rows and
     back (motion/reveal.ts). The offer leaves through Notice's own
     `disclose`, so answering it collapses the space it held instead of
     dropping everything under it a frame. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import {
    AREA_GROUPS,
    groupFinishedOn,
    groupLastWrite,
    groupSuspendedOn,
    shouldOfferFinish,
    suspendableAreasOf,
    type AreaGroupKey
  } from '$lib/data/areaGroups';
  import { areaGroupName } from '$lib/data/vocabulary/areaLabels';
  import { OFFERS, answerOffer, type FinishedArea, type SuspendedArea } from '$lib/data/offers';
  import { fmtDay } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValueOrToday,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { resize } from '$lib/motion/reveal';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';

  let { group }: { group: AreaGroupKey } = $props();

  const OFFER = OFFERS['area-finished'];
  const SUSPEND_OFFER = OFFERS['area-suspended'];
  const today = todayEpochDay();
  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** Null for every group but voice and hair removal (ticket 51) - the two
      areas this group's own areas were named for. */
  let suspendableAreas = $derived(suspendableAreasOf(group));

  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  let states = $derived(statesQuery.value ?? {});
  let finishedOn = $derived(groupFinishedOn(group, states));
  let suspendedOn = $derived(groupSuspendedOn(group, states));

  /* Asked unconditionally rather than behind a gate of its own. A gate would
     have had to restate two of `shouldOfferFinish`'s four conditions here,
     which is one predicate in two places and a drift waiting to happen; the
     read itself is eighteen bounded MAXes (lastWrite.ts) and runs once per
     visit to one of eight screens. */
  let lastWritesQuery = liveQuery((j) => j.lastWrite.getLastWrites(today));

  let offering = $derived(
    lastWritesQuery.value !== undefined &&
      shouldOfferFinish(group, {
        states,
        lastWrites: lastWritesQuery.value,
        declined: prefs.areaFinishOfferDeclined,
        todayEpochDay: today
      })
  );
  let lastWrite = $derived(lastWritesQuery.value ? groupLastWrite(group, lastWritesQuery.value) : null);

  let sheetOpen = $state(false);
  let dateInput = $state(dateInputValueFromEpochDay(today));

  /** The control's own way in: today, which is the day somebody deciding now
      is deciding about, and editable. */
  function openFinish() {
    dateInput = dateInputValueFromEpochDay(today);
    sheetOpen = true;
  }

  /* The offer's yes. Pre-filled with the day of the last write rather than
     with today, because six months have passed and today is not when the
     practice stopped - and it stays editable, since the person may have
     carried on somewhere the app never saw. */
  function acceptOffer() {
    dateInput = dateInputValueFromEpochDay(lastWrite ?? today);
    sheetOpen = true;
  }

  /** The offer's no, kept for good, and written per section rather than per
      row (ADR-0052: a stored key is never a hub row). */
  function declineOffer() {
    const unrecorded = AREA_GROUPS[group].filter((area) => !prefs.areaFinishOfferDeclined.includes(area));
    if (unrecorded.length === 0) return;
    prefs.areaFinishOfferDeclined = [...prefs.areaFinishOfferDeclined, ...unrecorded];
  }

  /* Closed before the write, the same order the roadmap's own offer keeps: a
     second tap finds no open sheet rather than a second write in flight.

     Through `answerOffer` whichever moment opened the sheet, because the sheet
     *is* the confirmation either way and ADR-0045's rule is that the write
     happens on one path. A second call straight to `setAreasFinished` here
     would be the "trigger that wanted to write directly" offers.ts's own
     header exists to refuse. */
  async function confirmFinish() {
    const subject: FinishedArea = {
      areas: AREA_GROUPS[group],
      epochDay: epochDayFromDateInputValueOrToday(dateInput)
    };
    sheetOpen = false;
    await answerOffer(OFFER, subject, 'confirm', journal);
  }

  /** Un-finishing: the same call with null, and no date to pick. */
  function pickBackUp() {
    void journal.areaStates.setAreasFinished(AREA_GROUPS[group], null);
  }

  let suspendSheetOpen = $state(false);
  let suspendDateInput = $state(dateInputValueFromEpochDay(today));

  /** The control's own way in, same as `openFinish` - today, editable. */
  function openSuspend() {
    suspendDateInput = dateInputValueFromEpochDay(today);
    suspendSheetOpen = true;
  }

  /* Closed before the write, `confirmFinish`'s own order and its own reason:
     a second tap finds no open sheet, and the write goes through
     `answerOffer` so this is not a second path to `setAreasSuspended`
     alongside whatever a future automatic trigger might reach for. */
  async function confirmSuspend() {
    if (!suspendableAreas) return;
    const subject: SuspendedArea = {
      areas: suspendableAreas,
      epochDay: epochDayFromDateInputValueOrToday(suspendDateInput)
    };
    suspendSheetOpen = false;
    await answerOffer(SUSPEND_OFFER, subject, 'confirm', journal);
  }

  /** Resuming: the same call with null, and no date to pick - `pickBackUp`'s
      own shape. */
  function resume() {
    if (!suspendableAreas) return;
    void journal.areaStates.setAreasSuspended(suspendableAreas, null);
  }
</script>

<div class="screen-part area-finish">
  {#if offering && lastWrite !== null}
    <Notice
      key="area-finish-offer"
      data-area-finish-offer
      icon="clock"
      role={roleAt(activeFlag.roles, 0)}
      title={OFFER.copy.title()}
      text={m.area_finish_offer_body({ date: dayLong(lastWrite) })}
      action={{ label: OFFER.copy.confirm(), onclick: acceptOffer }}
    />
  {/if}

  <!-- One card, always here, its rows saying whichever of the three things
       is true. Kept mounted rather than swapped under a `{#key}`: `resize`
       animates a box that changes size under its own content, which is what
       this is - a row that becomes two, or a row that says something else.
       A `{#key}` would have destroyed and rebuilt it, and `crossfade` takes
       the leaving node out of flow, so the pair would collapse the block to
       nothing for a beat and then snap, which is the jump `disclose` and
       `resize` were both written to stop.

       While the offer is up this card carries the offer's *other* answer.
       Both answers are then labelled rows in the app's own shapes - the
       notice asks and offers the yes, this is the no - rather than one
       labelled action and an unmarked x, which is the same glyph that means
       "hide this, I have read it" on every other notice in the app and would
       be spending a decision the app never asks about again. -->
  <div use:resize>
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      {#if finishedOn !== null}
        <ListRow
          key="area-finished"
          data-area-finished
          icon="flag"
          title={m.area_finish_done_title({ date: dayLong(finishedOn) })}
          subtitle={m.area_finish_done_sub()}
          aria-live="polite"
          static
          chevron={false}
        />
        <ListRow
          key="area-finish-undo"
          data-area-finish-undo
          icon="plus"
          title={m.area_finish_undo()}
          chevron={false}
          onclick={pickBackUp}
        />
      {:else if suspendedOn !== null}
        <ListRow
          key="area-suspended"
          data-area-suspended
          icon="pause"
          title={m.area_suspend_done_title({ date: dayLong(suspendedOn) })}
          subtitle={m.area_suspend_done_sub()}
          aria-live="polite"
          static
          chevron={false}
        />
        <ListRow
          key="area-suspend-undo"
          data-area-suspend-undo
          icon="plus"
          title={m.area_suspend_undo()}
          chevron={false}
          onclick={resume}
        />
      {:else if offering}
        <ListRow
          key="area-finish-decline"
          data-area-finish-decline
          icon="x"
          title={OFFER.copy.decline()}
          subtitle={m.area_finish_offer_dismiss_sub()}
          chevron={false}
          onclick={declineOffer}
        />
      {:else}
        <ListRow
          key="area-finish"
          data-area-finish
          icon="flag"
          title={m.area_finish_row_title()}
          subtitle={m.area_finish_row_sub()}
          aria-live="polite"
          chevron={false}
          onclick={openFinish}
        />
        {#if suspendableAreas}
          <ListRow
            key="area-suspend"
            data-area-suspend
            icon="pause"
            title={m.area_suspend_row_title()}
            subtitle={m.area_suspend_row_sub()}
            chevron={false}
            onclick={openSuspend}
          />
        {/if}
      {/if}
    </ListCard>
  </div>
</div>

<Sheet bind:open={sheetOpen} title={m.area_finish_sheet_title({ area: areaGroupName(group) })}>
  <h3>{m.area_finish_sheet_title({ area: areaGroupName(group) })}</h3>
  <p class="muted small area-finish-body">{m.area_finish_sheet_body()}</p>
  <Field label={m.area_finish_date_label()} id="area-finish-date">
    {#snippet children(id)}
      <DatePicker name="area-finish-date" max={dateInputValueFromEpochDay(today)} bind:value={dateInput} {id} />
    {/snippet}
  </Field>
  <div class="stack-3 area-finish-actions">
    <button class="btn btn-primary" data-area-finish-confirm onclick={confirmFinish}>
      <span>{OFFER.copy.confirm()}</span>
    </button>
    <button class="btn btn-ghost" onclick={() => (sheetOpen = false)}>
      <span>{m.area_finish_cancel()}</span>
    </button>
  </div>
</Sheet>

{#if suspendableAreas}
  <Sheet bind:open={suspendSheetOpen} title={m.area_suspend_sheet_title()}>
    <h3>{m.area_suspend_sheet_title()}</h3>
    <p class="muted small area-finish-body">{m.area_suspend_sheet_body()}</p>
    <Field label={m.area_suspend_date_label()} id="area-suspend-date">
      {#snippet children(id)}
        <DatePicker
          name="area-suspend-date"
          max={dateInputValueFromEpochDay(today)}
          bind:value={suspendDateInput}
          {id}
        />
      {/snippet}
    </Field>
    <div class="stack-3 area-finish-actions">
      <button class="btn btn-primary" data-area-suspend-confirm onclick={confirmSuspend}>
        <span>{SUSPEND_OFFER.copy.confirm()}</span>
      </button>
      <button class="btn btn-ghost" onclick={() => (suspendSheetOpen = false)}>
        <span>{m.area_suspend_cancel()}</span>
      </button>
    </div>
  </Sheet>
{/if}

<style>
  .area-finish-body {
    margin-bottom: var(--space-4);
  }

  .area-finish-actions {
    margin-top: var(--space-4);
  }
</style>
