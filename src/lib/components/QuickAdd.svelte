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
  import { crossfadeDuration, isReducedMotion, motionDistance, motionDuration } from '$lib/motion/tokens';
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

  /* Grouped rather than flat (spec 04), and the grouping is the row: a row
     holds one target or a pair of them, and a gap opens where one group
     ends. Headings were the other option and a fan is the wrong surface for
     them - it is something a thumb crosses, and four headings in it are
     four more things to slide past on the way to a target.

     The two tally directions share a row because they are one question
     asked twice, the same way the five moods are one scale. A pair lays
     itself out like a mood cell, icon over label, so the longer of the two
     labels has two lines rather than an ellipsis. */
  type FanTarget = { key: string; icon: string; label: () => string; run: () => void };

  const ROWS: FanTarget[][] = [
    [{ key: 'today', icon: 'sun', label: () => m.today(), run: chooseToday }],
    [{ key: 'another-day', icon: 'calendar', label: () => m.another_day(), run: openBackdate }],
    [{ key: 'photo', icon: 'image', label: () => m.quick_add_photo(), run: addPhoto }],
    [
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
      }
    ],
    /* doses_empty_action rather than doses_add_aria: this is a visible
       label, and the aria string is not the one to render even where the
       two read the same. */
    [{ key: 'dose', icon: 'clock', label: () => m.doses_empty_action(), run: logDose }]
  ];

  /* Where a gap opens, by row index. Entry is three rows, the tally is one,
     and a dose is its own thing. */
  const GROUP_STARTS = new Set([3, 4]);

  const TARGETS = ROWS.flat();

  function runTarget(key: string) {
    if (key.startsWith(MOOD_TARGET)) return pickMood(Number(key.slice(MOOD_TARGET.length)));
    TARGETS.find((target) => target.key === key)?.run();
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
    armed = targetAt(e) ?? null;
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

  <div class="fan" role="group" aria-label={m.quick_add_title()} data-fan>
    <div class="fan-moods" in:fanIn out:fanOut>
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

    {#each ROWS as row, i (row[0].key)}
      <div
        class="fan-row"
        class:is-pair={row.length > 1}
        class:starts-group={GROUP_STARTS.has(i)}
        in:fanIn
        out:fanOut
      >
        {#each row as target (target.key)}
          <button
            class="fan-item"
            class:is-armed={armed === target.key}
            data-fan-target={target.key}
            data-choose={target.key}
            onclick={target.run}
          >
            <span class="fan-icon"><Icon name={target.icon} size={20} /></span>
            <span class="fan-label">{target.label()}</span>
          </button>
        {/each}
      </div>
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
