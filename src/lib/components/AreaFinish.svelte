<script lang="ts">
  /* Finish an area or pause voice and hair removal in place (ADR-0052, ADR-0045).
     The confirmation explains search, prompts and timeline effects. Both states
     can be reversed. An offer uses the same sheet with the last-write day, and
     a decline stays recorded for the journal's life.
     Keep the card mounted for resize and disclose the offer on exit. */
  import { m } from '$lib/paraglide/messages';
  import { attempt, writer } from '$lib/stores/attempt.svelte';
  import { announce } from '$lib/stores/announcer.svelte';
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
  import { currentDay } from '$lib/stores/today.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { resize } from '$lib/motion/reveal';
  import { EASE_OUT_CSS, motionDuration } from '$lib/motion/tokens';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';

  let {
    group,
    held = false
  }: {
    group: AreaGroupKey;
    /** Kept out of the layout while the screen above it is still a
        skeleton. The row sits at the foot, so a screen whose body swaps in
        from a page-level skeleton with no wrapper to travel its height
        (it was hair progress) threw it hundreds of pixels down in one frame.
        Held, it takes no room; let go, it fades in
        where it rests. */
    held?: boolean;
  } = $props();

  let root = $state<HTMLElement>();
  let wasHeld: boolean | undefined;
  $effect(() => {
    if (wasHeld === true && !held && root) {
      const duration = motionDuration('--dur-fast');
      if (duration > 0) root.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_OUT_CSS });
    }
    wasHeld = held;
  });

  const OFFER = OFFERS['area-finished'];
  const SUSPEND_OFFER = OFFERS['area-suspended'];
  const today = $derived(currentDay());
  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** Null for every group but voice and hair removal - the two
      areas this group's own areas were named for. */
  let suspendableAreas = $derived(suspendableAreasOf(group));

  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  let states = $derived(statesQuery.value ?? {});
  let finishedOn = $derived(groupFinishedOn(group, states));
  let suspendedOn = $derived(groupSuspendedOn(group, states));

  /* What the card says the area is, kept in a line that never leaves the
     page. The rows below swap in and out of {#if} branches, and a row
     inserted with aria-live already on it is not read (after-release 21,
     audit L04-14); this line changing is. Going back to active empties
     it, which says nothing, so picking an area back up is said through
     the announcer instead. */
  let stateLine = $derived(
    finishedOn !== null
      ? m.area_finish_done_title({ date: dayLong(finishedOn) })
      : suspendedOn !== null
        ? m.area_suspend_done_title({ date: dayLong(suspendedOn) })
        : ''
  );

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
  let dateInput = $state(dateInputValueFromEpochDay(todayEpochDay()));

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

  /* Closed once the write lands, with the button held while it runs so a
     second tap writes nothing (after-release 06; it used to close first,
     and a write that then failed went nowhere).

     Through `answerOffer` whichever moment opened the sheet, because the sheet
     *is* the confirmation either way and ADR-0045's rule is that the write
     happens on one path. A second call straight to `setAreasFinished` here
     would be the "trigger that wanted to write directly" offers.ts's own
     header exists to refuse. */
  const sheetWrite = writer();
  async function confirmFinish() {
    const subject: FinishedArea = {
      areas: AREA_GROUPS[group],
      epochDay: epochDayFromDateInputValueOrToday(dateInput)
    };
    if (!(await sheetWrite.run(() => answerOffer(OFFER, subject, 'confirm', journal), m.write_failed()))) return;
    sheetOpen = false;
  }

  /** Un-finishing: the same call with null, and no date to pick. */
  async function pickBackUp() {
    if (await attempt(() => journal.areaStates.setAreasFinished(AREA_GROUPS[group], null), m.write_failed())) {
      announce(m.area_picked_back_up());
    }
  }

  let suspendSheetOpen = $state(false);
  let suspendDateInput = $state(dateInputValueFromEpochDay(todayEpochDay()));

  /** The control's own way in, same as `openFinish` - today, editable. */
  function openSuspend() {
    suspendDateInput = dateInputValueFromEpochDay(today);
    suspendSheetOpen = true;
  }

  /* Closed once the write lands, `confirmFinish`'s own order, and the write
     goes through
     `answerOffer` so this is not a second path to `setAreasSuspended`
     alongside whatever a future automatic trigger might reach for. */
  async function confirmSuspend() {
    if (!suspendableAreas) return;
    const subject: SuspendedArea = {
      areas: suspendableAreas,
      epochDay: epochDayFromDateInputValueOrToday(suspendDateInput)
    };
    if (!(await sheetWrite.run(() => answerOffer(SUSPEND_OFFER, subject, 'confirm', journal), m.write_failed()))) return;
    suspendSheetOpen = false;
  }

  /** Resuming: the same call with null, and no date to pick - `pickBackUp`'s
      own shape. */
  function resume() {
    if (!suspendableAreas) return;
    const areas = suspendableAreas;
    void attempt(() => journal.areaStates.setAreasSuspended(areas, null), m.write_failed()).then((done) => {
      if (done) announce(m.area_picked_back_up());
    });
  }
</script>

<div class="screen-part area-finish" bind:this={root} style:display={held ? 'none' : null}>
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

  <!-- Keep one mounted card so resize can follow its changing rows.
       A keyed replacement would remove the outgoing card from flow
       during crossfade and collapse the gap briefly. While the notice
       asks the question, this card supplies a labelled decline row. -->
  <!-- Put in once the states have been read, holding what they say then,
       so arriving on the screen is not announced as a change. -->
  {#if statesQuery.value !== undefined}
    <p class="visually-hidden" role="status" data-area-state-line>{stateLine}</p>
  {/if}
  <div use:resize>
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      {#if finishedOn !== null}
        <ListRow
          key="area-finished"
          data-area-finished
          icon="flag"
          title={m.area_finish_done_title({ date: dayLong(finishedOn) })}
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
          title={m.area_finish_title()}
          chevron={false}
          onclick={openFinish}
        />
        {#if suspendableAreas}
          <ListRow
            key="area-suspend"
            data-area-suspend
            icon="pause"
            title={m.area_suspend_title()}
            chevron={false}
            onclick={openSuspend}
          />
        {/if}
      {/if}
    </ListCard>
  </div>
</div>

<Sheet busy={sheetWrite.busy} bind:open={sheetOpen} title={m.area_finish_title({ area: areaGroupName(group) })}>
  <h3>{m.area_finish_title({ area: areaGroupName(group) })}</h3>
  <p class="muted small area-finish-body">{m.area_finish_sheet_body()}</p>
  <Field label={m.area_finish_date_label()} id="area-finish-date">
    {#snippet children(id)}
      <DatePicker name="area-finish-date" max={dateInputValueFromEpochDay(today)} bind:value={dateInput} {id} />
    {/snippet}
  </Field>
  <div class="stack-3 area-finish-actions">
    <button class="btn btn-primary" data-area-finish-confirm disabled={sheetWrite.busy} onclick={confirmFinish}>
      <span>{OFFER.copy.confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={sheetWrite.busy} onclick={() => (sheetOpen = false)}>
      <span>{m.not_yet()}</span>
    </button>
  </div>
</Sheet>

{#if suspendableAreas}
  <Sheet busy={sheetWrite.busy} bind:open={suspendSheetOpen} title={m.area_suspend_title()}>
    <h3>{m.area_suspend_title()}</h3>
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
      <button class="btn btn-primary" data-area-suspend-confirm disabled={sheetWrite.busy} onclick={confirmSuspend}>
        <span>{SUSPEND_OFFER.copy.confirm()}</span>
      </button>
      <button class="btn btn-ghost" disabled={sheetWrite.busy} onclick={() => (suspendSheetOpen = false)}>
        <span>{m.not_yet()}</span>
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
