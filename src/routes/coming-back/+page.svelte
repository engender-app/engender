<script lang="ts">
  /* What was waiting when somebody came back (phase 8 features ticket 05,
     ADR-0062, ADR-0045).

     The screen the return moment opens, and the app's only surface that
     exists because somebody was *away*. Everything about how it reads is
     decided by one sentence: it could be opened by a person who stopped
     journalling because they were having the worst month of their life. So
     it states what the journal held onto, and nothing anywhere on it counts
     what did not happen - there is no number to draw, because
     `comingBack.ts` computes none.

     ## Why it is a screen at all

     Not a Home block: Home is built for somebody who was here yesterday, and
     a returning person needs a different frame than a tile wedged into it.
     Not a hub row either, and that is the sharper half of ADR-0062 - a place
     you can go and check what is waiting becomes a place that accumulates
     what you have not done, visited most by exactly the person it is worst
     for. So it opens once per gap, from the shell (+layout.svelte), and is
     linked from nowhere.

     Reached by hand it still renders. A route that refuses to draw is worse
     in a back stack than an honest empty state, and the empty state here is
     the true sentence: the app is not holding anything for you right now.

     ## The rows

     Five kinds, in one order, and the order is the argument. A letter that
     unlocked and a milestone date that came are things the journal was
     holding *for* the person; the era says where they are; a running timer
     and an unlogged slot are housekeeping. Reading the housekeeping first
     would make this a to-do list.

     What arrived is a list card of rows, each going to the screen that owns
     it and writing nothing. What can be tidied is one `Notice` each, and
     the difference in surface is the whole point: the first pass had all
     five as rows in two cards, and a design review found that the ordering
     ADR-0062 calls "the argument" was invisible - a role paints a row's icon
     disc, not the card behind it, so in dark the two cards were identical
     and the letter from somebody's past self read as a peer of a binder
     timer. `Notice` is the app's own shape for "here is something, and here
     is the one thing you can do about it", which is exactly what an offer
     is; it carries the flag stripe, a labelled action and a dismiss, and it
     leaves through its own `disclose` so answering collapses the space it
     held instead of dropping the page a frame.

     It also fixes what the same review called showing the no and hiding the
     yes. As rows, the writing action was an unlabelled tap on the row body
     with an unmarked x beside it - the shape AreaFinish.svelte's own comment
     argues against. Notice's `action` is the labelled yes.

     Both are registered offers (`offers.ts`), so a confirmation reaches its
     write through `answerOffer` like every other offer in the app, and each
     asks about exactly the item it is about: logging the dose from one slot
     says nothing about the slots around it, and closing one session asks
     about no other.

     A no is local and lives as long as the screen, per ADR-0062: the surface
     is a moment, so a preference recording the decline would be storing an
     answer nothing will ask again. `declined` is that, and the reason it
     holds keys rather than indexes is that the read re-runs under a write.

     ## Motion

     Tier 3, change within a screen. The card stays mounted and `resize`
     carries its height as rows leave, the same reason AreaFinish.svelte
     gives: a `{#key}` would destroy and rebuild the card, and the rows
     answered here leave one at a time under a person's own tap. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { wearReturningRowTitle } from '$lib/data/vocabulary/wearLabels';
  import { readReturnGap, readWhatIsWaiting, WAITING_TABLES } from '$lib/data/comingBackReads';
  import { waitingItemKey, type WaitingItem } from '$lib/data/comingBack';
  import { OFFERS, answerOffer, type ReturningDose, type ReturningWearSession } from '$lib/data/offers';
  import { fmtDay } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValueOrToday,
    startOfDayTimestamp,
    todayEpochDay
  } from '$lib/data/epochDay';
  import {
    APPLICATION_SITES,
    matchDoseRoute,
    type ApplicationSiteKey,
    type InjectionSiteKey
  } from '$lib/data/doseSchedule';
  import { ROUTE_OPTIONS, applicationSiteLabel, vehicleLabel } from '$lib/data/vocabulary/doseLabels';
  import type { InjectionVehicle } from '$lib/data/types';
  import { toast } from '$lib/stores/toasts.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { resize } from '$lib/motion/reveal';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import InjectionSiteMap from '$lib/components/InjectionSiteMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const today = todayEpochDay();
  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const DOSE_OFFER = OFFERS['returning-dose'];
  const WEAR_OFFER = OFFERS['returning-wear-session'];

  /* The gap this screen is about, decided once and held.

     A promise made at mount rather than a second live query, and it is
     load-bearing. Backfilling a dose writes a row *inside* the gap, so the
     newest write in the journal moves forward - and a screen that re-derived
     its gap on every write would have decided, mid-visit, that this was no
     longer a return: the letter and the milestone the person had not read
     yet disappearing because they logged a dose. A return is one gap. The
     items under it re-read as often as the journal changes. */
  const gap = readReturnGap(journal, today);

  /* Seeded rather than left to discover itself: every one of `readWhatIsWaiting`'s
     five reads sits past the gap's own `await`, so an unseeded query would
     re-run once for nothing on every mount (phase 8 audit ticket 14). */
  let waitingQuery = liveQuery(async (j) => {
    const since = await gap;
    return since === null ? null : readWhatIsWaiting(j, today, since);
  }, WAITING_TABLES);
  let waitingRows = liveListIn(waitingQuery, (surface) => surface?.items ?? []);

  /** The rows the person has said no to, for as long as this screen is up. */
  let declined = $state(new Set<string>());
  let showing = $derived(waitingRows.rows.filter((item) => !declined.has(waitingItemKey(item))));

  /* Two groups, in the order `comingBack.ts` already put the items in.
     Split here rather than only in that order because an order nobody can
     see is not an order: a letter that unlocked is something the journal was
     holding for the person and a slot that went unlogged is a chore, and one
     undifferentiated run of nine rows says they are the same kind of thing.
     Two cards, no headings - a heading over the second group would have to
     name it, and every honest name for it ("loose ends", "to sort out") is
     the bill this screen is written not to be. */
  let arrivals = $derived(showing.filter((item) => item.kind !== 'wear-session' && item.kind !== 'dose'));
  let chores = $derived(showing.filter((item) => item.kind === 'wear-session' || item.kind === 'dose'));

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

  function decline(item: WaitingItem) {
    declined = new Set(declined).add(waitingItemKey(item));
  }

  /* ---- the dose slot ---------------------------------------------------
     What the sheet collects is what only the person knows. The day is not
     editable and is not meant to be: the slot *is* the item being asked
     about, and a different day would be a different question. The amount is
     the schedule's own figure for that slot and stays editable, since a
     schedule says what was meant to happen rather than what did. */
  interface DoseDraft {
    item: Extract<WaitingItem, { kind: 'dose' }>;
    route: ReturningDose['route'];
    dose: string;
    doseUnit: string;
    injectionSite: InjectionSiteKey | '';
    applicationSite: ApplicationSiteKey | '';
    vehicle: InjectionVehicle;
  }

  let doseDraft = $state<DoseDraft | null>(null);

  function openDose(item: Extract<WaitingItem, { kind: 'dose' }>) {
    doseDraft = {
      item,
      /* The episode's route is free text and a dose's is one of six keys, so
         it is read rather than copied - the same call the dose log's own
         editor makes, with the same fallback where the words name no route
         or two of them. */
      route: matchDoseRoute(item.episodeRoute, ROUTE_OPTIONS) ?? 'oral',
      dose: String(item.dose),
      doseUnit: item.doseUnit,
      injectionSite: '',
      applicationSite: '',
      /* Oil, which is what the dose log falls back to with no injection
         history to read one off. Asked here rather than defaulted silently:
         this screen has no dose history at hand, and a vehicle guessed onto
         a five-week-old injection is a fact nobody stated. */
      vehicle: 'oil'
    };
  }

  let doseIsInjection = $derived(doseDraft?.route === 'im' || doseDraft?.route === 'sc');
  let doseIsTopical = $derived(doseDraft?.route === 'patch' || doseDraft?.route === 'gel');
  let doseCanSave = $derived(
    doseDraft !== null &&
      !Number.isNaN(parseFloat(doseDraft.dose)) &&
      doseDraft.doseUnit.trim() !== '' &&
      (!doseIsInjection || doseDraft.injectionSite !== '') &&
      (!doseIsTopical || doseDraft.applicationSite !== '')
  );

  /** Noon on the slot's day, local. A dose event's timestamp is load-bearing
      (types.ts) and nobody remembers the hour five weeks later, so the middle
      of the day is the one choice that does not read as a claim about when it
      was taken. Off `startOfDayTimestamp`, never off `epochDay * 86_400_000`,
      which is midnight UTC and lands on the day before in half the world
      (ADR-0001). */
  const slotTimestamp = (epochDay: number) => startOfDayTimestamp(epochDay) + 12 * 3_600_000;

  /* Built into the union's own arms rather than one object with every field:
      `DoseEventInput` refuses a dose carrying a site its route has no place
      for, which is what stops a patch site travelling on an oral dose
      because a draft field was left set. */
  function doseSubject(draft: DoseDraft): ReturningDose | null {
    const shared = {
      timestamp: slotTimestamp(draft.item.slotEpochDay),
      dose: parseFloat(draft.dose),
      doseUnit: draft.doseUnit.trim(),
      drug: draft.item.drug || null
    };
    if (draft.route === 'im' || draft.route === 'sc') {
      if (draft.injectionSite === '') return null;
      return { ...shared, route: draft.route, injectionSite: draft.injectionSite, vehicle: draft.vehicle };
    }
    if (draft.route === 'patch' || draft.route === 'gel') {
      if (draft.applicationSite === '') return null;
      return { ...shared, route: draft.route, applicationSite: draft.applicationSite };
    }
    return { ...shared, route: draft.route };
  }

  /* Closed before the write, the order every other offer's sheet keeps: a
     second tap finds no open sheet rather than a second dose in flight. */
  async function confirmDose() {
    if (!doseDraft) return;
    const subject = doseSubject(doseDraft);
    const day = doseDraft.item.slotEpochDay;
    doseDraft = null;
    if (await answerOffer(DOSE_OFFER, subject, 'confirm', journal)) {
      /* Said out loud, because the only other signal is a notice
         disappearing. `answerOffer`'s return value is what makes this
         honest: it is false on a stale confirm, and a screen that toasted
         regardless would be claiming a write that never happened. */
      toast(m.coming_back_dose_saved({ date: dayLong(day) }));
    }
  }

  /* ---- the running wear session ---------------------------------------- */
  let wearDraft = $state<{ item: Extract<WaitingItem, { kind: 'wear-session' }>; end: string } | null>(null);

  /** Opened with nothing in the field. Every other offer in the app opens
      pre-filled, and this is the one that must not: the app knows when the
      session started and nothing at all about when it came off, and a date
      already sitting in the box is a guess the person has to notice before
      they can disagree with it. */
  function openWear(item: Extract<WaitingItem, { kind: 'wear-session' }>) {
    wearDraft = { item, end: '' };
  }

  let wearCanSave = $derived(wearDraft !== null && wearDraft.end !== '');

  async function confirmWear() {
    if (!wearDraft) return;
    const subject: ReturningWearSession = {
      sessionId: wearDraft.item.sessionId,
      wearKind: wearDraft.item.wearKind,
      startTimestamp: wearDraft.item.startTimestamp,
      endEpochDay: epochDayFromDateInputValueOrToday(wearDraft.end)
    };
    wearDraft = null;
    if (await answerOffer(WEAR_OFFER, subject, 'confirm', journal)) {
      toast(m.coming_back_wear_saved({ date: dayLong(subject.endEpochDay) }));
    }
  }
</script>

<ScreenHeader title={m.coming_back_title()} back="/" screen="coming-back" />

<ReadGate read={waitingRows} variant="card" count={3}>
  {#snippet empty()}
    <!-- A remark rather than a titled notice, which is Notice's own
         distinction: reached by hand with nothing waiting, a heading here
         sat directly under the screen's "Waiting for you" and read as a
         contradiction of it. One sentence, and the way back. -->
    <Notice
      key="coming-back-empty"
      icon="info"
      role={roleAt(activeFlag.roles, 0)}
      text={m.coming_back_empty_body()}
      action={{ label: m.nav_home(), href: '/', primary: true }}
    />
  {/snippet}

  {#snippet rows()}
    <div class="screen-part">
      <p class="muted small coming-back-intro">{m.coming_back_intro()}</p>

      <!-- What the journal was holding *for* the person. Kept mounted while
           its rows leave under their own taps: `resize` animates a box that
           changes size under its own content, which is what a card losing a
           row is, and a `{#key}` would have destroyed and rebuilt it. -->
      {#if arrivals.length > 0}
        <div use:resize>
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each arrivals as item (waitingItemKey(item))}
              {#if item.kind === 'letter'}
                <ListRow
                  key="coming-back-letter"
                  data-coming-back-item="letter"
                  icon="book"
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
              {:else}
                <!-- The era is neither an arrival nor a chore: it is where
                     the person is, and it sits with the arrivals because it
                     is the one row on the screen that is theirs rather than
                     the app's. -->
                <ListRow
                  key="coming-back-era"
                  data-coming-back-item="era"
                  icon="columns"
                  title={item.name}
                  subtitle={item.startEpochDay === null
                    ? m.coming_back_era_sub_no_start()
                    : m.coming_back_era_sub({ date: dayLong(item.startEpochDay) })}
                  href="/transition/eras"
                />
              {/if}
            {/each}
          </ListCard>
        </div>
      {/if}
    </div>

    <!-- What can be tidied, one Notice each. Its own `screen-part`, which
         is what stamps the space above it (ADR-0038: cross-block spacing by
         attribute, never a margin a screen invents). Role 1 rather than the
         arrivals' role 0, so the two halves of the screen are two areas the
         way every other screen's are. -->
    {#if chores.length > 0}
      <div class="screen-part stack-3">
        {#each chores as item (waitingItemKey(item))}
          {#if item.kind === 'wear-session'}
            <Notice
              key="coming-back-wear"
              data-coming-back-item="wear-session"
              icon="clock"
              role={roleAt(activeFlag.roles, 1)}
              title={wearReturningRowTitle(item.wearKind)}
              text={m.coming_back_wear_row_sub({ date: dayLong(item.startEpochDay) })}
              action={{ label: WEAR_OFFER.copy.confirm(), onclick: () => openWear(item) }}
              dismiss={{ label: WEAR_OFFER.copy.decline(), onclick: () => decline(item) }}
            />
          {:else}
            <Notice
              key="coming-back-dose"
              data-coming-back-item="dose"
              icon="clock"
              role={roleAt(activeFlag.roles, 1)}
              title={m.coming_back_dose_row({ date: dayLong(item.slotEpochDay) })}
              text={m.coming_back_dose_row_sub({ amount: `${item.dose} ${item.doseUnit}` })}
              action={{ label: DOSE_OFFER.copy.title(), onclick: () => openDose(item) }}
              dismiss={{ label: DOSE_OFFER.copy.decline(), onclick: () => decline(item) }}
            />
          {/if}
        {/each}
      </div>
    {/if}

    <!-- A way off the screen that is not the back chevron. Somebody who has
         read this and wants none of it should not have to work out that back
         is how you agree to nothing. -->
    <div class="screen-part">
      <button class="btn btn-ghost coming-back-done" data-coming-back-done onclick={() => goto('/')}>
        <span>{m.coming_back_done_action()}</span>
      </button>
    </div>
  {/snippet}
</ReadGate>

<Sheet bind:open={() => doseDraft !== null, (open) => !open && (doseDraft = null)} title={DOSE_OFFER.copy.title()}>
  {#if doseDraft}
    <h3>{DOSE_OFFER.copy.title()}</h3>
    <p class="muted small coming-back-sheet-body">
      {m.coming_back_dose_sheet_body({ date: dayLong(doseDraft.item.slotEpochDay) })}
    </p>

    <Field label={m.dose_amount_label()} id="coming-back-dose-amount">
      {#snippet children(id)}
        <!-- `.input` on both, which is where the app's border, background
             and 48px floor live (components.css). Written without it first,
             and the two bare inputs came out 21px tall with a native spinner
             on one and the unit field clipped off the right edge of the
             sheet - 378px of intrinsic width in a 350px row.

             Deliberately not the dose log's own `.dose-amount` box, which is
             a single bordered shell the two fields sit inside, sized to
             their content. That is fifty lines of measured CSS for a
             screen whose sheet is mostly this field; here the amount is one
             of four things being confirmed, and the ordinary input the rest
             of the app uses is the right weight. -->
        <div class="coming-back-amount">
          <input
            class="input coming-back-amount-num"
            type="number"
            inputmode="decimal"
            {id}
            name="coming-back-dose-amount"
            placeholder={m.dose_amount_placeholder()}
            bind:value={doseDraft!.dose}
          />
          <input
            class="input coming-back-amount-unit"
            name="coming-back-dose-unit"
            aria-label={m.dose_unit_label()}
            placeholder={m.dose_unit_placeholder()}
            bind:value={doseDraft!.doseUnit}
          />
        </div>
      {/snippet}
    </Field>

    {#if doseIsInjection}
      <!-- The rotation map as a picker, with no recency ramp behind it: the
           dose log is where the rotation is read, and pulling every
           injection ever logged into this screen to shade twelve dots is a
           table scan for a decoration. -->
      <Field label={m.dose_injection_site_label()} legend>
        {#snippet children()}
          <InjectionSiteMap
            value={doseDraft!.injectionSite}
            onChange={(site) => doseDraft && (doseDraft.injectionSite = site)}
          />
        {/snippet}
      </Field>
      <Field label={m.dose_vehicle_label()} legend>
        {#snippet children(id)}
          <div class="tag-row" role="group" aria-labelledby={id}>
            {#each ['oil', 'aqueous'] as const as vehicle (vehicle)}
              <button
                type="button"
                class="tag-chip press"
                class:is-selected={doseDraft!.vehicle === vehicle}
                aria-pressed={doseDraft!.vehicle === vehicle}
                data-coming-back-vehicle={vehicle}
                onclick={() => doseDraft && (doseDraft.vehicle = vehicle)}
              >
                {vehicleLabel(vehicle)}
              </button>
            {/each}
          </div>
        {/snippet}
      </Field>
    {/if}

    {#if doseIsTopical}
      <Field label={m.dose_app_site_label()} legend>
        {#snippet children(id)}
          <div class="tag-row" role="group" aria-labelledby={id}>
            {#each APPLICATION_SITES as site (site)}
              <button
                type="button"
                class="tag-chip press"
                class:is-selected={doseDraft!.applicationSite === site}
                aria-pressed={doseDraft!.applicationSite === site}
                data-coming-back-app-site={site}
                onclick={() => doseDraft && (doseDraft.applicationSite = site)}
              >
                {applicationSiteLabel(site)}
              </button>
            {/each}
          </div>
        {/snippet}
      </Field>
    {/if}

    <div class="stack-3 coming-back-sheet-actions">
      <button class="btn btn-primary" data-coming-back-dose-confirm disabled={!doseCanSave} onclick={confirmDose}>
        <span>{DOSE_OFFER.copy.confirm()}</span>
      </button>
      <button class="btn btn-ghost" onclick={() => (doseDraft = null)}>
        <span>{DOSE_OFFER.copy.decline()}</span>
      </button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={() => wearDraft !== null, (open) => !open && (wearDraft = null)} title={WEAR_OFFER.copy.title()}>
  {#if wearDraft}
    <h3>{WEAR_OFFER.copy.title()}</h3>
    <p class="muted small coming-back-sheet-body">{m.coming_back_wear_sheet_body()}</p>
    <Field label={m.coming_back_wear_end_label()} id="coming-back-wear-end">
      {#snippet children(id)}
        <DatePicker
          name="coming-back-wear-end"
          min={dateInputValueFromEpochDay(wearDraft!.item.startEpochDay)}
          max={dateInputValueFromEpochDay(today)}
          bind:value={wearDraft!.end}
          {id}
        />
      {/snippet}
    </Field>
    <!-- Why the button below is refused. Both sheets here open with a
         disabled primary, which no other sheet in the app does - everywhere
         else the save is disabled only after somebody has cleared a field -
         so the reason has to be on screen rather than inferred from a greyed
         button.

         A paragraph rather than Field's own `hint` prop, which is the pattern
         `regimen_end_hint` and ticket 13's stock-opened field both use:
         Field's non-legend branch compiles `{label}{#if hint} <span>` with
         the space dropped, so the label rendered as "The day it came
         offneeded before this can be closed". Not fixed in Field itself -
         131 call sites, and the mechanism is unconfirmed. -->
    <p class="muted small coming-back-field-hint">{m.coming_back_wear_end_hint()}</p>
    <div class="stack-3 coming-back-sheet-actions">
      <button class="btn btn-primary" data-coming-back-wear-confirm disabled={!wearCanSave} onclick={confirmWear}>
        <span>{WEAR_OFFER.copy.confirm()}</span>
      </button>
      <button class="btn btn-ghost" onclick={() => (wearDraft = null)}>
        <span>{WEAR_OFFER.copy.decline()}</span>
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .coming-back-intro {
    margin-bottom: var(--space-4);
  }

  .coming-back-done {
    width: 100%;
  }

  .coming-back-sheet-body {
    margin-bottom: var(--space-4);
  }

  .coming-back-sheet-actions {
    margin-top: var(--space-4);
  }

  /* Pulled up under the field it belongs to, the same offset the two other
     screens using this pattern set inline. Here rather than inline because
     a screen with a style block has somewhere to put it. */
  .coming-back-field-hint {
    margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  }

  .coming-back-amount {
    display: flex;
    gap: var(--space-2);
  }

  /* `min-width: 0` because `.input` is `width: 100%` and a flex item's
     automatic minimum is its content width - without it the pair overflows
     the row rather than sharing it. The unit is the narrower of the two:
     "mg" against "4.5". */
  .coming-back-amount-num {
    flex: 2 1 0;
    min-width: 0;
  }

  .coming-back-amount-unit {
    flex: 1 1 0;
    min-width: 0;
  }

  /* A mouse affordance on a control that declares inputmode="decimal", and
     the same removal the dose log makes for the same reason. */
  .coming-back-amount-num::-webkit-outer-spin-button,
  .coming-back-amount-num::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }
</style>
