<script lang="ts">
  /* Saying you are done with an area, on the area's own screen (phase 8
     features ticket 04, ADR-0052, ADR-0045).

     Not in Settings and not in a menu: the area is where the person is when
     they decide they are done with it, and a decision about the size log
     belongs on the size log. Eight screens mount this, one line each, and it
     is one component rather than eight copies because the risk here is copy
     and eight copies of a sentence drift.

     ## The three states, and why the middle one is a sheet

     Not finished, it is one quiet row at the foot of the screen. Finished, it
     is what the person said and a row to undo it - two rows, not an icon
     button, because un-finishing has to be at least as easy as finishing and
     an unlabelled glyph is not.

     The confirmation exists for the reason the photo-section milestone's
     does: the gesture reads as destructive and nothing is destroyed, so the
     sheet's whole job is to say what actually happens. Records stay, charts
     keep them, search still finds them, the prompts stop, and this can be
     undone. It is a primary button and not a danger one for the same reason.

     ## The offer

     An area with something in it and nothing added for half a year may be
     offered. It is a registered offer (`offers.ts`) rather than a fifth
     hand-wiring of one, and its yes opens the same sheet - pre-filled with
     the day of the last write, since that is the honest guess at when the
     practice stopped - so there is one confirmation and one write. Its no is
     kept forever in `areaFinishOfferDeclined`, so the question is asked at
     most once per area for the life of the journal.

     ## Motion

     The state swap is a crossfade under `{#key}` (tier 3, change within a
     screen): the row is the same object saying something different, which is
     a dissolve rather than a slide. The offer leaves through Notice's own
     `disclose`, so answering it collapses the space it held instead of
     dropping everything under it a frame. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { AREA_GROUPS, groupFinishedOn, groupLastWrite, shouldOfferFinish, type AreaGroupKey } from '$lib/data/areaGroups';
  import { areaGroupName } from '$lib/data/vocabulary/areaLabels';
  import { OFFERS, answerOffer, type FinishedArea } from '$lib/data/offers';
  import { fmtDay } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValueOrToday,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { crossfade } from '$lib/motion/reveal';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';

  let { group }: { group: AreaGroupKey } = $props();

  const OFFER = OFFERS['area-finished'];
  const today = todayEpochDay();
  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  let states = $derived(statesQuery.value ?? {});
  let finishedOn = $derived(groupFinishedOn(group, states));

  /* Only asked for while the area could still be offered: the read behind the
     offer is eighteen bounded MAXes (lastWrite.ts) and an area somebody has
     already answered about has nothing to do with it. */
  let lastWritesQuery = liveQuery((j) =>
    finishedOn === null && !prefs.areaFinishOfferDeclined.includes(group)
      ? j.lastWrite.getLastWrites(today)
      : Promise.resolve(null)
  );

  let offering = $derived(
    lastWritesQuery.value !== null &&
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
  /* Whether the open sheet is answering the offer or is the person's own
     gesture. The write is the same call either way; what differs is that one
     of the two is an offer being answered and has to go through
     `answerOffer`, which is ADR-0045's single path from an offer to a
     write. */
  let fromOffer = $state(false);

  function openFinish() {
    fromOffer = false;
    dateInput = dateInputValueFromEpochDay(today);
    sheetOpen = true;
  }

  /* The offer's yes. Pre-filled with the day of the last write rather than
     with today, because that is when the practice actually stopped as far as
     the journal knows - and it stays editable, since the person may have
     carried on somewhere the app never saw. */
  function acceptOffer() {
    fromOffer = true;
    dateInput = dateInputValueFromEpochDay(lastWrite ?? today);
    sheetOpen = true;
  }

  /** The offer's no, kept for good. */
  function declineOffer() {
    if (prefs.areaFinishOfferDeclined.includes(group)) return;
    prefs.areaFinishOfferDeclined = [...prefs.areaFinishOfferDeclined, group];
  }

  /* Closed before the write, the same order the roadmap's own offer keeps: a
     second tap finds no open sheet rather than a second write in flight. */
  async function confirmFinish() {
    const subject: FinishedArea = {
      areas: AREA_GROUPS[group],
      epochDay: epochDayFromDateInputValueOrToday(dateInput)
    };
    const wasOffer = fromOffer;
    sheetOpen = false;
    fromOffer = false;
    if (wasOffer) await answerOffer(OFFER, subject, 'confirm', journal);
    else await journal.areaStates.setAreasFinished(subject.areas, subject.epochDay);
  }

  /** Un-finishing: the same call with null, and no date to pick. */
  function pickBackUp() {
    void journal.areaStates.setAreasFinished(AREA_GROUPS[group], null);
  }
</script>

<div class="screen-part area-finish">
  {#if offering && lastWrite !== null}
    <Notice
      key="area-finish-offer"
      data-area-finish-offer
      icon="clock"
      role={roleAt(activeFlag.roles, 0)}
      title={m.area_finish_offer_title()}
      text={m.area_finish_offer_body({ date: dayLong(lastWrite) })}
      action={{ label: m.area_finish_offer_action(), onclick: acceptOffer }}
      dismiss={{ label: m.area_finish_offer_dismiss(), onclick: declineOffer }}
    />
  {/if}

  <!-- The standing row steps aside while the offer is up: the offer's own
       action opens the same sheet, and two ways to say the same thing one
       above the other reads as a duplicate rather than as a choice. -->
  {#key finishedOn === null}
    {#if finishedOn !== null}
      <div in:crossfade>
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          <ListRow
            key="area-finished"
            data-area-finished
            icon="flag"
            title={m.area_finish_done_title({ date: dayLong(finishedOn) })}
            subtitle={m.area_finish_done_sub()}
            static
            chevron={false}
          />
          <ListRow
            key="area-finish-undo"
            data-area-finish-undo
            icon="play"
            title={m.area_finish_undo()}
            chevron={false}
            onclick={pickBackUp}
          />
        </ListCard>
      </div>
    {:else if !offering}
      <!-- The card itself and not only its row, or an area with the offer up
           leaves an empty outline sitting under it. -->
      <div in:crossfade>
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          <ListRow
            key="area-finish"
            data-area-finish
            icon="flag"
            title={m.area_finish_row_title()}
            subtitle={m.area_finish_row_sub()}
            chevron={false}
            onclick={openFinish}
          />
        </ListCard>
      </div>
    {/if}
  {/key}
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
      <span>{m.area_finish_confirm()}</span>
    </button>
    <button class="btn btn-ghost" onclick={() => (sheetOpen = false)}>
      <span>{m.area_finish_cancel()}</span>
    </button>
  </div>
</Sheet>

<style>
  .area-finish-body {
    margin-bottom: var(--space-4);
  }

  .area-finish-actions {
    margin-top: var(--space-4);
  }
</style>
