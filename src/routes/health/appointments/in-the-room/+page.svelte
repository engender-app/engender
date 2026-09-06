<script lang="ts">
  /* In the room (phase 8 features ticket 60, ADR-0066): the standing prep
     list, one question per screen, at a size somebody can read while a
     doctor is talking to them.

     This holds nothing of its own. The questions are the prep list's
     (checklists.ts), the appointment is the record's (appointments.ts), and
     what gets jotted is the debrief's, pre-filled through the deep link
     the debrief offer already uses. No table, no row, no column: what is
     added here is a shape for a list that already existed.

     WHY THE SCREEN IS CHROMELESS. The tab bar floats over every other
     screen, and here it would be four ways to leave by accident in the
     middle of a sentence. The way out is one control at the foot of the
     screen, and it is the only one - the header carries no back arrow,
     because two ways out is the thing the ticket refuses.

     WHY ADVANCING IS FREE. Somebody who wants nothing but their questions
     at 32px pays no tap cost at all: the field under each question is
     optional, an untouched one leaves nothing behind (answeredQuestions,
     debriefNote.ts), and there is no counter or progress bar anywhere,
     because a bar that fills is a chore being tracked.

     WHY THE ANSWERS ARE PER QUESTION. One free note loses which answer went
     with which question, and that pairing is the whole value of reading
     this back at debrief time. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { appointmentOnDay } from '$lib/data/journal/appointments';
  import { answeredQuestions } from '$lib/data/journal/debriefNote';
  import { holdRoomAnswers } from '$lib/stores/inTheRoom';
  import { smartBack } from '$lib/navigation/smart-back';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { wipe } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const today = todayEpochDay();

  let checklistQuery = liveList((j) => j.checklists.getStandaloneChecklist().then((c) => c?.items));
  let items = $derived(checklistQuery.rows);

  /* The appointment this room is: the one on today, or none. Read through
     the same boundary index the prep screen and the debrief offer share
     (appointments.ts), so the three cannot disagree about which appointment
     is which.

     None is an ordinary state, not a failure. The list is standing and
     unowned (ADR-0066), so reading it on a day with nothing booked is
     allowed - somebody rehearsing the night before is reading the same
     questions. What that day has nowhere to put is an answer, and the
     screen says so by not offering a field rather than by taking one and
     dropping it. */
  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let todaysAppointment = $derived(appointmentOnDay(appointmentsQuery.rows, today));

  let index = $state(0);
  /* Keyed by item id rather than by position: the list is live, and an item
     deleted from the prep screen in another tab must not slide somebody
     else's answer onto a different question. */
  let answers = $state<Record<string, string>>({});

  let current = $derived(items[Math.min(index, Math.max(items.length - 1, 0))]);
  let atFirst = $derived(index <= 0);
  let atLast = $derived(index >= items.length - 1);

  /* One read of the pairing rule, for the two things that ask about it: what
     travels to the debrief, and whether the way out has anything to carry. */
  let jotted = $derived(answeredQuestions(items, answers));
  let carrying = $derived(todaysAppointment !== null && jotted.length > 0);

  /* Held as it is typed rather than on the way out, so a back gesture in the
     middle of a visit loses nothing (stores/inTheRoom.ts). Nothing is
     written to the journal here and nothing reaches storage. */
  $effect(() => {
    if (todaysAppointment) holdRoomAnswers(todaysAppointment.id, jotted);
  });

  function step(by: number) {
    index = Math.min(Math.max(index + by, 0), items.length - 1);
  }

  function leave() {
    /* The one control, with one of two destinations, and the label above it
       says which: something jotted goes on into the debrief through the
       offer's own deep link, so the answers land in the entry rather than
       waiting for a prompt that cannot appear until the day is over
       (mostRecentPastAppointment, appointments.ts). Nothing jotted goes back
       where the person came from. */
    if (carrying && todaysAppointment) goto(`/entry/new/today?debriefFor=${todaysAppointment.id}`);
    else smartBack('/health/appointment-prep');
  }
</script>

<div class="screen room">
  <!-- No back arrow and no actions, so the header collapses to nothing
       visible. The title stays in the document for the outline and for a
       screen reader, which is what a chromeless screen owes them when the
       largest text on it is a question rather than a name. -->
  <ScreenHeader title={m.in_the_room_title()} screen="in-the-room" titleHidden />

  <ReadGate read={checklistQuery} variant="block" count={1}>
    {#snippet rows()}
      <div class="room-stage" data-in-the-room>
        <!-- aria-live, because moving between questions replaces the text in
             place and never moves focus. Focus stays where it is on purpose:
             pulling it into the field would raise the keyboard over the very
             question the person is trying to read. -->
        <div class="room-ask" aria-live="polite">
          {#key current.id}
            <p class="room-question" data-room-question in:wipe>{current.content}</p>
          {/key}
        </div>

        <!-- Only where there is a visit today for an answer to belong to.
             The list is standing and can be read any day (ADR-0066), and on
             a day with nothing booked there is no debrief for a jotting to
             reach - a field that took what somebody typed and dropped it on
             the way out would be the worst of the three options. -->
        {#if todaysAppointment}
          <Field label={m.in_the_room_answer_label()} id="room-answer">
            {#snippet children(id)}
              <textarea
                class="input room-answer"
                {id}
                name="room-answer"
                rows="3"
                data-room-answer
                placeholder={m.in_the_room_answer_placeholder()}
                value={answers[current.id] ?? ''}
                oninput={(event) => (answers[current.id] = event.currentTarget.value)}
              ></textarea>
            {/snippet}
          </Field>
        {/if}
      </div>

      <div class="room-move">
        <button class="btn btn-soft room-step" data-room-previous disabled={atFirst} onclick={() => step(-1)}>
          <Icon name="chevronLeft" size={22} />
          <span>{m.in_the_room_previous()}</span>
        </button>
        <button class="btn btn-soft room-step" data-room-next disabled={atLast} onclick={() => step(1)}>
          <span>{m.in_the_room_next()}</span>
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      <div class="room-out">
        <button class="btn btn-primary room-leave" data-room-done onclick={leave}>
          <span>{carrying ? m.in_the_room_done_write() : m.done()}</span>
        </button>
      </div>
    {/snippet}
    {#snippet empty()}
      <!-- The one thing on the screen, and its action is also the way out of
           it: a room with no questions in it has nothing to leave. -->
      <Notice
        icon="check"
        key="in-the-room-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.in_the_room_empty_title()}
        text={m.in_the_room_empty_body()}
        action={{
          label: m.in_the_room_empty_action(),
          primary: true,
          onclick: () => goto('/health/appointment-prep')
        }}
      />
    {/snippet}
  </ReadGate>
</div>

<style>
  /* The screen is one column that fills the viewport rather than a stack of
     surfaces, and the split is the use scene: the question in the upper
     field of view where the eye rests, the optional field and the three
     controls in the lower third where a thumb already is, on a phone held
     at chest height while somebody is being spoken to.

     Its own top space, because the header collapses to nothing here and
     every other screen gets that air from the header it draws. */
  .room {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding-top: var(--space-5);
  }

  /* `1 1 auto` rather than `1`, here and on the block below, so neither box
     can be squeezed under its own content: at the text-size boost, or on a
     short window, a four-line question has to push the screen past the
     viewport and scroll rather than run into the field under it. */
  .room-stage {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* The question takes the whole upper block and sits in the middle of it,
     so a one-line question and a four-line one land on the same optical
     centre and the eye returns to one place. Nothing under it moves either:
     the field and the controls keep their own heights whatever the question
     is, so the only thing that changes between questions is the words. */
  .room-ask {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
  }

  /* The question, and the reason this screen exists: the prep list draws the
     same words at --text-md in a row with three controls on it. */
  .room-question {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-medium);
    line-height: var(--leading-display);
    letter-spacing: var(--display-track);
    text-wrap: balance;
  }

  /* Bigger than an ordinary input for the same reason the question is: this
     gets read back later by somebody who was not concentrating when they
     typed it. `resize` off because the handle would be a fourth control on
     a screen that is meant to have three, and the box is already generous. */
  .room-answer {
    font-size: var(--text-lg);
    line-height: var(--leading-body);
    resize: none;
  }

  .room-move {
    display: flex;
    gap: var(--space-3);
  }

  /* Both halves the same width whichever label is longer, so the pair does
     not shuffle sideways as the questions change.

     One step above --touch-target for the pair and two for the way out,
     rather than the floor itself: every control here is aimed at while the
     person is listening to somebody rather than looking at their phone, and
     the way out is the one that must not be missed. */
  .room-step {
    flex: 1 1 0;
    min-width: 0;
    gap: var(--space-2);
    min-height: calc(var(--touch-target) + var(--space-1));
  }

  .room-leave {
    width: 100%;
    min-height: calc(var(--touch-target) + var(--space-2));
  }
</style>
