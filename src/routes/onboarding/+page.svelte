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
  let appLock = $state(false);
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
    else if (step === 'lock') {
      appLock = false;
      lockOnLeave = false;
    } else if (step === 'checkin') checkIn = false;
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
    goto(onboardingDestination(appLock));
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
            <ListCard>
              <ListRow key="app-lock" title={m.app_lock()} subtitle={m.ob_pin_sub()} chevron={false}>
                {#snippet trailing()}
                  <Switch checked={appLock} label={m.app_lock()} onChange={(v) => (appLock = v)} />
                {/snippet}
              </ListRow>
              <!-- Tier 3: the second row opens its own height rather than
                   making the foot of the screen jump. A grid track from 0fr
                   to 1fr rather than a JS height tween, so the 1ms clamp in
                   base.css reaches it like any other CSS transition and the
                   reduced-motion path is an instant cut with nothing to
                   remember. -->
              <div class="setup-reveal" class:is-open={appLock} data-lock-extra>
                <div>
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
                </div>
              </div>
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
