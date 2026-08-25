<script lang="ts">
  /* Quick add (phase 5 ticket 18, closing spec 04).

     The bottom bar's centre button opened a sheet with two choices, "today"
     and a backdate, and both landed on the same new-entry screen. A control
     in the most reachable place on the screen did one thing.

     What earns a slot here is being cross-cutting, not being popular
     (CONTEXT: "Quick add"). A log belongs because you might want it while
     looking at something unrelated; adding a lab result while reading your
     lab results should not route through a global sheet. So every feature
     surface keeps its own in-context add control and this never replaces
     one.

     ## Why a fan and not a sheet

     Two gestures have to reach the same targets, and only one shape serves
     both. Tap the add button and the options are there to tap. Or press it
     and keep pressing: the options come out under your thumb and you slide
     onto the one you want and let go, without ever lifting a finger. The
     second is the whole reason this is not a bottom sheet - a sheet is a
     surface you arrive at, and it cannot be crossed in one gesture from the
     button that opened it.

     Both gestures resolve through one rule, which is why there is no mode
     flag anywhere below: on release, whatever target the pointer is over
     wins. Let go over the button itself and nothing is chosen, so the fan
     stays up and the next tap picks - that is the tap flow, falling out of
     the same line of code as the slide.

     ## The motion

     Focal moment: the button throws its options out and takes them back.
     Every row starts at the button's own position and travels to its place,
     nearest the thumb first, so the fan reads as the button's contents
     rather than as a menu that happened to appear above it. Coming back
     they collapse into the button together and faster, because an exit that
     takes as long as an entrance reads as hesitation.

     Continuity: the plus turns 45 degrees into a cross while the fan is up
     (AppNav.svelte), so the control that opened it is visibly the control
     that closes it.

     Feedback: the row under the pointer lifts and fills with the accent
     inside --dur-fast, and a slide re-targets continuously, so the answer
     to "what will this do if I let go" is always on screen.

     Budget: transform and opacity only, seven rows, one stagger capped
     under 200ms, played once per open. The scrim is .scrim-withdraw, whose
     cost ticket 28 already bounded.

     Reduced motion substitutes rather than deletes: the rows arrive where
     they belong with no travel and no stagger, and the highlight keeps its
     colour and loses its lift. Both gestures still work, which is the part
     that matters. */
  import { goto } from '$app/navigation';
  import { fade } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { journal } from '$lib/data/live/journal.svelte';
  import { moodName } from '$lib/data/vocabulary/labels';
  import type { TallyKind, WearSession } from '$lib/data/types';
  import { crossfadeDuration, isReducedMotion, motionDistance, motionDuration } from '$lib/motion/tokens';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from './Icon.svelte';
  import MoodFace from './MoodFace.svelte';
  import Sheet from './Sheet.svelte';

  let backdateOpen = $state(false);
  let backdate = $state(dateInputValueFromEpochDay(todayEpochDay() - 1));

  /* Which target the pointer is currently over, during a press-and-slide.
     Null in the tap flow, where the browser's own hover and focus do this
     job. */
  let armed = $state<string | null>(null);

  function close() {
    ui.chooserOpen = false;
    armed = null;
  }

  /* Telling you it landed, for the two things that never leave the screen
     (phase 5 ticket 18).

     A tally and a wear session both resolve in place, which is the whole
     reason they are worth reaching from anywhere - and it left them with
     nothing to show for it where the thumb that pressed actually was. The row you chose flies into the add
     button instead, and the button catches it with a tick: the exact
     reverse of the fan coming out of it, so the gesture closes the loop it
     opened. Tier 3, change within a screen - something was written, and
     this is the mark moving rather than a new surface arriving to say so.

     Nothing waits for it. The fan is already shut and the app is already
     usable; the flight is an overlay with no pointer events that happens to
     still be on screen. It starts when the write comes back rather than
     when the finger lifts, so it means "this is recorded" and not "this was
     sent" - the round trip is tens of milliseconds, so the honesty is free.

     Under reduced motion nothing travels and the marks still appear, for
     the same duration.

     Neither outcome raises a toast. The control says both things where the
     thumb already is, and a line of text at the far end of the screen was
     the same news a second time. What a toast was also doing, though, is
     the part an animation cannot do at all: it was role="status", so a
     screen reader spoke it. That half stays, as a visually hidden live
     region below - the announcement without the notification. */
  /* The beats, and why they are sequenced rather than stacked. The first
     version started the flight the instant the write came back, which was
     while the fan was still on its way out - so two things moved at once
     and neither one read. Watching it back frame by frame, the tick was
     already on the button before the eye had finished with the fan.

     Now the fan clears first, then the mark flies across an empty screen,
     then the control takes it. Each beat has the screen to itself, which is
     what makes a 40px disc legible at all. The durations are the same
     tokens as everything else; only the order changed. */
  const flightDelay = () => motionDuration('--dur-fast', 150);
  const flightMs = () => motionDuration('--dur-slow', 380);
  const HOLD_MS = 700;

  let announcement = $state('');
  let flight = $state<{ x: number; y: number; dx: number; dy: number } | null>(null);
  let flightTimer: ReturnType<typeof setTimeout> | null = null;

  /** The line from a target to the add control, measured before the fan
      closes and both of them are gone, in the app's own coordinates. */
  function flightFrom(key: string) {
    const app = document.querySelector('[data-app-root]')?.getBoundingClientRect();
    const row = document.querySelector(`[data-fan-target="${key}"]`)?.getBoundingClientRect();
    const add = document.querySelector<HTMLElement>('[data-nav-fab]')?.offsetParent
      ? document.querySelector('[data-nav-fab]')?.getBoundingClientRect()
      : document.querySelector('[data-rail-add]')?.getBoundingClientRect();
    if (!app || !row || !add) return null;
    const centre = (box: DOMRect) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const from = centre(row);
    const to = centre(add);
    return { x: from.x - app.left, y: from.y - app.top, dx: to.x - from.x, dy: to.y - from.y };
  }

  /* Every in-place action goes through here, so the confirmation cannot get
     out of step with the write. Nothing is shown until the write has come
     back: the mark flies and the control ticks on the resolved path only,
     and the failed path says so instead of leaving a tap that looks like it
     worked. It also stops a rejection escaping into the window as an
     unhandled promise, which is what the failed path used to do - and that
     was worse than a wrong confirmation, because it showed nothing at all. */
  async function confirmed(
    from: ReturnType<typeof flightFrom>,
    write: () => Promise<unknown>,
    kind: string,
    target: string
  ) {
    /* Cleared before the write and set after it, which is what makes a
       second identical action speak again: a live region announces a change
       of text, and setting the same string twice is not one. The await
       between the two guarantees they land as separate updates. */
    announcement = '';
    try {
      /* Review only, and it cannot ship: `__DEMO__` is a literal Rollup
         folds away, and the flag it reads is set by the demo bar, which a
         production build drops entirely. It exists because the failed path
         is otherwise only reachable by breaking the journal, and both paths
         have to be watchable side by side to be judged. */
      if (__DEMO__ && document.documentElement.dataset.demoFail === target) {
        throw new Error(`demo: ${target} is set to fail`);
      }
      await write();
    } catch (error) {
      console.error(`quick add: ${kind} was not written`, error);
      refuse();
      announcement = m.quick_add_failed();
      return;
    }
    land(from);
    announcement = m.quick_saved();
  }

  let caughtTimer: ReturnType<typeof setTimeout> | null = null;
  let failTimer: ReturnType<typeof setTimeout> | null = null;

  /* The failed outcome, and it is deliberately not a mirror of the landed
     one. Nothing flies, because nothing arrived - the absence of the mark
     is part of what the failure says. The control shakes where it stands
     and wears an alert instead of a tick, and it starts at once rather than
     waiting out a flight that is not coming, because bad news should not be
     slower than good.

     Sideways, and only sideways. A vertical shake on a control that sits
     against the bottom of the screen reads as the bar itself coming loose. */
  function refuse() {
    if (failTimer) clearTimeout(failTimer);
    ui.chooserFailed = true;
    failTimer = setTimeout(() => {
      ui.chooserFailed = false;
      failTimer = null;
    }, HOLD_MS);
  }

  function land(from: ReturnType<typeof flightFrom>) {
    if (flightTimer) clearTimeout(flightTimer);
    if (caughtTimer) clearTimeout(caughtTimer);
    flight = from;
    ui.chooserConfirming = true;
    ui.chooserCaught = false;
    caughtTimer = setTimeout(() => {
      ui.chooserCaught = true;
      caughtTimer = null;
    }, flightDelay() + flightMs());
    flightTimer = setTimeout(() => {
      flight = null;
      ui.chooserConfirming = false;
      ui.chooserCaught = false;
      flightTimer = null;
    }, flightDelay() + flightMs() + HOLD_MS);
  }

  /* The same route Home's quick log and the Android widget already use, so
     a mood picked here lands in the editor the same way it lands from
     either of those. launch-routes.json pins that shape and is untouched. */
  function pickMood(v: number) {
    close();
    goto(`/entry/new/today?seedMood=${v}`);
  }

  /* The backdate, unchanged: the same parse, through the same route.

     "Today" used to be a row of its own, opening a blank entry. It is gone,
     merged into the mood row above it, because the three of them were one
     thing wearing three labels: an entry cannot be saved without a mood
     (entry_needs_mood), so a blank entry for today is a mood picker with an
     extra tap in front of it. Picking a mood is how you start today's
     entry, and the editor still lets you change it. */
  function chooseDate() {
    const day = epochDayFromDateInputValue(backdate);
    if (day == null) return;
    backdateOpen = false;
    goto(`/entry/new/${day}`);
  }

  /* The one target that cannot resolve in a gesture: a backdate needs a
     date before it can go anywhere, so it hands over to a small sheet. */
  function openBackdate() {
    close();
    backdateOpen = true;
  }

  /* The tap logs the counter with no context and waits on nothing after it
     (CONTEXT: "Tally event"), which is what makes it worth reaching from
     any screen: the fan closes and you are still where you were. */
  async function logTally(kind: TallyKind) {
    const from = flightFrom(`tally-${kind}`);
    close();
    /* Read here rather than captured when the component mounted: the app
       survives backgrounding, so a value taken at init logs to yesterday
       for anyone who leaves it open across midnight. */
    await confirmed(
      from,
      () => journal.tally.log({ epochDay: todayEpochDay(), kind }),
      'tally',
      `tally-${kind}`
    );
  }

  /* The wear session, and the reason it earns a slot the others would not
     (CONTEXT: "Wear session"). Starting one writes a row with no duration
     and stopping it later fills the duration in, so the moment you log it
     is the data rather than a note about when you remembered. Everything
     else in this fan can be reached a screen later at no cost; a session
     started late is a session recorded wrong.

     Read once each time the fan opens rather than subscribed to. This
     component is mounted for the whole life of the app, so a live query
     here would run on every cold boot and stay subscribed behind every
     screen, to answer a question nothing can change while the fan is up -
     the fan covers the app, and the only way to start or stop a session
     from anywhere else is to close it first. */
  let running = $state<WearSession | null>(null);
  $effect(() => {
    if (!ui.chooserOpen) return;
    let stale = false;
    void journal.wearSessions
      .getRunningSession()
      .then((session) => {
        if (!stale) running = session;
      })
      /* A journal that cannot be read is a journal that cannot be written
         either, so the write behind this row will fail and say so. What
         this catch is for is the rejection itself: unhandled, it reaches
         the window as a page error, and the walkthrough fails its whole run
         on one of those. The row falls back to offering a start, which is
         what it says with nothing running. */
      .catch((error) => {
        console.error('quick add: could not read the running wear session', error);
      });
    return () => {
      stale = true;
    };
  });

  /* One target, two things, and the label says which: nothing is running so
     this starts, or something is and this stops it. Both are a single write
     with nothing left to choose, which is what lets it resolve in place the
     way a tally does.

     `reminderHoursAfterStart` is omitted on purpose in both directions. On
     a start that means no reminder, which matches the wear log's own line
     that any reminder is entirely your own call; on a stop, omitting it is
     what leaves a reminder the wear screen set alone (wearSessions.ts). */
  async function toggleWear() {
    const session = running;
    const from = flightFrom('wear');
    close();
    await confirmed(
      from,
      () =>
        session
          ? journal.wearSessions.upsertSession({
              id: session.id,
              startTimestamp: session.startTimestamp,
              durationMs: Date.now() - session.startTimestamp,
              note: session.note
            })
          : journal.wearSessions.upsertSession({ startTimestamp: Date.now(), durationMs: null }),
      'wear',
      'wear'
    );
  }

  function logDose() {
    close();
    goto('/doses?add=1');
  }

  /* Nearest the thumb first, because the order is a reachability decision
     rather than an editorial one: the mood row is where a slide lands with
     the least travel, and a dose is the one of these nobody logs in a
     hurry.

     Grouped as three cards rather than six floating pills. A card per group
     is the app's own list surface - one plane, hairline separators, the
     icon in the accent - so the fan reads as three things the button can
     make rather than as a stack of identical rounded rectangles, which is
     the generic shape DIRECTION.md's decision 2b exists to avoid. It also
     gives the slide a better target: the highlight moves inside one plane
     instead of jumping between separate objects. */
  const MOODS = [1, 2, 3, 4, 5];
  const MOOD_TARGET = 'mood-';

  const ACTIONS: Record<string, () => void> = {
    'another-day': openBackdate,
    'tally-misgendered': () => void logTally('misgendered'),
    'tally-correctly_gendered': () => void logTally('correctly_gendered'),
    dose: logDose,
    wear: () => void toggleWear()
  };

  function runTarget(key: string) {
    if (key.startsWith(MOOD_TARGET)) return pickMood(Number(key.slice(MOOD_TARGET.length)));
    ACTIONS[key]?.();
  }

  /* No stagger. The first version dealt the rows out one after another from
     the bottom up, which put the longest delay on the row furthest from the
     button - and that row is the mood picker, the one thing most likely to
     be what the press was for. It arrived last and read as lag rather than
     as choreography. The fan is one object leaving the button and one
     object going back into it, so every row moves together, in and out.

  /* Every row travels the same token distance back toward the button; what
     says they came out of it is the stagger, not a per-row offset invented
     here. The tokens are the one motion language and this is tier 2's own
     distance, the same one a sheet rises by. */
  const travel = () => motionDistance('--motion-distance-md', 24);

  function fanIn(_node: Element) {
    if (isReducedMotion()) return { duration: crossfadeDuration(), css: (t: number) => `opacity: ${t}` };
    return {
      duration: motionDuration('--dur-med', 240),
      css: (t: number, u: number) =>
        `opacity: ${t}; transform: translateY(${u * travel()}px) scale(${0.88 + 0.12 * t})`
    };
  }

  function fanOut(_node: Element) {
    if (isReducedMotion()) return { duration: crossfadeDuration(), css: (t: number) => `opacity: ${t}` };
    return {
      duration: motionDuration('--dur-fast', 150),
      css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${u * travel()}px) scale(${0.9 + 0.1 * t})`
    };
  }

  /* Press-and-slide. Listened for on the window rather than on the button,
     because the gesture starts on the add control and finishes wherever the
     finger got to, which is a different component and usually a different
     element. Hit testing is the browser's own rather than a table of
     rectangles this would have to keep in step with the layout. */
  function targetAt(e: PointerEvent): string | undefined {
    return document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-fan-target]')?.dataset.fanTarget;
  }

  function slideMove(e: PointerEvent) {
    if (!ui.chooserPressing) return;
    const target = targetAt(e);
    if (target) {
      armed = target;
      return;
    }
    /* Between two cards there is a gap, and a finger crossing it is not
       changing its mind - it is on its way somewhere. Clearing there made
       the highlight flicker off and on as the finger travelled up the fan,
       and left an 8px band where letting go did nothing. Inside the fan the
       last armed target holds; outside it, including back over the add
       control, the arming clears, which is what makes releasing on the
       button choose nothing. */
    armed = withinFan(e) ? armed : null;
  }

  function withinFan(e: PointerEvent): boolean {
    const fan = document.querySelector('[data-fan]')?.getBoundingClientRect();
    if (!fan) return false;
    return e.clientX >= fan.left && e.clientX <= fan.right && e.clientY >= fan.top && e.clientY <= fan.bottom;
  }

  /* One rule for both gestures: on release, whatever the pointer was over
     wins. The add control is not a target, so letting go without having
     gone anywhere chooses nothing and leaves the fan up for the next tap -
     which is the tap flow, falling out of the same line as the slide.

     It runs whatever `armed` already holds rather than hit testing the
     release a second time. That is the same thing the person was being
     shown a moment earlier - the armed row is the app's answer to "what
     happens if I let go" - so re-deriving it can only ever disagree with
     what they were promised, and on a touchscreen it did: the row armed
     and highlighted correctly all the way up the fan, and then the release
     chose nothing, because a pointerup's coordinates are not reliably the
     last place the finger actually was. Read what was shown. */
  function slideEnd() {
    if (!ui.chooserPressing) return;
    ui.chooserPressing = false;
    const key = armed;
    armed = null;
    if (key) runTarget(key);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (ui.chooserOpen && e.key === 'Escape') close();
  }
</script>

<svelte:window
  onkeydown={onWindowKeydown}
  onpointermove={slideMove}
  onpointerup={slideEnd}
  onpointercancel={() => {
    ui.chooserPressing = false;
    armed = null;
  }}
/>

{#if ui.chooserOpen}
  <!-- The scrim is the withdrawal ticket 28 built and nothing had spent yet:
       the screen behind the fan is plainly still there and plainly not what
       is being read. -->
  <div
    class="fan-scrim scrim-withdraw"
    role="presentation"
    data-quick-add
    transition:fade={{ duration: motionDuration('--dur-fast', 150) }}
    onclick={close}
  ></div>

  <!-- Source order is the phone's, nearest the thumb first: the bar's fan
       is a reversed column, so the first card here is the lowest on screen.
       The rail's is a plain column, where the same order reads top down. -->
  <div class="fan" role="group" aria-label={m.quick_add_title()} data-fan>
    <!-- The entry card. Everything in it makes an entry, and the mood row
         at the bottom is the one that makes today's - which is why "Today"
         is not a row of its own any more. -->
    <div class="fan-card" in:fanIn out:fanOut>
      <button
        class="fan-item"
        class:is-armed={armed === 'another-day'}
        data-fan-target="another-day"
        data-choose="another-day"
        onclick={ACTIONS['another-day']}
      >
        <span class="fan-icon"><Icon name="calendar" size={22} /></span>
        <span class="fan-label">{m.another_day()}</span>
      </button>
      <div class="fan-moods">
        {#each MOODS as value (value)}
          <button
            class="fan-mood"
            class:is-armed={armed === MOOD_TARGET + value}
            data-fan-target={MOOD_TARGET + value}
            aria-label={moodName(value)}
            onclick={() => pickMood(value)}
          >
            <MoodFace step={value} size={34} blink />
            <span class="fan-mood-label">{moodName(value)}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- One question asked twice, so one card holding both halves, the way
         the five moods are one scale. -->
    <div class="fan-card is-pair" in:fanIn out:fanOut>
      <button
        class="fan-item"
        class:is-armed={armed === 'tally-misgendered'}
        data-fan-target="tally-misgendered"
        data-choose="tally-misgendered"
        onclick={ACTIONS['tally-misgendered']}
      >
        <span class="fan-icon"><Icon name="x" size={22} /></span>
        <span class="fan-label">{m.tally_misgendered()}</span>
      </button>
      <button
        class="fan-item"
        class:is-armed={armed === 'tally-correctly_gendered'}
        data-fan-target="tally-correctly_gendered"
        data-choose="tally-correctly_gendered"
        onclick={ACTIONS['tally-correctly_gendered']}
      >
        <span class="fan-icon"><Icon name="check" size={22} /></span>
        <span class="fan-label">{m.tally_correctly_gendered()}</span>
      </button>
    </div>

    <div class="fan-card" in:fanIn out:fanOut>
      <button
        class="fan-item"
        class:is-armed={armed === 'dose'}
        data-fan-target="dose"
        data-choose="dose"
        onclick={ACTIONS.dose}
      >
        <span class="fan-icon"><Icon name="clock" size={22} /></span>
        <span class="fan-label">{m.doses_empty_action()}</span>
      </button>
      <!-- The icon changes with the label because they are saying the same
           thing: a running session is a thing to stop. `timeline` for the
           other half is not a stand-in - it is a start dot, a span and an
           end dot, which is exactly the shape of a wear session, and it is
           already the app's mark for something measured between two
           moments. It is a lighter glyph than the ones above it, which is
           the icon set's own weight rather than this row's. -->
      <button
        class="fan-item"
        class:is-armed={armed === 'wear'}
        data-fan-target="wear"
        data-choose="wear"
        data-wear-running={running ? '' : undefined}
        onclick={ACTIONS.wear}
      >
        <span class="fan-icon"><Icon name={running ? 'stop' : 'timeline'} size={22} /></span>
        <span class="fan-label">
          {running ? m.wear_session_stop_action() : m.wear_session_start_action()}
        </span>
      </button>
    </div>
  </div>
{/if}

<!-- The half of the confirmation that is not a picture. Always in the DOM
     rather than rendered with the outcome, because a live region only
     announces a change of text inside a region that was already there; one
     that appears carrying its message is often missed. Hidden, not silent:
     nothing here is drawn, and the animation is what a sighted person
     reads. -->
<p class="visually-hidden" role="status" aria-live="polite" data-quick-add-status>{announcement}</p>

{#if flight}
  <!-- aria-hidden: the live region above already carries this in words, and
       announcing the picture too would say it twice. -->
  <div
    class="fan-flight"
    aria-hidden="true"
    data-fan-flight
    style={`--flight-x:${flight.x}px;--flight-y:${flight.y}px;--flight-dx:${flight.dx}px;--flight-dy:${flight.dy}px`}
  >
    <Icon name="check" size={22} />
  </div>
{/if}

<!-- The backdate's own step. It is the one target that cannot resolve in a
     gesture, because it needs a date first. -->
<Sheet bind:open={backdateOpen} title={m.another_day()}>
  <h3>{m.another_day()}</h3>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.new_entry_when()}</p>
  <label class="field-label" for="backdate">{m.another_day()}</label>
  <div class="spread" style="margin-top:var(--space-2)">
    <input
      class="input"
      type="date"
      id="backdate"
      name="backdate"
      max={dateInputValueFromEpochDay(todayEpochDay())}
      bind:value={backdate}
    />
    <button class="btn btn-soft press" data-choose="date" onclick={chooseDate}>{m.go()}</button>
  </div>
</Sheet>
