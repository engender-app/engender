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
  import type { TallyKind } from '$lib/data/types';
  import { crossfadeDuration, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { toast } from '$lib/stores/toasts.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from './Icon.svelte';
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

  /* The same route Home's quick log and the Android widget already use, so
     a mood picked here lands in the editor the same way it lands from
     either of those. launch-routes.json pins that shape and is untouched. */
  function pickMood(v: number) {
    close();
    goto(`/entry/new/today?seedMood=${v}`);
  }

  /* Preserved exactly: today by epoch day, a backdate through the same
     parse, neither changed by the fan growing around them. */
  function chooseToday() {
    close();
    goto(`/entry/new/${todayEpochDay()}`);
  }
  function chooseDate() {
    const day = epochDayFromDateInputValue(backdate);
    if (day == null) return;
    backdateOpen = false;
    goto(`/entry/new/${day}`);
  }

  /* The one target that cannot be a single action: a backdate needs a date
     before it can go anywhere, so it hands over to a small sheet. */
  function openBackdate() {
    close();
    backdateOpen = true;
  }

  /* A photo is recorded on an entry, so the surface that records it is the
     editor, opened on today with its picker already up. */
  function addPhoto() {
    close();
    goto('/entry/new/today?seedPhoto=1');
  }

  /* The tap logs the counter with no context and waits on nothing after it
     (CONTEXT: "Tally event"), which is what makes it worth reaching from
     any screen: the fan closes and you are still where you were. */
  async function logTally(kind: TallyKind) {
    close();
    /* Read here rather than captured when the component mounted: the app
       survives backgrounding, so a value taken at init logs to yesterday
       for anyone who leaves it open across midnight. */
    await journal.tally.log({ epochDay: todayEpochDay(), kind });
    toast(m.quick_saved(), { kind: 'tally' });
  }

  function logDose() {
    close();
    goto('/doses?add=1');
  }

  /* Nearest the thumb first, because the order is a reachability decision
     rather than an editorial one: the mood row is where a slide lands with
     the least travel, and a dose is the one of these nobody logs in a
     hurry. */
  const MOODS = [1, 2, 3, 4, 5];
  const MOOD_TARGET = 'mood-';

  type FanRow = { key: string; icon: string; label: () => string; run: () => void };

  const ROWS: FanRow[] = [
    { key: 'today', icon: 'sun', label: () => m.today(), run: chooseToday },
    { key: 'photo', icon: 'image', label: () => m.quick_add_photo(), run: addPhoto },
    { key: 'another-day', icon: 'calendar', label: () => m.another_day(), run: openBackdate },
    {
      key: 'tally-misgendered',
      icon: 'x',
      label: () => m.tally_misgendered(),
      run: () => void logTally('misgendered')
    },
    {
      key: 'tally-correctly_gendered',
      icon: 'check',
      label: () => m.tally_correctly_gendered(),
      run: () => void logTally('correctly_gendered')
    },
    { key: 'dose', icon: 'clock', label: () => m.doses_add_aria(), run: logDose }
  ];

  function runTarget(key: string) {
    if (key.startsWith(MOOD_TARGET)) return pickMood(Number(key.slice(MOOD_TARGET.length)));
    ROWS.find((row) => row.key === key)?.run();
  }

  /* The stagger, and the cap on it. Rows leave the button one after another
     from the bottom up; six steps of 28ms is 168ms of stagger on top of a
     240ms travel, which is the whole fan open in under half a second. The
     exit has no stagger at all - they go back as one object. */
  const STAGGER_STEP = 28;
  const ROW_COUNT = ROWS.length + 1; // the mood row counts as one
  const rowDelay = (index: number) => (isReducedMotion() ? 0 : (ROW_COUNT - 1 - index) * STAGGER_STEP);

  /* Travel is expressed as a distance down toward the button rather than as
     a measured position, because the fan is anchored on the button already:
     every row only has to fall back the height of what is between it and
     the button, and the shared origin comes out of the geometry for free. */
  const TRAVEL = 18;

  function fanIn(_node: Element, { index }: { index: number }) {
    if (isReducedMotion()) return { duration: crossfadeDuration(), css: (t: number) => `opacity: ${t}` };
    return {
      duration: motionDuration('--dur-med', 240),
      delay: rowDelay(index),
      css: (t: number, u: number) =>
        `opacity: ${t}; transform: translateY(${u * (TRAVEL + index * 10)}px) scale(${0.88 + 0.12 * t})`
    };
  }

  function fanOut(_node: Element) {
    if (isReducedMotion()) return { duration: crossfadeDuration(), css: (t: number) => `opacity: ${t}` };
    return {
      duration: motionDuration('--dur-fast', 150),
      css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${u * TRAVEL}px) scale(${0.9 + 0.1 * t})`
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
    armed = targetAt(e) ?? null;
  }

  /* One rule for both gestures: on release, whatever the pointer is over
     wins. The add control is not a target, so letting go without having
     gone anywhere chooses nothing and leaves the fan up for the next tap -
     which is the tap flow, falling out of the same line as the slide. */
  function slideEnd(e: PointerEvent) {
    if (!ui.chooserPressing) return;
    ui.chooserPressing = false;
    const key = targetAt(e);
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

  <div class="fan" role="group" aria-label={m.quick_add_title()} data-fan>
    <div class="fan-moods" in:fanIn={{ index: 0 }} out:fanOut>
      {#each MOODS as value (value)}
        <button
          class="fan-mood"
          class:is-armed={armed === MOOD_TARGET + value}
          data-fan-target={MOOD_TARGET + value}
          aria-label={moodName(value)}
          onclick={() => pickMood(value)}
        >
          <span class="fan-mood-dot" style="background:var(--mood-{value})"></span>
          <span class="fan-mood-label">{moodName(value)}</span>
        </button>
      {/each}
    </div>

    {#each ROWS as row, i (row.key)}
      <button
        class="fan-item"
        class:is-armed={armed === row.key}
        data-fan-target={row.key}
        data-choose={row.key}
        in:fanIn={{ index: i + 1 }}
        out:fanOut
        onclick={row.run}
      >
        <span class="fan-icon"><Icon name={row.icon} size={20} /></span>
        <span class="fan-label">{row.label()}</span>
      </button>
    {/each}
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
