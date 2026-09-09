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

     ## The shape: a step, not a screen

     Redesign ticket 35 redraws it against `DIRECTION.md` rule 15, which
     names this route in as many words: a step is one purpose, no
     navigation and a short list, and it takes the field with a title, the
     flush list, and rule 12's foot with one control. So three things
     changed from the phase 8 drawing.

     **No back control and no tab bar.** The route is chromeless
     (`navigation/chromeless.ts`), which is the in-the-room view's own
     argument at the other end of the app: a bar floating over a focused
     moment is four more ways off it, and this one already has a way off
     written into its foot. The back chevron went with it - a step has no
     parent, and a moment that is linked from nowhere (ADR-0062) has
     nothing above it to go back to.

     **One list, not two surfaces.** Rule 12 forbids a notice on a step,
     and rule 15 says "the flush list" in the singular. What the phase 8
     review actually wanted from two surfaces was that ADR-0062's ordering
     be visible, and the flush list carries that without a container: the
     things the journal held take role 0 on their icon block and go
     somewhere, the two offers take role 1 and answer in place. Two
     colours and two row shapes, one run of hairlines.

     **The offer row keeps the labelled yes.** That is the other half of
     the same review - the first pass showed the no and hid the yes, an
     unlabelled tap on the row body with an unmarked x beside it - and
     losing `Notice` must not lose it. So an offer is rule 13's row with
     two labelled answers under it: the icon block and the title and the
     reason line are the row exactly as rules 6 and 13 draw them, and what
     rule 13 does not spell out is a row whose answer is two controls
     rather than a tick or a switch. This ticket adds that case to the
     row's, and `DIRECTION.md`'s own "What ticket 35 landed" section is
     where it is written down - the four shapes rule 13 lists are four, and
     a comment claiming one of them covers this would be citing authority
     the document has not given.

     The weighting: the yes in `--text` and the no in `--text-2`, both
     underlined at 2px with a 3px offset, which is `.kit-heading-action`'s
     treatment and phase 10's answer to a text action anywhere (an
     accent-coloured word is a fourth voice on a page that spends its
     colour as blocks). Both take the full 48px target, 20px apart.

     The nearest reference is Cash App's notification screen, which the
     fourth sweep read for ticket 31 - a title, a reason and two buttons,
     flush on the page. Its icon is not what the block here comes from:
     the sweep's own note rejects the bells and illustrations, and this
     block is rule 6's row icon, a 36px square of the area's stripe.

     Both are still registered offers (`offers.ts`), so a confirmation
     reaches its write through `answerOffer` like every other offer in the
     app, and each asks about exactly the item it is about: logging the
     dose from one slot says nothing about the slots around it, and closing
     one session asks about no other.

     ## The rows

     Five kinds, in one order, and the order is the argument. A letter that
     unlocked and a milestone date that came are things the journal was
     holding *for* the person; the era says where they are; a running timer
     and an unlogged slot are housekeeping. Reading the housekeeping first
     would make this a to-do list.

     A no is local and lives as long as the screen, per ADR-0062: the surface
     is a moment, so a preference recording the decline would be storing an
     answer nothing will ask again. `declined` is that, and the reason it
     holds keys rather than indexes is that the read re-runs under a write.

     ## Motion

     The screen is nothing but arriving things, so it takes ADR-0078's
     grammar whole rather than one signature moment.

     - **An item arrives** the way a day on the agenda does (redesign
       ticket 19): its 36px icon block clips open from its own left edge
       over `--dur-slow`, one `--stagger-step` per row and capped at the
       seventh, and the words beside it cut, as words do. The list itself
       comes in under the field's blind (ticket 28), which is the
       navigation's own movement and not this screen's.
     - **An offer opens** as every sheet in the app does, rising from the
       bottom edge (`sheetRise`).
     - **An answer lands** as the sheet leaves and the toast says what was
       written. The write is the state change; the toast is the only other
       signal there is, because the row it was about is on its way out in
       the same frame.
     - **An answered row leaves** by giving its own height back
       (`disclose`), the rows under it closing up with it rather than
       jumping. `resize` is not needed any more: there is no card holding
       a height, only a run of rows between two hairlines, and each of
       them owns the height it gives back.
     - **The empty state** arrives with the screen, because that is the
       only way most people reach it: an arrival is a link to the screen
       that owns it, not an offer, so a list holding one cannot be
       answered down to nothing. Where the gap held offers alone and every
       one of them is answered, the list does close to nothing and the
       line changes where it stands, which is why the line is the
       screen's own rather than a surface inside the list.

     Reduced motion clamps every one of these: the clip becomes a cut, the
     disclose a removal, the sheet a fade. Recorded frame by frame by
     `tests/return-motion-gallery.mjs`. */
  import { goto } from '$app/navigation';
  import { navigating } from '$app/state';
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
  import { disclose } from '$lib/motion/reveal';
  import { roleAttrs } from '$lib/components/kit/role';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import InjectionSiteMap from '$lib/components/InjectionSiteMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
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

  /** Whether an item is one of the two the screen can answer in place.
      `comingBack.ts` already orders the list so these come last, which is
      ADR-0062's argument - a letter from somebody's past self is not a peer
      of a binder timer - and this is what draws the difference: an offer
      takes role 1 and two labelled controls, everything else takes role 0
      and a chevron to the screen that owns it. Two colours and two shapes
      inside one flush list, which is what rule 15 leaves room for; the two
      cards that used to carry the split are what rule 12 took away. */
  const isOffer = (item: WaitingItem) => item.kind === 'wear-session' || item.kind === 'dose';

  /* The line under the field, which is rule 12's one line and the same slot
     whether or not anything is waiting. Empty is a state of this screen
     rather than a screen of its own: the list closing under the line is the
     movement, and a titled notice in the space it gave back would be the
     second heading rule 12 forbids and the contradiction phase 8's own
     review found under "Waiting for you".

     `loading` is asked rather than `showing.length` alone, or the true
     sentence would flash over a read still in flight. */
  let line = $derived(
    !waitingRows.loading && showing.length === 0 ? m.coming_back_empty_body() : m.coming_back_intro()
  );

  /* The same escape `disclose` documents: Svelte runs an out-transition when
     the *page* unmounts these rows during a navigation, not only when a row
     is answered, and a screen leaving should not spend --dur-fast collapsing
     five rows behind the one that is arriving. */
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
      /* Said out loud, because the only other signal is the row
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
      <!-- One flush list, in the order comingBack.ts put the items in
           (ADR-0062). Each row owns the height it gives back when it is
           answered, and the block on it clips open from its own left edge
           one stagger step after the row above (rule 10, ticket 19's
           agenda). Capped at the seventh where the tiles' stagger is.

           Guarded on the count rather than left to the gate: a flush list
           is its rows between two hairlines, so a list with no rows in it
           is two hairlines 2px apart. Found on the flipbook (ticket 35),
           where declining the last offer left them behind under the line -
           the gate cannot catch it, because the read still has rows and it
           is `declined` that emptied the list. -->
      {#if showing.length > 0}
        <ListCard>
          {#each showing as item, i (waitingItemKey(item))}
            <div
              class="rows-divide"
              transition:disclose={panel}
              style:--row-index={Math.min(6, i)}
              {...roleAttrs(roleAt(activeFlag.roles, isOffer(item) ? 1 : 0))}
            >
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
              {:else if item.kind === 'era'}
                <!-- The era is neither an arrival nor an offer: it is where
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
              {:else if item.kind === 'wear-session'}
                {@render offer({
                  id: waitingItemKey(item),
                  kind: 'wear-session',
                  title: wearReturningRowTitle(item.wearKind),
                  reason: m.coming_back_wear_row_sub({ date: dayLong(item.startEpochDay) }),
                  yes: WEAR_OFFER.copy.confirm(),
                  onYes: () => openWear(item),
                  no: WEAR_OFFER.copy.decline(),
                  onNo: () => decline(item)
                })}
              {:else}
                {@render offer({
                  id: waitingItemKey(item),
                  kind: 'dose',
                  title: m.coming_back_dose_row({ date: dayLong(item.slotEpochDay) }),
                  reason: m.coming_back_dose_row_sub({ amount: `${item.dose} ${item.doseUnit}` }),
                  yes: DOSE_OFFER.copy.title(),
                  onYes: () => openDose(item),
                  no: DOSE_OFFER.copy.decline(),
                  onNo: () => decline(item)
                })}
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

<!-- An offer, drawn as Cash App's permission shape (rule 13, the fourth
     Mobbin sweep): the icon block, the title, one reason line, and the two
     labelled controls under them. The yes is labelled and visible, which is
     what the phase 8 review asked for and what carrying the answer on the
     row body alone would give back. Not a ListRow: that row is one control
     across its whole width, and this one is two. -->
{#snippet offer(o: {
  /** The item's own key, for the group's label association. Two wear
      sessions can be waiting at once - a binder and a tucking session - so
      the kind is not unique and cannot be the id. */
  id: string;
  /** The union the read already carries, not a bare string: the two kinds
      an offer can be are the two `comingBack.ts` can answer in place, and
      the handle this stamps has to be one of them. */
  kind: 'wear-session' | 'dose';
  title: string;
  reason: string;
  yes: string;
  onYes: () => void;
  no: string;
  onNo: () => void;
})}
  <!-- A group named by its own title. Without it a screen reader running
       the row list hears "Leave it" three times with nothing to tell them
       apart, which is the same problem ListRow's `action` prop documents
       for an unlabelled icon button - here the labels exist and it is which
       item they belong to that goes missing. -->
  <div
    class="return-offer"
    role="group"
    aria-labelledby="coming-back-offer-{o.id}"
    data-coming-back-item={o.kind}
  >
    <div class="return-offer-said">
      <span class="kit-row-ico"><Icon name="clock" size={22} /></span>
      <span class="kit-row-text">
        <span class="kit-row-title" id="coming-back-offer-{o.id}">{o.title}</span>
        <span class="kit-row-sub">{o.reason}</span>
      </span>
    </div>
    <div class="return-offer-answers">
      <!-- No `press` class: press.css has been opt-out since phase 5 ticket
           15, and the marker some older markup still carries names no rule
           of its own. These two are ordinary buttons, so they take the
           default depth by existing - which is right for a control the
           width of its own label, and wrong only for a row the width of
           the screen (which is what ListRow opts out of). -->
      <button type="button" class="return-yes" data-coming-back-yes={o.kind} onclick={o.onYes}>{o.yes}</button>
      <button type="button" class="return-no" data-coming-back-no={o.kind} onclick={o.onNo}>{o.no}</button>
    </div>
  </div>
{/snippet}

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
      <!-- Cancel, not the offer's own decline. The row behind this sheet now
           shows "Leave it" as a labelled control of its own, and it answers
           the offer: it takes the row away and the app stops asking. Closing
           the sheet does neither, so it may not wear the same words. -->
      <button class="btn btn-ghost" onclick={() => (doseDraft = null)}>
        <span>{m.cancel()}</span>
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
      <!-- Cancel rather than the offer's decline, for the reason the dose
           sheet gives: the row behind this one carries "Leave it running" as
           the answer, and closing a sheet is not answering. -->
      <button class="btn btn-ghost" onclick={() => (wearDraft = null)}>
        <span>{m.cancel()}</span>
      </button>
    </div>
  {/if}
</Sheet>

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

     :global because most of these squares are drawn inside ListRow and a
     scoped selector would never reach them; the offer's own square is in
     this file and the same selector catches both. Here rather than in
     kit.css because a row icon is not a block that moves anywhere else in
     the app yet - that is ticket 20's sweep to make, not this ticket's. */
  .screen-return :global(.kit-row-ico) {
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--row-index, 0) * var(--stagger-step));
  }

  /* ---- an offer ----------------------------------------------------
     Rule 13's row - the icon block, the title, one reason line - with two
     labelled controls under it, which is the case rule 13 does not list and
     this ticket adds. Its own padding rather than .kit-row's, because it is
     two rows of content and the hairline between it and its neighbours is
     .rows-divide's. */
  .return-offer {
    padding: var(--space-2) 0;
  }

  .return-offer-said {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
  }

  /* Indented to the text column, so the two answers line up under what they
     are answering rather than under the block. 36 is the icon square and 12
     is the row's gap. */
  .return-offer-answers {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding-left: calc(36px + var(--space-3));
  }

  /* Underlined ink rather than the accent, which is what phase 10 does with
     a text action everywhere else (kit.css, .kit-heading-action): on a page
     whose colour is spent as blocks, an accent-coloured word is a fourth
     voice. The yes is --text and the no is --text-2, which is the whole of
     the weighting between them - the no is present, never hidden, and never
     the louder of the two. */
  .return-yes,
  .return-no {
    min-height: var(--touch-target);
    display: inline-flex;
    align-items: center;
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
  }

  .return-yes {
    color: var(--text);
  }

  .return-no {
    color: var(--text-2);
  }

  /* ---- the foot ----------------------------------------------------
     Rule 12's foot with rule 15's one control, pinned to the window's
     bottom edge above a hairline and never moving between states.

     `margin-top: auto` puts it on the bottom edge of a screen whose list is
     short; `position: sticky` keeps it there when the list is long enough
     to scroll under it. The negative offset is the one .editor-savebar
     documents: a sticky bottom is measured from the scroll port's padding
     edge, and the region already holds --nav-clearance of padding there, so
     a foot that means to sit *on* the edge gives that breath back. The
     system inset stays, as the foot's own padding. */
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
