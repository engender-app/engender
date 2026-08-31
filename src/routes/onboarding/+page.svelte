<script lang="ts">
  /* The first run (F16), rebuilt for phase 5 ticket 26.

     Five settings, one pass. What a person had to leave here and go and find
     afterwards was the flag and the daily check-in, and both are things
     someone decides in the first minute and almost never revisits: the flag
     because it is the app's whole look, the check-in because a journal
     nobody is reminded about is a journal that stops after a week. So the
     flow is welcome, name, flag, scales, lock, check-in, finish, and the
     order and the skip rules live in $lib/onboarding/steps.ts rather than in
     a run of `step === 3` comparisons here.

     Two rules the user set for this ticket, and they are why the foot of
     every step looks the way it does. Every step that stores something
     carries its own Skip, and skipping means the stored default is left
     exactly as it was rather than overwritten with nothing. And every step
     carries a way straight into the app, because someone who opened a diary
     to write in it should never have to answer six questions first.

     The sun (DIRECTION.md, tier 0). Home's flag is the app's one authored
     moment, and this screen is where it is assembled: it starts as a small
     quarter in the corner and grows by one step's worth per step, arriving
     at exactly the size Home draws it a moment later. Picking a flag redraws
     it, ring by ring, in the new stripes. That is the whole of this screen's
     tier-0 budget and it is spent on the one element that carries identity,
     which is the same argument the sun already made on Home.

     Under disguise there is no sun at all, the same answer ADR-0035 gives
     everywhere else: a crisp flag is not deniable at a glance, and this
     screen is not an exception to that just because it comes first. */

  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { sharedAxisX } from '$lib/motion/navigation';
  import { motionDuration } from '$lib/motion/tokens';
  import {
    isSkippable,
    onboardingDestination,
    onboardingSteps,
    stepAfter,
    stepBefore,
    stepIndex,
    sunGrowth,
    type OnboardingStep
  } from '$lib/onboarding/steps';
  import FlagSun from '$lib/components/FlagSun.svelte';
  import ScaleChecklist from '$lib/components/ScaleChecklist.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  /* Keyed, not worded, so the flag names translate with the rest of the
     catalogue. The same eight, in the same order, as Settings' own picker -
     one list would be better still, and moving it is ticket 25's screen,
     not this one's. */
  const PALETTES: [string, () => string][] = [
    ['trans', m.palette_trans],
    ['nonbinary', m.palette_nonbinary],
    ['genderfluid', m.palette_genderfluid],
    ['bisexual', m.palette_bisexual],
    ['lesbian', m.palette_lesbian],
    ['pansexual', m.palette_pansexual],
    ['rainbow', m.palette_rainbow],
    ['agender', m.palette_agender]
  ];

  let step = $state<OnboardingStep>('welcome');
  /** Which way the next step should come in from. Held rather than derived:
      the two directions are the same pair of steps, and only the control
      that was pressed knows which of them happened. */
  let back = $state(false);
  /** Bumped on every flag tap so the bloom is a fresh element and plays
      once per tap rather than once per mount. */
  let bloomPass = $state(0);

  let name = $state('');
  /* Null until the scales step is touched, which is what lets Skip mean
     "leave the stored default alone" rather than "store nothing" - the same
     guard the name step needs, for the same reason. The list still arrives
     with the default set ticked, so nothing is asked of somebody who
     already agrees with it. An empty array is not null: unticking all five
     is a choice, and it is stored like any other. */
  let scales = $state<string[] | null>(null);
  /* What the list draws: the working set once it has been touched, and the
     stored default before that. */
  let tickedScales = $derived(scales ?? prefs.activeScales);

  function toggleScale(key: string) {
    scales = tickedScales.includes(key)
      ? tickedScales.filter((k) => k !== key)
      : [...tickedScales, key];
  }
  let lockOnLeave = $state(false);
  let checkIn = $state(false);
  let checkInTime = $state(prefs.checkInTime);

  /* The flag is the one choice that applies as it is made, because the point
     of making it here is watching the sun answer. So Skip on that step has
     something to put back, unlike every other step, where skipping is simply
     not writing. Read once at mount rather than on entering the step: the
     step can be entered more than once with the back arrow, and the second
     visit would otherwise "restore" the pick made on the first. */
  const paletteOnEntry = prefs.palette;

  /* One step shorter under disguise: the flag step is a wall of pride flags
     with their names under them, which is the most identifying thing in the
     app. steps.ts carries the whole reasoning. */
  let steps = $derived(onboardingSteps(prefs.disguise));
  let index = $derived(stepIndex(steps, step));
  let growth = $derived(sunGrowth(index, steps.length));

  /* The incoming step waits for the outgoing one to finish leaving.
     Svelte starts an `in:` and an `out:` together, and tier 2's own timings
     make the exit shorter than the entrance - so for the length of the exit
     there were two full-screen titles on top of each other, fading in
     opposite directions. On a phone that is a smear; at desktop type sizes
     it reads as the screen loading twice, which is what Alicja saw.

     Material's fade-through is sequential for exactly this reason. The
     delay is the exit's own duration read from the same token the exit
     uses, so the two cannot drift, and it is 0 under reduced motion because
     motionDuration returns 0 there and a crossfade has nothing to wait
     for. */
  function stepIn(
    node: Element,
    params: { back: boolean },
    options: { direction?: 'in' | 'out' | 'both' }
  ) {
    const config = sharedAxisX(node, params, options);
    return { ...config, delay: motionDuration('--dur-fast') };
  }

  function go(to: OnboardingStep) {
    back = stepIndex(steps, to) < index;
    step = to;
  }

  function skip() {
    if (step === 'name') name = '';
    else if (step === 'flag') prefs.palette = paletteOnEntry;
    else if (step === 'scales') scales = null;
    else if (step === 'lock') lockOnLeave = false;
    else if (step === 'checkin') checkIn = false;
    go(stepAfter(steps, step));
  }

  /* One way out, whichever control was pressed. "Straight to the app" from
     step two and "Start writing" from the finish are the same act - keep
     what has been chosen so far, mark the first run done, go - and writing
     them as one function is what stops the two drifting apart the way a
     second copy of this would.

     The toggle on the lock step is a choice to set a PIN, not a PIN:
     nothing turns app lock on until one has been typed twice on the setup
     screen, which then brings the new user Home itself. Leaving early with
     that toggle on therefore still routes through it, because the
     alternative is a switch that was turned on and did nothing. That screen
     carries its own Not now, so changing your mind there costs one tap. */
  function complete() {
    /* Guarded like the other four, and for the same reason: skipping a step
       leaves the stored value alone rather than overwriting it with
       nothing. An empty field wrote an empty name, so skipping the name
       step erased one that was already there - which a first run never has,
       and a first run reached a second time does. Clearing a name is
       Settings' job, where the field is the stored value rather than a
       draft of it. */
    if (name.trim()) prefs.name = name.trim();
    if (scales) prefs.activeScales = scales;
    if (lockOnLeave) prefs.lockOnLeave = true;
    if (checkIn) {
      prefs.checkInEnabled = true;
      prefs.checkInTime = checkInTime;
    }
    prefs.onboarded = true;
    goto(onboardingDestination());
  }
</script>

<div class="screen screen-setup">
  {#if !prefs.disguise}
    <!-- The same deliberate bleed Home's header makes: the scroll region
         pads every screen clear of the display cutout, and this pulls back
         up by exactly that inset so the sun's centre lands on the window's
         true top right corner. Decoration crosses the inset; nothing
         readable does, which is why the step's own text starts below it. -->
    <div class="setup-sky" aria-hidden="true">
      <div class="setup-sun" style={`--grow:${growth}`}>
        <!-- Keyed on the palette so picking a flag redraws the sun rather
             than recolouring the rings in place. FlagSun keeps its own rule
             for Home, where a palette change arrives with a navigation and
             replaying would be a second entrance; here the redraw is the
             answer to the tap and the reason the step exists. -->
        {#key prefs.palette}
          <FlagSun />
        {/key}
      </div>
    </div>
  {/if}

  <div class="setup">
    <div class="setup-head">
      {#if step !== 'welcome'}
        <!-- NAV-006: onboarding had no way back between steps at all, so a
             typo in the name could only be finished past. -->
        <button class="icon-btn press" data-back aria-label={m.back()} onclick={() => go(stepBefore(steps, step))}>
          <Icon name="arrowLeft" />
        </button>
      {/if}
    </div>

    <div class="setup-stage">
      {#key step}
        <div
          class="setup-step"
          in:stepIn={{ back }}
          out:sharedAxisX={{ back }}
        >
          {#if step === 'welcome'}
            <h1 class="setup-title">{m.ob_welcome_title()}</h1>
            <p class="setup-def">{m.ob_welcome_def()}</p>
            <p class="setup-body">{m.ob_welcome_body()}</p>
          {:else if step === 'name'}
            <h1 class="setup-title">{m.ob_name_title()}</h1>
            <p class="setup-body">{m.ob_name_body()}</p>
            <input
              class="input"
              id="ob-name"
              name="ob-name"
              placeholder={m.ob_name_placeholder()}
              autocomplete="off"
              bind:value={name}
            />
          {:else if step === 'flag'}
            <h1 class="setup-title">{m.ob_flag_title()}</h1>
            <p class="setup-body">{m.ob_flag_body()}</p>
            <div class="palette-grid setup-flags" role="radiogroup" aria-label={m.colour_palette()}>
              {#each PALETTES as [key, label] (key)}
                <button
                  class="palette-swatch press"
                  class:is-active={prefs.palette === key}
                  role="radio"
                  aria-checked={prefs.palette === key}
                  data-palette-pick={key}
                  onclick={() => {
                    prefs.palette = key;
                    bloomPass++;
                  }}
                >
                  {#if prefs.palette === key}
                    {#key bloomPass}<span class="swatch-bloom" aria-hidden="true"></span>{/key}
                  {/if}
                  <span class="swatch-preview" data-swatch={key}></span>
                  <span class="swatch-name">{label()}</span>
                </button>
              {/each}
            </div>
          {:else if step === 'scales'}
            <h1 class="setup-title">{m.ob_track_title()}</h1>
            <p class="setup-body">{m.ob_track_body()}</p>
            <!-- One list, and Settings draws the same one. Two copies is
                 how the flag picker ended up cramped on one screen and
                 readable on the other. No "add your own" row here: it
                 leaves the flow, and the first run has nowhere to come
                 back to. -->
            <ScaleChecklist ticked={tickedScales} onToggle={toggleScale} />
          {:else if step === 'lock'}
            <h1 class="setup-title">{m.ob_lock_title()}</h1>
            <p class="setup-body">{m.ob_lock_body()}</p>
            <!-- The app-lock toggle that used to head this list is gone
                 with the gate it turned on (ticket 53): how the journal
                 opens is now one choice made in the security module, and a
                 PIN is one of its access modes rather than a switch here.
                 What is left is the one thing this step still decides -
                 whether leaving the app locks it. Ticket 54 brings the
                 module itself into the flow. -->
            <ListCard>
              <ListRow
                key="lock-on-leave"
                title={m.lock_on_leave_title()}
                subtitle={m.lock_on_leave_sub()}
                chevron={false}
              >
                {#snippet trailing()}
                  <Switch
                    checked={lockOnLeave}
                    label={m.lock_on_leave_title()}
                    onChange={(v) => (lockOnLeave = v)}
                  />
                {/snippet}
              </ListRow>
            </ListCard>
          {:else if step === 'checkin'}
            <h1 class="setup-title">{m.ob_checkin_title()}</h1>
            <p class="setup-body">{m.ob_checkin_body()}</p>
            <ListCard>
              <ListRow key="check-in" title={m.checkin_title()} subtitle={m.checkin_sub()} chevron={false}>
                {#snippet trailing()}
                  <Switch checked={checkIn} label={m.checkin_title()} onChange={(v) => (checkIn = v)} />
                {/snippet}
              </ListRow>
              <div class="setup-reveal" class:is-open={checkIn} data-checkin-extra>
                <div>
                  <div class="setup-time">
                    <label class="field-label" for="ob-checkin-time">{m.checkin_time()}</label>
                    <input
                      class="input"
                      type="time"
                      id="ob-checkin-time"
                      name="ob-checkin-time"
                      bind:value={checkInTime}
                    />
                  </div>
                </div>
              </div>
            </ListCard>
          {:else}
            <h1 class="setup-title">{name.trim() ? m.ob_done_title_named({ name: name.trim() }) : m.ob_done_title()}</h1>
            <p class="setup-body">{m.ob_done_body()}</p>
          {/if}
        </div>
      {/key}
    </div>

    <div class="setup-foot">
      <div
        class="rail setup-rail"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
        aria-label={m.ob_step_of({ step: String(index + 1), total: String(steps.length) })}
      >
        <i style={`transform: scaleX(${(index + 1) / steps.length})`}></i>
      </div>

      {#if step === 'done'}
        <button class="btn btn-primary" data-finish onclick={complete}><span>{m.start_journey()}</span></button>
      {:else if step === 'welcome'}
        <button class="btn btn-primary" data-next onclick={() => go(stepAfter(steps, step))}>
          <span>{m.ob_start_setup()}</span>
        </button>
      {:else}
        <button
          class="btn btn-primary"
          data-next
          onclick={() => go(stepAfter(steps, step))}
        >
          <span>{m.continue()}</span>
        </button>
      {/if}

      <div class="setup-outs">
        {#if isSkippable(step)}
          <button class="btn btn-ghost" data-skip-step onclick={skip}>
            <span>{m.skip()}</span>
          </button>
        {/if}
        {#if step !== 'done'}
          <button class="btn btn-ghost" data-leave-setup onclick={complete}><span>{m.ob_leave()}</span></button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* A chromeless column with a fixed frame and one moving part. The back
     arrow, the progress rail and the buttons hold still at the top and the
     bottom of the screen; only the step between them crosses, on tier 2's
     shared axis, because the steps are a sequence and a sequence has a
     direction. The foot is pushed to the bottom of the viewport rather than
     sitting right under the content, so on the five steps that fit it is in
     the same place and a thumb can stay where it is. On the two that do not -
     the eight scales, the eight flags at 200% text - it sits at the end of
     the content and is scrolled to, which is what a form does.

     The rail sits with the buttons and not under the sun. It is the one piece
     of furniture that had to move: the sun owns the top right corner of this
     screen the way it owns Home's, and text laid over a flag's white band on
     a light theme is text nobody can read. */
  /* How much bigger the sun is than the 350px it is drawn at. One number,
     because the head's reserve is the sun's own radius and the two must not
     be able to disagree: a sun grown without the room under it grown too is
     a flag with a title inside it.

     Declared here rather than on .setup, which is where it was first written
     and where it did nothing: the sun lives in .setup-sky, and .setup-sky is
     .setup's sibling rather than its child. A custom property that never
     reaches its reader is not a default, it is an invalid value - the whole
     `calc()` around it fails, the `transform` with it, and the sun draws at
     full size wherever it happens to be anchored. The fallback below is the
     belt to that braces. */
  .screen-setup { display: flex; flex-direction: column; --sun-mult: 1; }
  .setup {
    flex: 1 0 auto;
    display: flex; flex-direction: column;
    width: 100%; max-width: 420px; margin: 0 auto;
    position: relative; z-index: 1;
  }

  /* The sun's layer, and the app's one deliberate bleed past the safe area
     besides Home's header. The scroll region pads every screen clear of the
     display cutout; this pulls itself back up by exactly that inset and out
     past .screen's own side padding, so the sun's centre lands on the
     window's true top right corner and the quarter it draws is a quarter of a
     circle rather than of a padded box. */
  .setup-sky {
    position: absolute;
    top: calc(-1 * var(--inset-top));
    left: calc(-1 * var(--space-5));
    right: calc(-1 * var(--space-5));
    /* Taller than the sun itself needs, because the sweep's arcs run outside
       its outer edge and this is the room they travel in. Costs nothing: the
       layer is absolutely positioned, so what holds the step's text clear of
       the flag is .setup-head's reserve and not this. */
    height: calc(280px + var(--inset-top));
    overflow: hidden;
    z-index: 0;
    pointer-events: none;
  }
  /* Tier 0: the sun grows one step's worth per step and arrives at scale 1,
     which is the resting size Home draws a moment later - so the handover
     between the two screens is one object at one size rather than two suns.
     --grow is set per step by the route. */
  .setup-sun {
    position: absolute; top: 0; right: 0; width: 0; height: 0;
    transform: scale(calc(var(--grow, 1) * var(--sun-mult, 1)));
    transition: transform var(--dur-slow) var(--ease-out);
  }

  /* The sun's room, reserved on every step rather than grown with it. The
     sun reaches 175px down from the window's top corner at full size, and a
     title that started above that would be legible on the welcome step and
     sitting inside a flag by the finish. Reserving the whole height from the
     first step keeps the text where it is and gives the growth something to
     happen in, which is the opposite of the alternative: content sliding
     down the screen seven times while someone is reading it.

     The back arrow lives in that space, at the top left, where the sun's
     quarter never reaches. */
  .setup-head { min-height: calc(176px * var(--sun-mult, 1)); padding-top: var(--space-2); }

  /* One grid cell holding every step, so the one arriving and the one
     leaving overlap instead of stacking and doubling the screen's height
     mid-transition. */
  /* No clip of its own for the 24px the outgoing step travels: .app-main is
     already overflow-x: hidden, so the travel never widens the page, and
     clipping here as well would cut the focus ring off the outermost swatch
     in the flag grid. */
  .setup-stage { display: grid; flex: 1; padding-top: var(--space-6); }
  .setup-stage > * { grid-area: 1 / 1; }
  /* Centred in whatever the stage has left over, rather than pinned under the
     sun's reserve. The welcome, the name and the finish are two or three
     blocks each, and top-aligning them left a third of the screen empty
     between the last line and the buttons - the reserve above is the sun's
     room, and the room below it is not. The steps that do not fit fill the
     cell and scroll, where centring makes no difference. */
  .setup-step {
    display: flex; flex-direction: column; justify-content: center;
    gap: var(--space-3);
  }

  /* The flag step's own grid. Settings runs the same swatches four across,
     which leaves about 80px under each name and cut "Genderfluid" and
     "Transgender" to an ellipsis - on the one screen where choosing between
     them is the whole task, and where a flag nobody can read the name of is
     not a choice. Two across, the name on the swatch's own line rather than
     under it, and nothing clipped at any text size. */
  /* Both classes, because .palette-grid's four columns are declared in
     screens.css and would otherwise win the tie on source order. */
  .palette-grid.setup-flags { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
  .setup-flags .palette-swatch {
    flex-direction: row; align-items: center; justify-content: flex-start;
    gap: var(--space-3); padding: var(--space-3);
    position: relative;
    border: 1px solid var(--outline);
  }
  .setup-flags .swatch-preview { width: 44px; height: 44px; flex: none; }
  .setup-flags .swatch-name {
    font-size: var(--text-sm);
    white-space: normal; overflow: visible; text-overflow: clip;
    text-align: left; line-height: 1.25;
  }
  .setup-flags .palette-swatch.is-active { border-color: var(--accent); }

  /* The bloom. Picking a flag is the one tap on this screen that changes the
     whole app, and a ring opening out of the swatch is what says so - it is
     the same gesture the sun above answers with, at the size of the control
     that caused it. One place, once per tap: the craft floor's line about a
     moment rather than an effect.

     It rests where it ends, past its own edge and invisible, so the 1ms clamp
     has somewhere true to strand it. */
  /* Over the whole tile rather than a ring around the 44px preview, and on
     the authored duration rather than --dur-slow. The first pass was a 2px
     outline growing out of a small circle over 380ms, which is a thing you
     have to already be looking at to catch - and the point of it is to answer
     a tap you have just made somewhere else on the screen. It opens out of
     the tile now, at the tile's own shape, and takes nearly twice as long
     doing it. */
  .swatch-bloom {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
    border: 2px solid var(--accent);
    background: var(--accent-soft);
    pointer-events: none;
    transform: scale(1.35);
    opacity: 0;
    animation: swatch-bloom var(--dur-authored) var(--ease-out) 1;
  }
  @keyframes swatch-bloom {
    from { transform: scale(1); opacity: 0.85; }
    to { transform: scale(1.35); opacity: 0; }
  }
  :global(html[data-a11y-motion='reduce']) .swatch-bloom { animation: none; }
  @media (prefers-reduced-motion: reduce) {
    .swatch-bloom { animation: none; }
  }

  /* The scales step draws no surface of its own any more (phase 5 ticket 35):
     the eight preset cards became one list card of tickable rows, shared with
     Settings, and a list card is what the lock step below already uses. Its
     own styles went with it. */
  .setup-title {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-medium);
    letter-spacing: var(--display-track);
    line-height: var(--leading-display);
    text-wrap: balance;
    margin: 0;
  }
  /* The dictionary line on the welcome step: the app's name, read back as the
     word it is. Italic and muted so it sits between the title and the pitch
     as an aside rather than a second heading. */
  .setup-def { color: var(--text-2); font-style: italic; margin: 0; }
  /* Only the welcome pitch justifies, and only because the dictionary line
     above it sets a print register the ragged edge would break. */
  .setup-def + .setup-body { text-align: justify; }
  .setup-body { color: var(--text-2); margin: 0; }
  .setup-step .input { margin-top: var(--space-2); }
  .setup-time { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); }
  .setup-time .input { width: 118px; margin: 0; }

  /* Tier 3, a change within the screen: the row that depends on a switch
     opens its own height rather than making the foot of the screen jump. A
     grid track rather than a JS height tween, so the reduced-motion clamp in
     base.css reaches it like any other CSS transition. */
  .setup-reveal {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--dur-med) var(--ease-out);
  }
  .setup-reveal > * { overflow: hidden; }
  .setup-reveal.is-open { grid-template-rows: 1fr; }
  /* The kit draws a row's separator with `.kit-row + .kit-row`, and this
     wrapper stands between the two rows so the adjacency never matches. The
     card lost its hairline and read as one block rather than as two settings.
     Same geometry as the kit's own rule, and only while the row is showing -
     a 1px line at the top of a track collapsed to 0fr is a line with nothing
     under it. */
  .setup-reveal.is-open :global(.kit-row::before) {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: var(--hairline);
  }

  .setup-foot {
    margin-top: auto;
    padding: var(--space-7) 0 var(--space-4);
    display: flex; flex-direction: column; gap: var(--space-3);
  }
  /* Progress as a length rather than as seven dots. Seven dots at 8px is a
     row of punctuation; a rail says how far along the flow is at a glance and
     grows on the same easing the sun above it does. Also .rail. */
  .setup-rail { margin-bottom: var(--space-2); }
  /* The two ways past a step, stacked and full width. Side by side is what
     they were, and it gave each of them half a phone: "Straight to the app"
     wrapped to two lines and overflowed its own button, and Polish's "Od razu
     do aplikacji" is a character longer. Both are ghost buttons, so a column
     of them under the primary reads as two quiet alternatives rather than as
     two more things to do. */
  .setup-outs { display: flex; flex-direction: column; gap: var(--space-1); }

  /* ---------- the first run, wide ----------

     Nothing of its own. app.css already centres every screen in a 640px
     column at desktop width, and the first run is a screen: the same column,
     the same measure, the sun in its own top right corner exactly the way
     Home draws it. That is what "looks like the rest of the app" means here.

     What stood here was a two-column split - the step centred in the left
     half, the flag filling the right. It answered the first complaint (a
     narrow column adrift in a wide window with the flag in a far corner) and
     created two worse ones. The block was centred in half a window rather
     than in the window, so it read as pushed to one side on every screen but
     a laptop's. And the three rows hugged their content and re-centred as a
     block, so every step change moved the whole composition vertically -
     which is what "glitches as if it was loading twice" actually was.

     The phone layout has neither problem, because its frame is fixed: the
     head reserves the sun's room at the top, the foot sits at the bottom, and
     the stage between them fills whatever is left and centres its own
     content. Only the step moves. Letting the desktop have that same frame
     inside the app's own column is both fixes and no new code.

     What the width does buy is where the sun hangs from. On a phone it hooks
     round the top right corner, which is Home's own treatment and the only
     place a 350px circle fits. A desktop window has room, and hooking it
     round a corner there wastes three quarters of the drawing on the far side
     of two edges. So its centre comes off the corner and sits on the top edge
     instead, inside the window rather than past it: only the upper half is
     cut, and the whole lower half of the flag shows as concentric arcs
     hanging into the page. Half again as big, with the head's reserve growing
     by the same number, so the step's first line still starts underneath it
     rather than inside it.

     The layer has to escape the column to do that - app.css caps .screen at
     640px and centres it, and the sun belongs to the window rather than to
     the measure. 100cqw rather than 100vw: the demo bar's phone frame works
     by constraining the app container, and a viewport unit would walk
     straight through it. */
  @container app (min-width: 1024px) {
    /* Bigger than the phone's, and no bigger than that. The sun hangs 192px
       into the page at the finish; a step centred in a 900px window starts
       around 240px down, so the flag stops above the first line rather than
       behind it. Growing it further is what puts a title inside a flag on a
       short window, and there is no height query to catch that: the app
       container is declared inline-size, so a rule cannot ask how tall the
       window is. */
    .screen-setup { --sun-mult: 1.1; }
    .setup {
      /* Centred in the window, which is the whole of the complaint this
         answers. The step used to sit under a 264px reserve with its buttons
         pinned to the bottom edge, so the content was pushed low and the
         empty space was all in one place. */
      justify-content: center;
    }
    /* Out of the flow, so what gets centred is the step and its buttons
       rather than the step, its buttons and the sun's empty room. The arrow
       stays where it is on a phone: top left, clear of the flag. */
    .setup-head {
      position: absolute;
      top: var(--space-2);
      left: 0;
      min-height: 0;
      z-index: 2;
    }
    .setup-stage { flex: 0 0 auto; }
    .setup-foot { margin-top: var(--space-8); }

    .setup-sky {
      left: 50%;
      right: auto;
      width: 100cqw;
      margin-left: -50cqw;
      height: calc(300px + var(--inset-top));
    }
    /* Off the corner and onto the top edge, and left of where a corner would
       have put it: the arcs close on both sides instead of running off the
       window, and the flag sits over the column it belongs to rather than
       away in the margin. Its lowest point is a quarter of the way down a
       laptop screen, which is above where the centred step starts. */
    .setup-sun { top: 0; right: auto; left: 62%; }
  }
</style>
