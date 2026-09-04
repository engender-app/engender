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

     The first three rows go somewhere - the screen that owns each kind - and
     write nothing. The last two are registered offers (`offers.ts`), so a
     confirmation reaches its write through `answerOffer` like every other
     offer in the app, and each one asks about exactly the item its row is
     about: logging the dose from one slot says nothing about the slots
     around it, and closing one session asks about no other.

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
  import { readWhatIsWaiting } from '$lib/data/comingBackReads';
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

  let waitingQuery = liveQuery((j) => readWhatIsWaiting(j, today));
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
    doseDraft = null;
    await answerOffer(DOSE_OFFER, subject, 'confirm', journal);
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
      startTimestamp: wearDraft.item.startTimestamp,
      endEpochDay: epochDayFromDateInputValueOrToday(wearDraft.end)
    };
    wearDraft = null;
    await answerOffer(WEAR_OFFER, subject, 'confirm', journal);
  }
</script>

<ScreenHeader title={m.coming_back_title()} back="/" screen="coming-back" />

<ReadGate read={waitingRows} variant="card" count={3}>
  {#snippet empty()}
    <Notice
      key="coming-back-empty"
      icon="info"
      role={roleAt(activeFlag.roles, 0)}
      title={m.coming_back_empty_title()}
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
                  href="/settings/letters"
                />
              {:else if item.kind === 'milestone'}
                <ListRow
                  key="coming-back-milestone"
                  data-coming-back-item="milestone"
                  icon="flag"
                  title={item.name}
                  subtitle={m.coming_back_milestone_sub({ date: dayLong(item.epochDay) })}
                  href="/settings/milestones"
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
                  href="/settings/eras"
                />
              {/if}
            {/each}
          </ListCard>
        </div>
      {/if}
    </div>

    <!-- The two offers, in a section of their own so the break between them
         and the rows above is visible rather than only ordered. Its own
         `screen-part`, which is what stamps the space between the two
         (ADR-0038: cross-block spacing by attribute, never a margin a screen
         invents). -->
    {#if chores.length > 0}
      <div class="screen-part">
        <div use:resize>
          <ListCard role={roleAt(activeFlag.roles, 1)}>
            {#each chores as item (waitingItemKey(item))}
              {#if item.kind === 'wear-session'}
                <!-- 'stop' is the glyph the wear tile's own control already
                     carries, so the gesture this row opens is one the person
                     has met before.

                     The no is an unmarked x here, which is the shape
                     AreaFinish.svelte deliberately refused - and the reason
                     splits the two rather than contradicting either. There
                     the x would have spent a decision the app never asks
                     again, so the no had to be a labelled row. Here it means
                     what it means on every notice in the app: I have read
                     this, take it off my screen. Nothing is stored, and the
                     same row is here again on the next return if it is still
                     waiting. -->
                <ListRow
                  key="coming-back-wear"
                  data-coming-back-item="wear-session"
                  icon="stop"
                  title={m.coming_back_wear_row()}
                  subtitle={m.coming_back_wear_row_sub({ date: dayLong(item.startEpochDay) })}
                  chevron={false}
                  onclick={() => openWear(item)}
                  action={{
                    icon: 'x',
                    label: WEAR_OFFER.copy.decline(),
                    onclick: () => decline(item),
                    attrs: { 'data-coming-back-decline': 'wear-session' }
                  }}
                />
              {:else}
                <ListRow
                  key="coming-back-dose"
                  data-coming-back-item="dose"
                  icon="clock"
                  title={m.coming_back_dose_row({ date: dayLong(item.slotEpochDay) })}
                  subtitle={m.coming_back_dose_row_sub({ amount: `${item.dose} ${item.doseUnit}` })}
                  chevron={false}
                  onclick={() => openDose(item)}
                  action={{
                    icon: 'x',
                    label: DOSE_OFFER.copy.decline(),
                    onclick: () => decline(item),
                    attrs: { 'data-coming-back-decline': 'dose' }
                  }}
                />
              {/if}
            {/each}
          </ListCard>
        </div>
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
        <div class="coming-back-amount">
          <input
            type="number"
            inputmode="decimal"
            {id}
            name="coming-back-dose-amount"
            placeholder={m.dose_amount_placeholder()}
            bind:value={doseDraft!.dose}
          />
          <input
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

  .coming-back-amount {
    display: flex;
    gap: var(--space-2);
  }
</style>
