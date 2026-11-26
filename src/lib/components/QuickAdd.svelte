<script lang="ts">
  /* Quick add contains actions that make sense across the app. Each feature
     keeps its own add control for records that belong on that screen.

     Release chooses the action under the pointer. Release over the add
     button leaves the fan open for a second tap. Holding and sliding can
     choose an action within the opening gesture.

     Options travel from the button, nearest the thumb first, and collapse
     back together on close. AppNav.svelte rotates the plus 45 degrees while
     the fan is open. The current target lifts and fills on --dur-fast.
     Entrance uses transform and opacity, and newly available cards disclose
     their height. Reduced motion drops travel, stagger and lift while
     preserving colour feedback and both gestures. */
  import { beforeNavigate, goto } from '$app/navigation';
  import { fade } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { areaHidden } from '$lib/data/areaState';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { journal } from '$lib/data/live/journal.svelte';
  import { moodName } from '$lib/data/vocabulary/labels';
  import type { WearKind, WearSession } from '$lib/data/types';
  import { disclose } from '$lib/motion/reveal';
  import { crossfadeDuration, isReducedMotion, motionDistance, motionDuration } from '$lib/motion/tokens';
  import { MAGNIFIER_SPREAD, gazeRow, magnify } from '$lib/motion/magnifier';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from './Icon.svelte';
  import MoodFace from './MoodFace.svelte';
  import { firstFocusable, lockBackground, registerOverlay } from './overlayLock';
  import { holdFacesWhileStill } from '$lib/motion/holdWhileStill';

  let backdateOpen = $state(false);
  let backdate = $state('');

  /* Which target the pointer is currently over, during a press-and-slide.
     Null in the tap flow, where the browser's own hover and focus do this
     job. */
  let armed = $state<string | null>(null);

  function close() {
    ui.chooserOpen = false;
    armed = null;
    restMoods();
  }

  /* A successful in-place wear write closes the fan and flies the chosen
     row back into the add button, which shows a tick. Start after the write
     returns. The overlay takes no pointer events and delays no new action.
     Under reduced motion, show static marks for the same duration.

     The button gives visual feedback. A hidden role="status" region
     announces both outcomes without a toast. */
  /* The beats, and why they are sequenced rather than stacked. The first
     version started the flight the instant the write came back, which was
     while the fan was still on its way out - so two things moved at once
     and neither one read. Watching it back frame by frame, the tick was
     already on the button before the eye had finished with the fan.

     Now the fan clears first, then the mark flies across an empty screen,
     then the control takes it. Each beat has the screen to itself, which is
     what makes a 40px disc legible at all. The durations are the same
     tokens as everything else; only the order changed. */
  const flightDelay = () => motionDuration('--dur-fast');
  const flightMs = () => motionDuration('--dur-slow');
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
    announcement = m.saved();
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
  // Finish the live scrim fade before navigation photographs the screen.
  // A departure or a reopened fan cancels the pending mood destination.
  let moodAfterWithdrawal: number | null = null;
  beforeNavigate(() => { moodAfterWithdrawal = null; });
  $effect(() => {
    if (ui.chooserOpen) moodAfterWithdrawal = null;
  });

  function pickMood(v: number) {
    moodAfterWithdrawal = v;
    close();
  }

  function finishWithdrawal() {
    const mood = moodAfterWithdrawal;
    moodAfterWithdrawal = null;
    if (mood !== null) goto(`/entry/new/today?seedMood=${mood}`);
  }

  /* The backdate, unchanged: the same parse, through the same route.

     "Today" used to be a row of its own, opening a blank entry. It is gone,
     merged into the mood row above it, because the three of them were one
     thing wearing three labels: an entry cannot be saved without a mood
     (the editor's Save says so), so a blank entry for today is a mood picker with an
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
    backdate = dateInputValueFromEpochDay(todayEpochDay() - 1);
    backdateOpen = true;
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
  let doseAvailable = $state(false);
  let wearAvailable = $state(false);
  let availabilityPending = $state(true);
  /* A start repeats the last kind. No kind means wear has not been used, so
     there is no quick start row. */
  let lastKind = $state<WearKind | null>(null);
  /* Fetch before the first press, then refresh each time the fan opens.
     These are small point reads rather than live subscriptions on every
     screen. One result sets both gates together, so the card's height can
     travel as one change if the journal changed while the fan was closed. */
  let availabilityRead = 0;
  async function refreshAvailability() {
    const read = ++availabilityRead;
    availabilityPending = true;
    try {
      const [session, kind, states, episodes] = await Promise.all([
        journal.wearSessions.getRunningSession(),
        journal.wearSessions.latestKind(),
        journal.areaStates.getAreaStates(),
        journal.regimen.getEpisodes()
      ]);
      if (read !== availabilityRead) return;
      running = session;
      if (kind) lastKind = kind;
      wearAvailable = kind !== null && !areaHidden('wearSessions', states);
      doseAvailable = activeEpisodesAt(episodes, Date.now()).length > 0;
      availabilityPending = false;
    } catch (error) {
      if (read !== availabilityRead) return;
      wearAvailable = false;
      doseAvailable = false;
      availabilityPending = false;
      console.error('quick add: could not read available actions', error);
    }
  }

  /* Fired once at creation, not gated on the fan opening:
     this component mounts once for the app's whole life, so a read kicked
     off here has the entire time before the first press to land, rather
     than starting the same round trip only once the fan is already up.
     Not a live subscription - one read, same as the per-open refresh below
     - so it does not reopen the cost the comment above the effect already
     ruled out. */
  void refreshAvailability();

  $effect(() => {
    if (!ui.chooserOpen) return;
    void refreshAvailability();
  });

  /* One target, two things, and the label says which: nothing is running so
     this starts, or something is and this stops it. Both are a single write
     with nothing left to choose, which is what lets it resolve in place.

     `reminderHoursAfterStart` is omitted on purpose in both directions. On
     a start that means no reminder, which matches the wear log's own line
     that any reminder is entirely your own call; on a stop, omitting it is
     what leaves a reminder the wear screen set alone (wearSessions.ts). */
  async function toggleWear() {
    /* Never start from a stale target after the area was hidden. */
    const kind = lastKind;
    if (availabilityPending || !wearAvailable || !kind) return;
    const session = running;
    const from = flightFrom('wear');
    close();
    await confirmed(
      from,
      () =>
        session
          ? journal.wearSessions.upsertSession({
              id: session.id,
              kind: session.kind,
              startTimestamp: session.startTimestamp,
              durationMs: Date.now() - session.startTimestamp,
              note: session.note
            })
          : journal.wearSessions.upsertSession({ kind, startTimestamp: Date.now(), durationMs: null }),
      'wear',
      'wear'
    );
  }

  function logDose() {
    if (availabilityPending || !doseAvailable) return;
    close();
    goto('/care/doses?add=1');
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
  const travel = () => motionDistance('--motion-distance-md');

  function fanIn(_node: Element) {
    if (isReducedMotion()) return { duration: crossfadeDuration(), css: (t: number) => `opacity: ${t}` };
    return {
      duration: motionDuration('--dur-med'),
      css: (t: number, u: number) =>
        `opacity: ${t}; transform: translateY(${u * travel()}px) scale(${0.88 + 0.12 * t})`
    };
  }

  function fanOut(_node: Element) {
    if (isReducedMotion()) return { duration: crossfadeDuration(), css: (t: number) => `opacity: ${t}` };
    return {
      duration: motionDuration('--dur-fast'),
      css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${u * travel()}px) scale(${0.9 + 0.1 * t})`
    };
  }

  /* The action card sits in its own `{#if}`, so a transition written
     plainly on it never plays when the fan opens or closes: the block that
     changed is the fan's, an ancestor (carpet 15 row 45, the card painted
     opaque in the first frame and gone opaque in one). Global, and it picks
     its motion by what changed. While the fan is arriving or leaving it
     travels with the other cards; a change of availability while the fan
     stays up discloses its height. */
  let fanSettled = false;
  $effect(() => {
    if (!ui.chooserOpen) fanSettled = false;
  });
  function fanArrived() {
    fanSettled = true;
    focusFirstTarget();
  }
  function availableIn(node: Element) {
    return fanSettled ? disclose(node) : fanIn(node);
  }
  function availableOut(node: Element) {
    return ui.chooserOpen ? disclose(node) : fanOut(node);
  }

  /* Press-and-slide. Listened for on the window rather than on the button,
     because the gesture starts on the add control and finishes wherever the
     finger got to, which is a different component and usually a different
     element. Hit testing is the browser's own rather than a table of
     rectangles this would have to keep in step with the layout. */
  function targetAt(e: PointerEvent): string | undefined {
    const key = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-fan-target]')?.dataset.fanTarget;
    return key;
  }

  /* The mood row's magnifier. The falloff is in
     $lib/motion/magnifier.ts with its own tests; what is here is the
     measuring, and the two decisions that need the fan in front of them.

     The row's rectangle is read per move rather than cached when the fan
     opens. It is one rect for five faces, so the cost is a rounding error
     next to the elementFromPoint hit test this already does on the same
     event - and it is the only way to be right during the entrance, when the
     row is still arriving under a transform and a cached layout position
     would put the lift a few cells off where the finger actually is.

     Vertically it reaches past the row by half a cell, so the faces begin to
     rise as the finger comes down onto them rather than snapping to full size
     the moment it crosses the hairline. Approach is part of the gesture. */
  let moodScale = $state<number[]>(MOODS.map(() => 1));

  /* The fan's faces answer the slide twice over:
     with size, which only the one under the finger can do, and with a look,
     which all five do at once. moodMagnifier.svelte.ts carries the same pair
     for the two plain rows; the fan keeps its own copy of the loop because it
     also arms a target mid-gesture.

     Null rather than 0 is the resting value: 0 is a face being told the finger
     is on it, and null is a fan nobody is sliding across, where the faces go
     back to looking around on their own (MoodFace). */
  let moodGaze = $state<(number | null)[]>(MOODS.map(() => null));

  const RESTING = MOODS.map(() => 1);
  const NO_GAZE = MOODS.map(() => null);

  /* One place both channels rest, so the fan cannot be left half-answering -
     five faces still staring at a finger that lifted a second ago is worse
     than either of them being wrong alone. */
  function restMoods() {
    moodScale = RESTING;
    moodGaze = NO_GAZE;
  }

  function magnifyMoods(e: PointerEvent) {
    if (isReducedMotion()) return;
    const row = document.querySelector('[data-fan-moods]')?.getBoundingClientRect();
    const cell = row ? row.width / MOODS.length : 0;
    if (!row || !cell || e.clientY < row.top - cell / 2 || e.clientY > row.bottom + cell / 2) {
      /* Both channels, because either can be the one still set. A finger far
         enough along the row that every scale is already back to 1 still has
         all five gazes clamped hard toward it, and leaving the band on the
         scale test alone left them staring after it with the glance still
         paused - the half-answering state restMoods exists to rule out. */
      if (moodScale.some((scale) => scale !== 1) || moodGaze.some((g) => g !== null)) restMoods();
      return;
    }
    const spread = cell * MAGNIFIER_SPREAD;
    moodScale = MOODS.map((_, i) => magnify(e.clientX, row.left + cell * (i + 0.5), spread));
    moodGaze = gazeRow(e.clientX, row, MOODS.length);
  }

  function slideMove(e: PointerEvent) {
    if (!ui.chooserPressing) return;
    magnifyMoods(e);
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
    restMoods();
    const key = armed;
    armed = null;
    if (key) runTarget(key);
  }

  /* The fan uses overlayLock's modal stack for inert background, Tab,
     Escape, Android back and focus restoration. Keep its outside-click
     scrim, opener and live region active. AppNav makes the other bar
     controls inert.

     Release the lock as closing begins so landing focus can reach the
     next screen while the exit animation finishes. */
  let fanEl = $state<HTMLElement>();
  let scrimEl = $state<HTMLElement>();
  let statusEl: HTMLElement;
  $effect(() => {
    const fan = fanEl;
    if (!ui.chooserOpen || !fan) return;
    const bar = document.querySelector<HTMLElement>('[data-app-nav]');
    const keep = [scrimEl, bar, statusEl].filter((el): el is HTMLElement => !!el);
    const release = lockBackground(fan, { keep, withdraw: false });
    const unregister = registerOverlay(fan, { dismiss: close });
    return () => {
      unregister();
      release();
    };
  });

  /* Focus moves in once the cards have arrived, the way a sheet's does:
     focusing while the entrance is being set up forces a layout before its
     keyframes attach, which ticket 115 measured as a teleport on Android.
     Not while a press is still sliding, where focus would only chase the
     finger, and not if Tab already went in. */
  function focusFirstTarget() {
    if (!fanEl || ui.chooserPressing || fanEl.contains(document.activeElement)) return;
    firstFocusable(fanEl)?.focus({ preventScroll: true });
  }
</script>

<svelte:window
  onpointermove={slideMove}
  onpointerup={slideEnd}
  onpointercancel={() => {
    ui.chooserPressing = false;
    armed = null;
    restMoods();
  }}
/>

{#if ui.chooserOpen}
  <!-- The scrim is the withdrawal ticket 28 built and nothing had spent yet:
       the screen behind the fan is plainly still there and plainly not what
       is being read. -->
  <div
    bind:this={scrimEl}
    class="fan-scrim scrim-withdraw"
    role="presentation"
    data-quick-add
    transition:fade={{ duration: motionDuration('--dur-fast') }}
    onclick={close}
    onoutroend={finishWithdrawal}
  ></div>

  <!-- Source order is the phone's, nearest the thumb first: the bar's fan
       is a reversed column, so the first card here is the lowest on screen.
       The rail's is a plain column, where the same order reads top down. -->
  <div bind:this={fanEl} class="fan" role="dialog" aria-modal="true" aria-label={m.quick_add_title()} data-fan>
    <!-- The entry card. Everything in it makes an entry, and the mood row
         at the bottom is the one that makes today's - which is why "Today"
         is not a row of its own any more. -->
    <div class="fan-card" in:fanIn out:fanOut onintroend={fanArrived}>
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
      <div class="fan-moods" data-fan-moods {@attach holdFacesWhileStill}>
        {#each MOODS as value, i (value)}
          <button
            class="fan-mood"
            class:is-armed={armed === MOOD_TARGET + value}
            data-fan-target={MOOD_TARGET + value}
            aria-label={moodName(value)}
            style:--mood-mag={moodScale[i]}
            onclick={() => pickMood(value)}
          >
            <MoodFace step={value} size={34} alive gaze={moodGaze[i]} />
            <span class="fan-mood-label">{moodName(value)}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if doseAvailable || wearAvailable}
      <div class="fan-card" in:availableIn|global out:availableOut|global>
        {#if doseAvailable}
          <button
            class="fan-item"
            class:is-armed={armed === 'dose' && !availabilityPending}
            data-fan-target="dose"
            data-choose="dose"
            disabled={availabilityPending}
            transition:disclose={{ skip: !wearAvailable }}
            onclick={ACTIONS.dose}
          >
            <span class="fan-icon"><Icon name="pill" size={22} /></span>
            <span class="fan-label">{m.log_a_dose()}</span>
          </button>
        {/if}
        <!-- The icon changes with the label because they are saying the same
             thing: a running session is a thing to stop. The other half is
             the wear log's own `watch`, and the dose above it Meds' `pill`,
             so each action wears the mark of the module it writes to. -->
        {#if wearAvailable}
          <button
            class="fan-item"
            class:is-armed={armed === 'wear' && !availabilityPending}
            data-fan-target="wear"
            data-choose="wear"
            disabled={availabilityPending}
            data-wear-running={running ? '' : undefined}
            transition:disclose={{ skip: !doseAvailable }}
            onclick={ACTIONS.wear}
          >
            <span class="fan-icon"><Icon name={running ? 'stop' : 'watch'} size={22} /></span>
            <span class="fan-label">{running ? m.wear_session_stop_action() : m.wear_session_start_action()}</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<!-- The half of the confirmation that is not a picture. Always in the DOM
     rather than rendered with the outcome, because a live region only
     announces a change of text inside a region that was already there; one
     that appears carrying its message is often missed. Hidden, not silent:
     nothing here is drawn, and the animation is what a sighted person
     reads. -->
<p bind:this={statusEl} class="visually-hidden" role="status" aria-live="polite" data-quick-add-status>{announcement}</p>

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
     gesture, because it needs a date first. Deferring the entire sheet behind a
     lazy import keeps DatePicker out of the first-load layout chunk.
     The backdate confirmation button grips data-choose="date" inside QuickAddBackdateSheet. -->
{#if backdateOpen}
  {#await import('./QuickAddBackdateSheet.svelte') then { default: QuickAddBackdateSheet }}
    <QuickAddBackdateSheet bind:open={backdateOpen} bind:backdate onChooseDate={chooseDate} />
  {/await}
{/if}
