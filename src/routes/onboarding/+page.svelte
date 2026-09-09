<script lang="ts">
  /* The first run (F16), rebuilt for phase 5 ticket 26.

     Five settings, one pass. What a person had to leave here and go and find
     afterwards was the flag, which is the app's whole look and something
     someone decides in the first minute and almost never revisits. So the
     flow is welcome, name, flag, scales, areas, lock, permissions, finish,
     and the order and the skip rules live in $lib/onboarding/steps.ts rather
     than in a run of `step === 3` comparisons here. The daily check-in used
     to be the last question and is not asked here any more (phase 10
     redesign ticket 31): the permissions step names it as one of the things
     a notification is for, and the switch stays on the reminders screen.

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
  import { isAndroid } from '$lib/platform';
  import { flushPreferences, prefs, setPreferenceDurably } from '$lib/data/prefs/store.svelte';
  import { fieldPart } from '$lib/motion/navigation';
  import { blindEdge } from '$lib/motion/stepBlind';
  import { motionDuration } from '$lib/motion/tokens';
  import { bootState, submitAccessModeSetup } from '$lib/stores/boot.svelte';
  import { needsOnboardingAccessMode } from '$lib/stores/boot-state';
  import AccessModeSetup, {
    accessModeSetupErrorMessage,
    accessModeTitle,
    type AccessSetupMode
  } from '$lib/components/AccessModeSetup.svelte';
  import { completeSetup } from '$lib/onboarding/complete';
  import {
    isSkippable,
    onboardingDestination,
    onboardingSteps,
    restoreSteps,
    stepAfter,
    stepBefore,
    stepIndex,
    sunGrowth,
    type OnboardingStep
  } from '$lib/onboarding/steps';
  import type { PickedArchive } from '$lib/data/archive/pick';
  import type { RestoreProgress } from '$lib/data/journal/restore';
  import {
    pickForRestore,
    runRestore,
    runVerify,
    type RestoreFailureKind
  } from '$lib/data/journal/restoreFlow';
  import { importFailureMessage, verifyFailureMessage } from '$lib/data/vocabulary/archiveErrorLabels';
  import { createProgress } from '$lib/components/progress.svelte';
  import { wipe } from '$lib/motion/reveal';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { DEFAULT_ONBOARDING_AREAS } from '$lib/data/pinnedRows';
  import { hubSectionRoleIndex, hubSections, type HubSection } from '$lib/data/hubRows';
  import { hubGroupHeading, hubRowTitle, hubRowLine } from '$lib/data/vocabulary/hubLabels';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import FlagSun from '$lib/components/FlagSun.svelte';
  import ScaleChecklist from '$lib/components/ScaleChecklist.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import DisguisePreview from '$lib/components/DisguisePreview.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import PermissionList from '$lib/components/PermissionList.svelte';

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

  /* Null until touched, `scales`' own reason: Skip has to mean "leave
     `onboardingAreas` alone" rather than "store nothing" (phase 10 redesign
     ticket 22). Reads `prefs.onboardingAreas` rather than
     `DEFAULT_ONBOARDING_AREAS` directly for the same reason `tickedScales`
     reads `prefs.activeScales` - a first run reached a second time meets
     whatever it answered last time, not the app's own default. */
  let areas = $state<string[] | null>(null);
  let tickedAreas = $derived(areas ?? prefs.onboardingAreas ?? (DEFAULT_ONBOARDING_AREAS as readonly string[]));

  function toggleArea(key: string) {
    areas = tickedAreas.includes(key)
      ? tickedAreas.filter((k) => k !== key)
      : [...tickedAreas, key];
  }

  /* The hub's own groups and rows, exactly as `hubRows.ts` and `hubLabels.ts`
     hand them to the More hub - so this step is the same list under the same
     headings, met once here and once more on the hub (the ticket's own
     phrase). Passed a bare, empty reading rather than a real one: nobody has
     written anything or hidden an area yet on a first run, which resolves
     every row to its standing "what is behind it" line, `hubRowLine`'s
     `not-yet` case - the same line the hub shows a fresh journal. Hosted rows
     (seven of the twenty-seven) are not `hubSections`' business and so do not
     appear here either; pinning one of them is ticket 14's screen, which
     `pinnedRows.ts` already notes it inherits.

     Support and Media are left off (Alicja, on the sign-off renders):
     neither is something a person tracks. Support fronts Safe space and a
     resource list, and Media fronts what an entry carries rather than a
     practice of its own - a photo, a recording, a document, all attached to
     something written rather than kept on their own dated stream. Filtered
     here rather than in `hubSections` itself, which the More hub still
     draws whole: this is a question about what to track, and the hub is
     navigation to everything regardless. */
  const TRACKABLE_GROUPS = new Set<HubSection['key']>(['body', 'health', 'transition']);
  const today = todayEpochDay();
  let sections = $derived(
    hubSections({ todayEpochDay: today, lastWrites: {}, states: {} }).filter((section) =>
      TRACKABLE_GROUPS.has(section.key)
    )
  );

  let lockOnLeave = $state(false);

  /* Setup's last answer (ADR-0079, phase 10 redesign ticket 32). Held like
     every other one and never read back off `prefs`, which matters more
     here than anywhere else in the flow: assigning `prefs.disguise` is what
     flips the Android launcher alias, and that closes the app. So this
     starts at false rather than at the stored value - a first run has
     nothing stored to disagree with, and the demo's own first-run control
     is the only way to reach setup with it already on, where the answer
     someone gives here is still the answer. complete() applies it, last. */
  let disguise = $state(false);

  /* The access-mode module's own working state (ticket 53's four modes,
     wired in at this one step by ticket 54). Local to this step rather than
     read off the gate: on a brand new install this page is what renders
     while `bootState` is still `needs-setup`, not JournalGate, so there is
     no other screen's state to share. */
  let accessChosen = $state<AccessSetupMode | null>(null);
  let accessBusy = $state(false);
  let accessError = $state('');

  /** The setup module's answer, the same submit path JournalGate's own
      unlock screen uses for a returning install's setup (boot.svelte.ts).
      Device-bound's refusal and a biometric authenticator that will not
      answer are outcomes to render rather than throws, for the same reason
      they are there: turning a mode down is not this screen failing. */
  async function chooseAccessMode(chosen: AccessSetupMode, secret: string) {
    if (accessBusy) return;
    accessBusy = true;
    accessError = '';
    const result = await submitAccessModeSetup(chosen, secret);
    accessBusy = false;
    if (result !== 'ok') accessError = accessModeSetupErrorMessage(result);
  }

  /* The flag is the one choice that applies as it is made, because the point
     of making it here is watching the sun answer. So Skip on that step has
     something to put back, unlike every other step, where skipping is simply
     not writing. Read once at mount rather than on entering the step: the
     step can be entered more than once with the back arrow, and the second
     visit would otherwise "restore" the pick made on the first. */
  const paletteOnEntry = prefs.palette;

  /* Somebody on a new phone who already has an archive (ticket 36). The
     restore's own working state: which file, which password, whether it has
     been proved to open, and what to say if it has not.

     `archiveReady` is the whole safety of this path. A first run has no
     journal to write into until the access mode step makes the key, so the
     restore step can only *verify* - decrypt, parse and validate, writing
     nothing - and the archive goes in at the finish, which is where setup
     already does all of its writing in one pass. So a cancel, a wrong
     password or a file that is not an archive all happen before a byte of
     this device is touched, and the way out of them is the way in reversed.
     This flag is what says the file on screen is the one that was proved:
     picking another file or editing the password puts it back to false. */
  let restoring = $state(false);
  let picked = $state.raw<PickedArchive | null>(null);
  let archivePass = $state('');
  let archiveReady = $state(false);
  let archiveBusy = $state(false);
  let archiveError = $state('');
  /* The walkthrough's handle on which refusal this is, matching the Settings
     screen's own `data-import-error` so the suite grips a kind rather than a
     sentence in one language. */
  let archiveErrorKind = $state<RestoreFailureKind | ''>('');
  const archiveProgress = createProgress();

  /* One flow for everybody (ADR-0079): setup does not vary by disguise,
     and steps.ts says why the shorter flow it used to offer went. It does
     vary by whether a journal is being restored, which is a different axis
     and the one thing an archive can actually answer for a person: the steps
     whose answers it carries are dropped rather than asked and overwritten
     (ticket 36, steps.ts). */
  let steps = $derived(restoring ? restoreSteps() : onboardingSteps());
  let index = $derived(stepIndex(steps, step));
  let growth = $derived(sunGrowth(index, steps.length));

  /* Whether this step is the forced choice rather than the toggle under it
     (ticket 54): true from the moment the flow reaches the lock step until
     a mode is actually set up, which is the one stretch with no Skip, no
     back arrow and no "leave setup" - the same hard-gate rule JournalGate
     already holds a returning install to, here because reading `bootState`
     directly is simpler than a second flag mirroring it. */
  let awaitingAccessMode = $derived(step === 'lock' && needsOnboardingAccessMode(bootState));

  let question = $derived.by(() => {
    if (awaitingAccessMode) {
      return accessChosen === null ? m.am_setup_title() : accessModeTitle(accessChosen);
    }
    if (step === 'done') {
      if (restoring && archiveReady) return m.ob_restore_done_title();
      return name.trim() ? m.ob_done_title_named({ name: name.trim() }) : m.ob_done_title();
    }
    return QUESTION[step]();
  });

  let line = $derived.by(() => {
    if (awaitingAccessMode) return m.am_setup_body();
    if (step === 'done' && restoring && archiveReady) return m.ob_restore_done_body();
    return LINE[step]();
  });

  /* The flag being left, as a colour. `--field` is published on <html> the
     instant the tap lands, so the only way the old colour can still be on
     screen is for something to have written it down. Kept in a plain
     variable rather than in state, and never read by the effect that sets
     the two that are: an effect that reads what it writes is how
     refreshActiveFlag once looped at boot. */
  let shownField: string | undefined;
  let leavingField = $state<string | null>(null);
  /** Bumped per pick, so the wipe is a fresh element and plays once per tap
      rather than once per mount. */
  let leavingPass = $state(0);

  $effect(() => {
    const hex = activeFlag.field?.hex;
    if (hex === shownField) return;
    const was = shownField;
    shownField = hex;
    /* Nothing to wipe away on the first paint, and nothing to wipe under
       disguise, where the field is `--surface-2` and there is no flag. */
    if (!was || !hex) return;
    leavingField = was;
    leavingPass++;
    const done = setTimeout(() => (leavingField = null), motionDuration('--dur-authored') + 80);
    return () => clearTimeout(done);
  });

  /** Which of the two suns paints on top, for as long as the redraw takes.

      A keyed block's outgoing element and its incoming one are both in the
      DOM together and the order they sit in is the framework's business, not
      this screen's - so the layer is stated rather than inferred. Written as
      a transition because that is the only thing here that holds a
      declaration for exactly the length of a change and then lets go of it.

      The length is the sun's own entrance: its outermost ring is the widest
      and is drawn first, so once --dur-authored is up it covers everything
      underneath and the flag below it can go. Read per call rather than
      held, because the token is a stylesheet value and not state - and zero
      under reduced motion, where the rings are simply there and there is
      nothing to cover. */
  function layer(_node: Element, params: { z: number }) {
    return { duration: motionDuration('--dur-authored'), css: () => `z-index: ${params.z}` };
  }

  function go(to: OnboardingStep) {
    step = to;
  }

  /* The question, and it is the whole of what a step says at display size
     (DIRECTION.md rule 12). Read off a table rather than written into ten
     branches of markup, because the field holds one question wherever the
     flow is and the markup should say that once.

     Two steps answer for themselves. The access-mode step asks the module's
     own question while the module is walking through its states, and the
     finish greets by name where there is a name and says what a restore is
     about to do where there is an archive. */
  const QUESTION: Record<OnboardingStep, () => string> = {
    welcome: m.ob_welcome_title,
    restore: m.ob_restore_title,
    name: m.ob_name_title,
    flag: m.ob_flag_title,
    scales: m.ob_track_title,
    areas: m.ob_areas_title,
    lock: m.ob_lock_title,
    permissions: m.ob_perms_title,
    disguise: m.ob_disguise_title,
    done: m.ob_done_title
  };

  /* One line under the field: what the answer does. The welcome is the one
     step whose slot holds two paragraphs and it renders them itself. */
  const LINE: Record<OnboardingStep, () => string> = {
    welcome: () => '',
    restore: m.ob_restore_body,
    name: m.ob_name_body,
    flag: m.ob_flag_body,
    scales: m.ob_track_body,
    areas: m.ob_areas_body,
    lock: m.ob_lock_body,
    permissions: m.ob_perms_body,
    disguise: m.ob_disguise_body,
    done: m.ob_done_body
  };

  /* The welcome's second action. Quiet, and it changes the flow rather than
     opening anything: what it settles is that this is a person with a
     journal already, which is the fact every later step reads. */
  function beginRestore() {
    restoring = true;
    archiveError = '';
    archiveErrorKind = '';
    go('restore');
  }

  /** Back to the welcome as a new person, with nothing written and the
      archive untouched - the answer to a cancel, a refusal and a change of
      mind alike. Written as a step assignment rather than through go(),
      because the list itself is about to change under it and go() reads the
      list to find where it is.

      What it does not do is throw away the file and the password. Nothing
      here has ever been written anywhere - the draft is two variables in
      this component - and a person who backs out to read the welcome again,
      or who taps the arrow out of the habit every other step has taught
      them, should not have to find the file a second time. Coming back
      through the same control finds the form as it was left. Only the
      refusal is cleared, because it is about an attempt that is over. */
  function abandonRestore() {
    step = 'welcome';
    restoring = false;
    archiveError = '';
    archiveErrorKind = '';
    archiveProgress.abandon();
  }

  /** Anything that makes the file on screen no longer the file that was
      proved to open. */
  function unproveArchive() {
    archiveReady = false;
    archiveError = '';
    archiveErrorKind = '';
  }

  async function chooseArchive() {
    try {
      const chosen = await pickForRestore();
      if (!chosen) return; // backed out of the picker, which says nothing
      unproveArchive();
      if ('ok' in chosen) {
        archiveErrorKind = chosen.kind;
        archiveError = verifyFailureMessage(chosen.kind);
        return;
      }
      picked = chosen.picked;
    } catch {
      archiveErrorKind = 'failed';
      archiveError = m.imp_picker_failed();
    }
  }

  /** The restore step's own act: prove the file opens, and go on if it does.
      Nothing is written here (restoreFlow.ts's runVerify takes no driver and
      no file store), which is what lets this run before the access mode step
      has made a key for anything to be written into. */
  async function checkArchive() {
    if (archiveBusy) return;
    archiveBusy = true;
    archiveError = '';
    archiveErrorKind = '';
    archiveProgress.start();
    const result = await runVerify(picked, archivePass, (done, total) =>
      archiveProgress.report(done, total)
    );
    archiveBusy = false;
    if (!result.ok) {
      archiveProgress.abandon();
      archiveErrorKind = result.kind;
      archiveError = verifyFailureMessage(result.kind);
      return;
    }
    await archiveProgress.finish();
    archiveReady = true;
    go(stepAfter(steps, 'restore'));
  }

  function skip() {
    if (step === 'name') name = '';
    else if (step === 'flag') prefs.palette = paletteOnEntry;
    else if (step === 'scales') scales = null;
    else if (step === 'areas') areas = null;
    else if (step === 'lock') lockOnLeave = false;
    /* The permissions step is not in this list, and that is the whole of
       what skipping it does (ticket 31). Its answers live in the OS rather
       than in `prefs`, so there is no stored default for a Skip to protect:
       nothing was granted, nothing is revoked, and every row is still there
       under /settings/permissions. */
    else if (step === 'disguise') disguise = false;
    go(stepAfter(steps, step));
  }

  /* One way out, whichever control was pressed. "Straight to the app" from
     an early step and "Start writing" from the finish are the same act -
     keep what has been chosen so far, mark the first run done, go - and
     writing them as one function is what stops the two drifting apart the
     way a second copy of this would.

     Reachable only once the access mode is settled (ticket 54): that step
     is what creates the keystore this function's writes need, so an early
     "leave setup" cannot call this directly - leave() below routes it
     through the lock step first, the same way the old app-lock toggle used
     to route an early leave through its own PIN screen before that was one
     choice made in the security module rather than two. */
  async function complete() {
    /* The archive goes in here and nowhere else (ticket 36), and ahead of
       everything below it.

       This is the one moment in a restored first run when the journal both
       exists and is open: the access mode step made the key a step or two
       ago, and until it did there was nothing on this device to write into.
       Ahead of `writeAnswers` because a Replace installs the archive's own
       portable preferences (ADR-0003) and anything setup settled on this
       device has to land on top of them - and ahead of the disguise for the
       harder reason complete.ts gives, that applying the disguise closes the
       app on Android, so a restore sequenced after it would be a restore
       that never ran.

       Outside completeSetup rather than as a fifth thing inside it, which
       its own docblock rules out: it sequences four things and knows nothing
       about journals. A failure here says so and stays put rather than
       marking the first run done over a journal that is still empty. */
    if (restoring && archiveReady) {
      if (archiveBusy) return;
      archiveBusy = true;
      archiveError = '';
      archiveErrorKind = '';
      archiveProgress.start();
      const result = await runRestore(picked, archivePass, 'replace', (progress: RestoreProgress) =>
        archiveProgress.report(progress.done, progress.total)
      );
      archiveBusy = false;
      if (!result.ok) {
        archiveProgress.abandon();
        archiveErrorKind = result.kind;
        archiveError = importFailureMessage(result.kind);
        return;
      }
      await archiveProgress.finish();
    }

    /* The order is onboarding/complete.ts's, and it is there rather than
       here because the disguise makes it load-bearing: applying it closes
       the app on Android, so every other answer has to be in SQLite first
       or a first run that ends in a disguise ends in nothing. */
    void completeSetup({
      writeAnswers() {
        /* Guarded like the other four, and for the same reason: skipping a
           step leaves the stored value alone rather than overwriting it
           with nothing. An empty field wrote an empty name, so skipping the
           name step erased one that was already there - which a first run
           never has, and a first run reached a second time does. Clearing a
           name is Settings' job, where the field is the stored value rather
           than a draft of it. */
        if (name.trim()) prefs.name = name.trim();
        if (scales) prefs.activeScales = scales;
        if (areas) prefs.onboardingAreas = areas;
        if (lockOnLeave) prefs.lockOnLeave = true;
        prefs.onboarded = true;
      },
      flushWrites: flushPreferences,
      disguise,
      /* Durably, and only here: everywhere else in the app a preference is
         assigned and the screen carries on, but this assignment is what
         makes the launcher alias flip and the process die. */
      turnOnDisguise: () => setPreferenceDurably('disguise', true),
      leaveSetup: () => void goto(onboardingDestination())
    });
  }

  /* "Leave setup", from any step before the finish. Detours through the
     lock step first when the access mode has not been chosen yet (ticket
     54): complete()'s writes need the keystore that step is the only place
     that creates, so there is nowhere else for an early leave to go. Once a
     mode is chosen boot leaves this state on its own, and a second "leave
     setup" from the lock step reaches complete() directly. */
  function leave() {
    /* Giving up on a restore that never proved a file is giving up on the
       restore, not carrying an unopened archive into complete() for its
       guard to refuse on a step with nowhere to say so. Once the file is
       proved, "straight to the app" means the same as the finish does: it
       is the journal they came back for. */
    if (restoring && !archiveReady) restoring = false;
    if (needsOnboardingAccessMode(bootState)) {
      go('lock');
      return;
    }
    void complete();
  }
</script>

<!-- The step (DIRECTION.md rule 12, redesign ticket 33). Four parts, in
     this order and no other: the field with the sun and the question on it,
     one line under it on the page, the answers, and the foot.

     The frame is fixed and the answers are the one thing in it that may
     scroll (rule 14). Before this ticket setup was a plain column inside
     the app's own scroll region, so a step with nine rows on it carried the
     question and the foot off the top of the window with them - measured at
     571px of overflow on the permissions step and 964 on the areas step
     (ticket 31). Now the screen is exactly the window, the answers have
     their own region, and the question and the foot cannot move at all. -->
<div class="screen screen-setup" data-setup-frame style={`--step-grow:${growth}`}>
  <div class="setup">
    <!-- The field. Its height is the sun's reach at this step plus the
         question, so it comes down one step's worth per step with the
         question riding on it, and that edge is rule 10's blind on this
         screen. `blindEdge` is what moves it: it watches this box rather
         than the step counter, because the height also changes when the
         access-mode step walks to its pad, when a question re-wraps and
         when a raised keyboard drops the flow into its short form, and
         each of those has to travel rather than jump. -->
    <div class="setup-field" data-setup-field use:blindEdge>
      <!-- The paint, split from the box that measures it (ticket 28's
           mechanism, and the same reason): what draws the field's colour is
           a block a window tall whose bottom edge is a clip, so the edge
           can move without a frame ever deforming the two bottom corners.
           The sun is inside the clip because it is painted on the field
           too - at every step the sun's reach is under the field's own
           edge, so the clip never cuts it. -->
      <!-- `data-field-blind`, so this block is the blind on a navigation as
           well as the paint on a step change (ticket 28's mechanism): the
           name is handed to it for the outgoing capture and setup's edge
           travels to Home's rather than fading out while another field
           appears. The attribute is what $lib/motion/fieldBlind looks for;
           the shape is this file's own. -->
      <div class="setup-paint" data-field-blind>
        <!-- The flag being left, on top of the flag arriving and under the
             sun, wiping off towards the far corner: the new colour is
             uncovered from the sun's own corner outwards, which is where
             the answer to the tap is coming from. A hard edge rather than a
             crossfade, and the first flipbook is why - two flag colours
             mixed in sRGB spend 200ms as the muddy tan between them, on the
             one step whose whole subject is the colour. -->
        {#if leavingField}
          {#key leavingPass}
            <div
              class="setup-paint-was"
              style={`background-color:${leavingField}`}
              aria-hidden="true"
            ></div>
          {/key}
        {/if}
        {#if !prefs.disguise}
          <!-- The sun is the only progress meter (rule 12): it grows one
               step's worth per step, and the step count that used to be a
               rail's visible label is its accessible name, so a growing
               circle still tells a screen reader which step this is. -->
          <div
            class="setup-sun"
            role="img"
            aria-label={m.ob_step_of({ step: String(index + 1), total: String(steps.length) })}
          >
            <!-- Picking a flag redraws the sun ring by ring, and the flag
                 it is leaving is held under the redraw for exactly as long
                 as that takes. Keyed alone, the old rings left the DOM on
                 the frame the new ones started at no size at all, so for a
                 third of a second there was no sun on the screen - a thing
                 disappearing in one frame, which is the defect this ticket
                 is not allowed to ship. The outermost new ring is the
                 widest and is drawn first, so it covers what is underneath
                 as it opens and no gap of page can show through. -->
            {#key prefs.palette}
              <div class="setup-sun-draw" in:layer={{ z: 1 }} out:layer={{ z: 0 }}>
                <FlagSun />
              </div>
            {/key}
          </div>
        {/if}
      </div>

      <!-- The back control, top left, in the field's own ink. Absent on the
           welcome and wherever a step has no way back (rule 12). -->
      <div class="setup-head">
        {#if step !== 'welcome' && !awaitingAccessMode}
          <!-- NAV-006: onboarding had no way back between steps at all, so
               a typo in the name could only be finished past. Absent while
               awaitingAccessMode for the same reason Skip and "leave setup"
               are (ticket 54): a step back from here would be a way past
               choosing an access mode, and there is none. -->
          <!-- A step back off the restore step is giving up on the restore,
               not walking to the step before it: the step before it is the
               welcome, and arriving there still in the restore flow would
               leave its primary button pointing back at the file picker
               instead of at a new setup (ticket 36). -->
          <button
            class="icon-btn press"
            data-back
            data-field-part
            aria-label={m.back()}
            onclick={() => (step === 'restore' ? abandonRestore() : go(stepBefore(steps, step)))}
          >
            <Icon name="arrowLeft" />
          </button>
        {/if}
      </div>

      <!-- The question: the only display type on the screen and the only
           heading a step has (rule 12). Keyed on the words rather than on
           the step, because the access-mode step asks two questions of its
           own as it walks from its list to its pad, and a heading that
           changed its text in place would be the one thing on the field
           that did not move. -->
      <div class="setup-ask">
        {#key question}
          <!-- `data-field-part` for the same reason the paint carries
               `data-field-blind`: on a navigation the question is printed on
               the field and rides its edge, fading where it stands, rather
               than being part of the screen's own crossfade. Between steps
               it is the two transitions below that move it - one mechanism
               per kind of change, both reading one set of numbers. -->
          <h1
            class="setup-title"
            data-setup-question
            data-field-part
            in:fieldPart={{ printed: true }}
            out:fieldPart={{ printed: true }}
          >
            {question}
          </h1>
        {/key}
      </div>
    </div>

    <!-- Everything under the edge, riding it on the edge's own clock: the
         line and the answers travel together, so the pair reads as one
         sheet of page being uncovered rather than as two blocks each
         finding its own way down. -->
    <div class="setup-below">
      <div class="setup-stage">
        {#key step}
          <div
            class="setup-step"
            in:fieldPart
            out:fieldPart
          >
            <!-- One line, on the page, 12 below the field's edge: what the
                 answer does (rule 12). Never a paragraph - the welcome's
                 pitch is the one exception in the flow and it sits in this
                 same slot with the dictionary line above it. -->
            {#if step === 'welcome'}
              <p class="setup-def">{m.ob_welcome_def()}</p>
              <p class="setup-line is-pitch">{m.ob_welcome_body()}</p>
            {:else if line}
              <p class="setup-line">{line}</p>
            {/if}

            <!-- The answers, 20 under the line, each drawn the way rule 13
                 has for what it is: a row in a flush list, a block, a
                 typed answer on a rule, or a key. This region is the only
                 thing on a step that scrolls. -->
            <div class="setup-answers" data-setup-answers>
              {#if step === 'restore'}
                <!-- The file is a block (rule 13): an outline while there is
                     nothing in it, solid once there is, and the change
                     between the two is the tap's answer. It clips open from
                     its own left edge rather than fading up, which is what
                     every block in this app does when it arrives (rule 10).

                     Out of the default press, and DIRECTION's tier 1 says
                     why: a surface the width of the screen fills with a
                     wash, because scaling one moves everything beside it.
                     0.94 on a 358px block walks each edge 10.7px inward
                     with the question and the rule holding still, which
                     reads as a yank. The wash is in the stylesheet below. -->
                <button
                  class="setup-file"
                  class:is-empty={!picked}
                  data-no-press
                  data-restore-pick
                  onclick={chooseArchive}
                >
                  <span class="setup-file-ico"><Icon name="upload" size={20} /></span>
                  {#if picked}
                    {#key picked.name}
                      <!-- `|global`, or it never plays. A transition is
                           local by default, which means it runs when its
                           own block is created and not when a parent
                           block's creation brings it into being - and here
                           the parent is the `{#if picked}` that flips on
                           the first pick, so the whole clip was dead on the
                           one tap it exists for. Caught by reading
                           clip-path per animation frame off the built app
                           (`npm run gallery:restore`), which sampled `none`
                           for the length of the scene. -->
                      <span class="setup-file-name" in:wipe|global data-restore-file>
                        {picked.name}
                      </span>
                    {/key}
                  {:else}
                    <span class="setup-file-name is-placeholder">{m.imp_file_placeholder()}</span>
                  {/if}
                </button>

                <!-- A typed answer sits on the rule (rule 13), and a
                     password is that shape with its characters hidden. The
                     rule draws itself in from the left on focus, which is
                     what a 3px rule does everywhere else in the app. -->
                <div class="setup-typed">
                  <label class="field-label" for="ob-restore-pass">{m.exp_password_label()}</label>
                  <input
                    class="setup-rule-input"
                    type="password"
                    id="ob-restore-pass"
                    name="ob-restore-pass"
                    placeholder={m.imp_password_placeholder()}
                    bind:value={archivePass}
                    oninput={unproveArchive}
                  />
                </div>
              {:else if step === 'name'}
                <!-- The person's name is the first thing in the app set in
                     the app's own voice: the display face at 28 on a 3px
                     rule, no box and no fill (rule 13). -->
                <div class="setup-typed is-bare">
                  <input
                    class="setup-rule-input"
                    id="ob-name"
                    name="ob-name"
                    placeholder={m.ob_name_placeholder()}
                    autocomplete="off"
                    bind:value={name}
                  />
                </div>
              {:else if step === 'flag'}
                <!-- A flag is a block of its own stripes (rule 13): the
                     bands drawn the way the sun draws them, two across, the
                     name under it on the page. The chosen one takes the
                     section rule's 3px as a frame; nothing tints, and
                     nothing fills behind the name. -->
                <div class="palette-grid setup-flags" role="radiogroup" aria-label={m.colour_palette()}>
                  {#each PALETTES as [key, label] (key)}
                    <button
                      class="palette-swatch"
                      class:is-active={prefs.palette === key}
                      role="radio"
                      aria-checked={prefs.palette === key}
                      data-palette-pick={key}
                      onclick={() => (prefs.palette = key)}
                    >
                      <span class="swatch-preview" data-swatch={key}></span>
                      <span class="swatch-name">{label()}</span>
                    </button>
                  {/each}
                </div>
              {:else if step === 'scales'}
                <!-- One list, and Settings draws the same one. Two copies is
                     how the flag picker ended up cramped on one screen and
                     readable on the other. No "add your own" row here: it
                     leaves the flow, and the first run has nowhere to come
                     back to. -->
                <ScaleChecklist ticked={tickedScales} onToggle={toggleScale} />
              {:else if step === 'areas'}
                <!-- The hub's own groups and rows, ticked rather than tapped
                     through - the flag step and the scales step both already
                     solved "a list you tick" on this screen, so this is that
                     shape again rather than a new one.

                     A group inside the list is named by a caption at 15/600
                     and never by the 28px section rule (rule 12): a step has
                     one heading and it is the question. The permissions step
                     names its own two groups the same way, which is where
                     this drawing comes from. -->
                <div class="setup-areas">
                  {#each sections as section (section.key)}
                    <p class="setup-caption" data-setup-caption>{hubGroupHeading(section.key)}</p>
                    <ListCard role={roleAt(activeFlag.roles, hubSectionRoleIndex(section.key))}>
                      {#each section.rows as row (row.spec.key)}
                        <ListRow
                          key={`area-${row.spec.key}`}
                          icon={row.spec.icon}
                          title={hubRowTitle(row.spec.key)}
                          subtitle={hubRowLine(row.spec.key, row.line, today)}
                          checked={tickedAreas.includes(row.spec.key)}
                          chevron={false}
                          onclick={() => toggleArea(row.spec.key)}
                          data-hub-section={section.key}
                        />
                      {/each}
                    </ListCard>
                  {/each}
                </div>
              {:else if step === 'lock'}
                {#if awaitingAccessMode}
                  <!-- The app-lock toggle that used to head this list is
                       gone with the gate it turned on (ticket 53): how the
                       journal opens is now one choice made in the security
                       module, and a PIN is one of its access modes rather
                       than a switch here.

                       On a brand new install this module is what a person
                       meets on reaching this step (ticket 54) - the same
                       AccessModeSetup component Settings uses, wired in at
                       this one point in the flow because this is the one
                       step that actually creates the keystore.

                       It carries its own forward and back, which is the one
                       place setup's foot is not the way on (named in the
                       ticket): those controls drive a state machine inside
                       the module that four screens share, and the module's
                       own title is this step's question while it does. What
                       this screen does is give them the foot's drawing, so
                       the eye meets the same shape it has met nine times. -->
                  <AccessModeSetup
                    purpose="setup"
                    busy={accessBusy}
                    error={accessError}
                    onChoose={chooseAccessMode}
                    bind:chosen={accessChosen}
                  />
                {:else}
                  <!-- What is left once the module above has run: the one
                       thing this step still decides for itself, whether
                       leaving the app locks it. -->
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
                {/if}
              {:else if step === 'permissions'}
                <!-- Where the daily check-in used to be asked about (ticket
                     31). The nudge is not a question setup asks any more: it
                     is one of the reasons under the notification row here,
                     and the switch itself stays on the reminders screen.
                     What this step does instead is name everything the app
                     can reach on this device, once, in the place where
                     somebody is already deciding what the app is allowed to
                     be.

                     The list is the same component /settings/permissions
                     draws, which is what makes "you can do this later" true
                     rather than a promise of a second screen that says
                     something close. -->
                <PermissionList />
              {:else if step === 'disguise'}
                <!-- A row with a switch, drawn as every other answer in the
                     flow is (rule 13), and carrying the platform's own
                     consequence as its reason rather than as a paragraph
                     above it. On Android that reason is the one this step
                     owes most: the app closes for a moment, because it does.

                     The row is the last thing setup asks and the switch is
                     held, not applied - `prefs.disguise` is untouched until
                     complete(). Setup's own look does not answer it either
                     (rule 12): the sun keeps growing and the field keeps its
                     colour right through the finish. What does answer is the
                     preview below, which is the one place a person can see
                     what they are turning on before it is outside the app
                     and too late to be surprised by. -->
                <ListCard>
                  <ListRow
                    key="disguise"
                    title={m.disguise_app_title()}
                    subtitle={isAndroid() ? m.disguise_app_sub_android() : m.disguise_app_sub_web()}
                    chevron={false}
                  >
                    {#snippet trailing()}
                      <Switch
                        checked={disguise}
                        label={m.disguise_app_title()}
                        onChange={(v) => (disguise = v)}
                      />
                    {/snippet}
                  </ListRow>
                </ListCard>
                <!-- Settings' block, not a second one (ticket 32): a preview
                     of the launcher that disagreed with the launcher would
                     be worse than none, and two copies is how that
                     happens. -->
                <DisguisePreview on={disguise} />
              {/if}

              <!-- One line for every refusal on the restore path, holding
                   its height whether or not it has anything to say
                   (rule 15's status line). A notice is what rule 12 keeps
                   off a step, and a box in the colour of an error over a
                   file somebody just picked would be shouting where a
                   sentence does. -->
              {#if restoring && (step === 'restore' || step === 'done')}
                <p class="setup-status" role="alert" data-restore-error={archiveErrorKind}>
                  {archiveError}
                </p>
              {/if}
            </div>
          </div>
        {/key}
      </div>
    </div>

    <!-- The foot: the one way on at full width, then the two ways past the
         step side by side under it. Three controls, two lines, above a
         hairline, and it does not move between steps (rule 12) - it is
         outside the box that rides the edge for exactly that reason. -->
    <div class="setup-foot" data-setup-foot>
      {#if awaitingAccessMode}
        <!-- The module above carries its own submit action, and there is no
             other way past it (ticket 54, matching AccessModeSetup's own
             "no Skip anywhere" rule). -->
      {:else if step === 'done'}
        <!-- On a restored first run this button is the restore: it fills
             left to right with the operation's own progress rather than
             putting a second bar on a step (rule 12 keeps a step spare, and
             rule 10 says a solid thing arrives from its own edge). The fill
             is `null` while the operation cannot say how much is left, which
             is the indeterminate case rather than a zero, so the button
             simply stays as it is. -->
        <button
          class="btn btn-primary"
          class:is-filling={archiveBusy && archiveProgress.fraction !== null}
          style={`--fill:${(archiveProgress.fraction ?? 0) * 100}%`}
          data-finish
          disabled={archiveBusy}
          onclick={complete}
        >
          <span>
            {#if restoring && archiveReady}
              {archiveBusy ? m.ob_restore_running() : m.ob_restore_finish()}
            {:else}
              {m.start_journey()}
            {/if}
          </span>
        </button>
      {:else if step === 'restore'}
        <button
          class="btn btn-primary"
          class:is-filling={archiveBusy && archiveProgress.fraction !== null}
          style={`--fill:${(archiveProgress.fraction ?? 0) * 100}%`}
          data-restore-check
          disabled={archiveBusy}
          onclick={checkArchive}
        >
          <span>{archiveBusy ? m.verify_running() : m.ob_restore_check()}</span>
        </button>
      {:else if step === 'welcome'}
        <button class="btn btn-primary" data-next onclick={() => go(stepAfter(steps, step))}>
          <span>{m.ob_start_setup()}</span>
        </button>
      {:else}
        <button class="btn btn-primary" data-next onclick={() => go(stepAfter(steps, step))}>
          <span>{m.continue()}</span>
        </button>
      {/if}

      {#if !awaitingAccessMode}
        <div class="setup-outs">
          {#if step === 'welcome'}
            <!-- The second action, on the outs line where Skip and "straight
                 to the app" already live, so it is quiet by being where the
                 quiet controls are rather than by being a smaller version of
                 the primary (ticket 36: it must not compete). A person with
                 no archive reads one word of it and carries on. -->
            <button class="btn btn-ghost" data-restore-start onclick={beginRestore}>
              <span>{m.ob_have_backup()}</span>
            </button>
          {/if}
          {#if isSkippable(step)}
            <button class="btn btn-ghost" data-skip-step onclick={skip}>
              <span>{m.skip()}</span>
            </button>
          {/if}
          {#if step === 'restore'}
            <!-- The way out of the restore, and the whole of it: back to the
                 welcome as a new person, with nothing written. -->
            <button class="btn btn-ghost" data-restore-abandon onclick={abandonRestore}>
              <span>{m.ob_restore_new_instead()}</span>
            </button>
          {:else if restoring && step === 'done'}
            <button class="btn btn-ghost" data-restore-abandon onclick={abandonRestore}>
              <span>{m.ob_restore_start_again()}</span>
            </button>
          {/if}
          {#if step !== 'done'}
            <button class="btn btn-ghost" data-leave-setup onclick={leave}>
              <span>{m.ob_leave()}</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Setup wears the field (DIRECTION.md rules 12 to 14, redesign ticket
     33). What stood here was chrome from before the kit existed: a column
     inside the app's own scroll region, a bespoke `.setup-head` reserving
     room for a sun that hung off the window's corner behind the text, a
     title on the page rather than on a field, and steps that crossed on a
     shared axis nothing else in the app uses any more.

     Three things are true of every step now. The screen is exactly the
     window and cannot scroll; the answers have a region of their own and
     are the only thing in the frame that can. The field's height is the
     sun's reach at this step plus the question, so the edge comes down one
     step's worth per step and everything printed on it or standing under it
     rides down with it. And the foot is outside the ride, so it is in the
     same place on all ten steps.

     `--blind-edge` is where the field's bottom edge is, in pixels. It is
     registered rather than left as a plain custom property for the reason
     every var()-driven animation in this app has to be: an unregistered
     property has no type, so it cannot be interpolated, and a transition
     naming it would jump. Registered as a length, it animates, and the
     clip below reads it per frame. */
  @property --blind-edge {
    syntax: '<length>';
    inherits: true;
    initial-value: 0px;
  }

  /* No scroll of its own, ever (rule 14): what scrolls is the answers
     region inside it. `min-height: 0` undoes .screen's own `min-height:
     100%`, which would otherwise let the flex column grow past the window
     and hand the app's scroll region something to scroll.

     `clip` rather than `hidden`, and the difference is a defect this ticket
     hit rather than a preference. `overflow: hidden` makes an element a
     scroll container that simply draws no scrollbar, and the browser is
     free to scroll one on its own - to bring a focused input into view, or
     to keep an anchor still while content above it resizes. Measured on the
     name step: `.screen-setup` came back with a scrollTop of 197, which put
     the whole field and the question behind the demo bar with nothing on
     screen to say the screen had moved. `clip` is not a scroll container at
     all, so there is no scrollTop for anything to set. */
  .screen-setup {
    height: 100%;
    min-height: 0;
    overflow: clip;
    display: flex;
    flex-direction: column;
    /* How much of the sun's own scale this width and height can carry. One
       number, because the field's reserve is the sun's radius and the two
       must not be able to disagree: a sun grown without the room under it
       grown too is a flag with a question inside it. */
    --sun-mult: 1;
  }
  .screen-setup > .setup {
    /* .screen's own 20px rhythm between blocks has nothing to space here:
       the frame is one child. */
    margin-bottom: 0;
  }

  .setup {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    position: relative;
    /* Where the edge rests before the first measurement, and the only frame
       this value is ever read on: the first step is always the welcome,
       whose question is one line, so the arithmetic here is the same as the
       field's own box - the top inset, the head's 8, the sun's reach at
       this step, and a one-line question with the field's 16 under it.
       $lib/motion/stepBlind writes the measured height over it from the
       first frame onwards. */
    --blind-edge: calc(
      var(--inset-top) + var(--space-2) + 175px * var(--step-grow, 1) * var(--sun-mult, 1) + 78px
    );
    /* The edge's own clock. Longhands rather than the shorthand because
       --blind-ease is sampled per move and arrives as a linear(): an
       unparseable one takes a whole shorthand with it on an old WebView,
       and taking the transition with it is what would strand the edge. */
    transition-property: --blind-edge;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--blind-ease, var(--ease-out));
  }
  /* The frame the old geometry is painted on, written by stepBlind before
     the browser paints and taken off on the frame after: the edge where it
     was, everything that rides it back where it was, and nothing
     transitioning. It is deliberately identical to the frame before it -
     that is the whole of how a step change avoids a single-frame jump. */
  /* `:global()` on the attribute, because the attribute is written by
     stepBlind rather than by this template: Svelte prunes a selector whose
     hooks it cannot see in the markup, and a state flag in the markup
     instead would land on the framework's own schedule rather than inside
     the frame the height changed in, which is the one thing this has to
     do. */
  .setup:global([data-blind-hold]) {
    transition: none;
  }

  /* ---------- the field ---------- */

  /* The box that measures the field, and paints none of it. Bleeds up
     through the inset the scroll region pads every screen by and out
     through .screen's own 20, then pads back in by both, so the question
     starts where the content under it does and sits as clear of the status
     bar as any other first line. Decoration crosses the inset; nothing
     readable does. */
  .setup-field {
    position: relative;
    flex: 0 0 auto;
    margin: calc(-1 * var(--inset-top)) calc(-1 * var(--space-5)) 0;
    padding: calc(var(--inset-top) + var(--space-2)) var(--space-5) var(--space-4);
    color: var(--field-ink);
    /* The paint below is a window tall and absolutely positioned in this
       box, and an absolutely positioned child contributes its overflow to
       its containing block's - which propagated all the way up and made the
       frame report exactly `--nav-clearance` of content it was hiding, on
       every step at every size. `clip` stops the propagation without making
       anything a scroll container; the margin is what stops it also clipping
       the paint, which has to be able to stand taller than this box for the
       length of a close - the edge starts at the height the field had and
       this box is already at the height it is going to. 50vh is far past any
       field the flow draws (the tallest is 293px) and far short of the
       window the paint is. */
    overflow: clip;
    overflow-clip-margin: 50vh;
  }

  /* The paint, split from the box above (ticket 28's mechanism, and the
     same reason it exists there): a flat block a window tall whose bottom
     edge is a clip, so the edge moves without the block ever being resized
     and no frame can deform the two bottom corners. A sibling of the box
     rather than a child of it, because the box may not clip: the field's
     own overflow would cut the paint back to the new height on the frame
     the height changed, which is the jump the clip is here to prevent. */
  .setup-paint {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100vh;
    z-index: 0;
    pointer-events: none;
    background-color: var(--field);
    clip-path: inset(
      0 0 calc(100% - var(--blind-edge)) 0 round 0 0 var(--r-block) var(--r-block)
    );
  }

  /* Picking a flag changes what colour the field is, and a state change
     moves (ADR-0078). Measured on the first flipbook: the whole field went
     from trans pink to agender green between two frames while the sun was
     still redrawing ring by ring underneath, so the loudest surface on the
     screen was the one thing that teleported.

     What moves is the flag being left: it lies over the flag arriving and
     wipes off towards the far corner, so the new colour is uncovered from
     the sun's corner outwards on the sun's own clock. First in the paint's
     DOM order and so under the sun, which keeps drawing over both.

     The rest of the palette still arrives in one frame - the accent under
     Skip, a tick's fill, a row's icon block - because `--accent` and the
     role colours are published on <html> and nothing in the app transitions
     them. That is the cohesion sweep's to answer (ticket 20) rather than a
     step's; what this rule owns is the surface this step is about. */
  .setup-paint-was {
    position: absolute;
    inset: 0;
    animation: setup-field-wipe var(--dur-authored) var(--ease-out) both;
  }
  @keyframes setup-field-wipe {
    from {
      clip-path: inset(0);
    }
    to {
      clip-path: inset(0 100% 0 0);
    }
  }

  /* The sun, in the field's top right corner, inside the clip because it is
     painted on the field too. At every step its reach is the field's own
     reserve, so the edge is always below it and the clip never cuts it.

     A zero-size point, as Home's is: the rings centre on it and reach
     175px * the step's scale down and left of it. --sun-scale is the
     variable .sun itself reads (components.css), so the growth is written
     once here rather than as a second transform around it. */
  .setup-sun {
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    --sun-scale: calc(var(--step-grow, 1) * var(--sun-mult, 1));
  }
  .setup-sun-draw {
    position: absolute;
    top: 0;
    right: 0;
  }
  /* Tier 0: the sun grows one step's worth per step and arrives at scale 1,
     which is the resting size Home draws a moment later - so the handover
     between the two screens is one object at one size rather than two suns.
     On the edge's own clock, so the flag and the field grow as one thing. */
  .setup-sun :global(.sun) {
    transition-property: transform;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--ease-out);
  }

  /* The sun's room, which is also the back control's row. Reserved as the
     sun's reach at this step rather than at full size: the reserve is what
     the field's height is made of, so reserving the finish's 175px from the
     first step would make every step's field the tallest one's. */
  .setup-head {
    position: relative;
    z-index: 1;
    min-height: calc(175px * var(--step-grow, 1) * var(--sun-mult, 1));
  }
  .setup-head .icon-btn {
    color: inherit;
    /* The glyph sits 13px inside a 48px target, so the box starts left of
       the content edge for the arrow to look aligned with the question
       under it. The target keeps its full width; only the box moves. */
    margin-left: calc(-1 * var(--space-3));
  }

  /* The question, and the box it rides in. One grid cell holds the outgoing
     question and the incoming one, so the two overlap rather than stacking
     and doubling the field's height mid-change. */
  .setup-ask {
    position: relative;
    z-index: 1;
    display: grid;
  }
  .setup-ask > * {
    grid-area: 1 / 1;
  }
  /* Rides the edge (rule 10): what is painted on the field is printed on it
     and travels with it, on the edge's own curve rather than the content's. */
  .setup-ask,
  .setup-below {
    translate: 0 0;
    transition-property: translate;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--blind-ease, var(--ease-out));
  }
  .setup:global([data-blind-hold]) .setup-ask {
    /* Its own delta, not the field's: see stepBlind.ts. */
    translate: 0 var(--part-delta, 0px);
    transition: none;
  }
  .setup:global([data-blind-hold]) .setup-below {
    translate: 0 var(--blind-delta, 0px);
    transition: none;
  }

  /* 48 in the display face at 800, tracked one step tighter than the scale's
     own -0.04em and set solid: the door title's treatment (rule 2), which is
     what a question is here. The one heading a step has. */
  .setup-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-4xl);
    font-weight: var(--weight-display);
    letter-spacing: -0.045em;
    line-height: 0.95;
    color: var(--field-ink);
    text-wrap: balance;
    /* A 48px word is wider than a 195px window at 200% zoom, which is where
       every title in the app took this rule (ticket 35). */
    overflow-wrap: break-word;
  }

  /* ---------- under the edge ---------- */

  .setup-below {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* One grid cell again, for the same reason: the step leaving and the step
     arriving overlap instead of stacking. */
  .setup-stage {
    flex: 1 1 0;
    min-height: 0;
    display: grid;
  }
  .setup-stage > * {
    grid-area: 1 / 1;
    min-height: 0;
  }
  .setup-step {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* One line under the field, on the page, 12 below the edge: what the
     answer does, at 15/600 in the secondary ink (rules 2 and 12). Never a
     paragraph - the welcome's pitch is the flow's one exception and it sits
     in this slot under the dictionary line. */
  .setup-line,
  .setup-def {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
  /* The app's name, read back as the word it is. Italic so it sits between
     the question and the pitch as an aside rather than as a second line of
     the same voice. */
  .setup-def {
    font-style: italic;
  }
  .setup-line.is-pitch {
    font-weight: var(--weight-regular);
    line-height: var(--leading-body);
  }

  /* The answers, 20 under the line, and the one region on a step that may
     scroll (rule 14). It bleeds to the screen's edges and pads back in: a
     region that scrolls clips on both axes, so a block reaching past the
     content edge inside it would be cut. */
  .setup-answers {
    flex: 1 1 0;
    min-height: 0;
    margin: var(--space-5) calc(-1 * var(--space-5)) 0;
    padding: 0 var(--space-5);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* Nothing in a step's answers touches the thing above it. The app's own
     20 between blocks (rule 1), stated here because this region is not
     `.screen`'s child and so is outside that rule's reach. */
  .setup-answers > * + * {
    margin-top: var(--space-5);
  }

  /* A group inside a list is named by a caption at 15/600, never by the
     28px section rule, which a step may not carry at all (rule 12): a step
     has one heading and it is the question. The permissions step names its
     own two groups this way and this is that same drawing. */
  .setup-caption {
    margin: var(--space-5) 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
  .setup-caption:first-child {
    margin-top: 0;
  }
  .setup-areas {
    display: flex;
    flex-direction: column;
  }

  /* Every answer that carries a block arrives as one: it clips open from
     its own left edge, one --stagger-step per row and capped at the
     seventh, with the words beside it cutting (rule 10, ADR-0078; the
     agenda's day block and the return moment's rows are the same movement
     at the same size). The whole run waits --dur-fast, which is the length
     of the outgoing step's fade: no frame carries two steps' answers, so
     none can carry two steps' blocks either.

     :global because these squares are drawn inside ListRow and Check, where
     a scoped selector would never reach them. */
  .setup-answers :global(.kit-row-ico),
  .setup-answers :global(.kit-check),
  .setup-flags .swatch-preview {
    animation-duration: var(--dur-slow);
    animation-timing-function: var(--ease-out);
    animation-fill-mode: both;
    animation-delay: calc(var(--dur-fast) + var(--row-index, 0) * var(--stagger-step));
  }
  .setup-answers :global(.kit-row-ico),
  .setup-answers :global(.kit-check) {
    animation-name: kit-block-in;
  }
  /* The kit's own block arrival, outset far enough that the frame landing on
     a chosen flag is not clipped by the arrival's resting clip: the block
     keeps a 3px outline 6px outside itself at rest, and kit-block-in ends at
     6px of outset, which cuts exactly that. */
  .setup-flags .swatch-preview {
    animation-name: setup-flag-in;
  }
  @keyframes setup-flag-in {
    from {
      clip-path: inset(-12px 100% -12px -12px round var(--r-block));
    }
    to {
      clip-path: inset(-12px round var(--r-block));
    }
  }

  /* Which row of the run a row is, so its block waits its turn. Numbered off
     nth-child rather than handed down from the markup, which is how the kit
     numbers a grid of tiles (kit.css): a run of rows inside ScaleChecklist or
     PermissionList is not this screen's to pass a property to, and both are
     drawn here. Capped at the seventh, as the tiles' stagger is, so an
     eighth row arrives with the seventh rather than in lockstep with the
     first. */
  .setup-answers :global(.kit-list > *:nth-child(2)) {
    --row-index: 1;
  }
  .setup-answers :global(.kit-list > *:nth-child(3)) {
    --row-index: 2;
  }
  .setup-answers :global(.kit-list > *:nth-child(4)) {
    --row-index: 3;
  }
  .setup-answers :global(.kit-list > *:nth-child(5)) {
    --row-index: 4;
  }
  .setup-answers :global(.kit-list > *:nth-child(6)) {
    --row-index: 5;
  }
  .setup-answers :global(.kit-list > *:nth-child(n + 7)) {
    --row-index: 6;
  }
  /* Two flags across, so a row of the grid is a pair and the pair arrives
     together. */
  .setup-flags .palette-swatch:nth-child(3),
  .setup-flags .palette-swatch:nth-child(4) {
    --row-index: 1;
  }
  .setup-flags .palette-swatch:nth-child(5),
  .setup-flags .palette-swatch:nth-child(6) {
    --row-index: 2;
  }
  .setup-flags .palette-swatch:nth-child(n + 7) {
    --row-index: 3;
  }

  /* ---------- the answers, drawn as rule 13 has them ---------- */

  /* A flag is a block of its own stripes: the bands drawn the way the sun
     draws them, 56 tall, the one radius, a 1px edge, two across, the name
     under it on the page at 15/600. Nothing tints and nothing fills behind
     the name (rule 13), which is what the shared picker in Settings does
     and the reason both classes are named here: .palette-grid's four
     columns and .palette-swatch's fill are declared in screens.css and
     would otherwise win the tie on source order. */
  .palette-grid.setup-flags {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4) var(--space-3);
  }
  .setup-flags .palette-swatch {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
  }
  .setup-flags .palette-swatch:hover,
  .setup-flags .palette-swatch.is-active {
    background: none;
  }
  .setup-flags .swatch-preview {
    width: 100%;
    height: 56px;
    border-radius: var(--r-block);
    border: 1px solid var(--outline);
    box-sizing: border-box;
  }
  /* The tap's answer, at the size of the block that took it (rule 13's
     bloom, re-examined by this ticket). What stood here was a ring of
     --accent-soft opening out past the tile over 700ms: a tint, which rule
     13 now forbids behind a flag, and a movement that had to be watched for
     to be seen.

     What answers instead is the mark landing: the section rule's 3px in
     --text closes in from 6px outside the block onto its own edge. It is
     the one movement a chosen frame can make - a frame cannot draw in from
     a side the way a rule does - and it is the same 3px the rest of the
     phase uses to say "this one". Drawn as an outline so the block's box
     never changes and nothing beside it moves; offset inward at rest so the
     frame sits on the block rather than around it.

     The block being left plays the same transition backwards for nothing,
     which is the whole reason it is a transition and not an animation. */
  .setup-flags .swatch-preview {
    outline: 3px solid transparent;
    outline-offset: 6px;
    transition-property: outline-color, outline-offset;
    transition-duration: var(--dur-med);
    transition-timing-function: var(--ease-out);
  }
  .setup-flags .palette-swatch.is-active .swatch-preview {
    outline-color: var(--text);
    outline-offset: -3px;
  }
  .setup-flags .swatch-name {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
    text-align: left;
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    line-height: 1.3;
  }
  .setup-flags .palette-swatch.is-active .swatch-name {
    color: var(--text);
  }

  /* A typed answer sits on the rule: the display face at 28 on a 3px --text
     bottom rule, no box and no fill, the placeholder in the secondary ink
     (rule 13). The person's name is the first thing in the app set in the
     app's own voice. A passphrase is the same shape with its characters
     hidden. */
  .setup-typed {
    position: relative;
  }
  .setup-typed .field-label {
    display: block;
    margin-bottom: var(--space-2);
  }
  .setup-rule-input {
    display: block;
    width: 100%;
    padding: 0 0 var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: var(--leading-display);
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 3px solid var(--outline);
    border-radius: 0;
  }
  .setup-rule-input::placeholder {
    font-family: var(--font-body);
    font-size: var(--text-md);
    font-weight: var(--weight-regular);
    letter-spacing: normal;
    color: var(--text-2);
  }
  /* The rule in --text over the resting one, drawn in from the left when
     the field takes focus - the same left-to-right draw a section rule
     makes everywhere else in the app (rule 10). A scaled pseudo element
     rather than an animated width, so it is one composited transform; the
     transition is a plain CSS one, so base.css's reduced-motion clamp turns
     it into a cut like every other. */
  .setup-typed::after {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 3px;
    background: var(--text);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform var(--dur-med) var(--ease-out);
  }
  .setup-typed:focus-within::after {
    transform: scaleX(1);
  }

  /* ---------- the restore step (ticket 36) ---------- */

  /* The block. An outline while it is empty and a solid surface once it
     holds a file, so the tap has something to answer with beyond a filename
     appearing. Dashed while empty for the one reason a dash is worth having
     here: it reads as a slot waiting to be filled rather than as a control
     that has already been used. */
  .setup-file {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-4);
    /* 64 rather than 72, and the eight pixels are rule 14's. The step
       carries three controls in its foot like every other step, and with
       them it was 20px past a 390x844 phone; the room comes out of this
       block rather than out of a control. Still well clear of the 48px
       touch floor. */
    min-height: 64px;
    text-align: left;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    /* The name clips in from the block's own left edge, so the edge has to
       be able to clip it. */
    overflow: hidden;
  }
  .setup-file.is-empty {
    background: transparent;
    border-style: dashed;
  }
  /* Tier 1's answer for a surface this wide: a wash rather than the compact
     depth (the markup opts out of press.css and says why). */
  .setup-file:active {
    background: color-mix(in oklab, var(--accent) 12%, var(--surface-2));
  }
  .setup-file.is-empty:active {
    background: color-mix(in oklab, var(--accent) 10%, transparent);
  }
  .setup-file-ico {
    display: flex;
    flex: none;
    color: var(--text-2);
  }
  .setup-file-name {
    font-weight: var(--weight-bold);
    /* A file name is one long unbroken token and a phone is 390px wide.
       Wrapping anywhere is what keeps a 60-character name inside the block
       instead of pushing the block past the screen. */
    overflow-wrap: anywhere;
  }
  .setup-file-name.is-placeholder {
    color: var(--text-2);
    font-weight: var(--weight-regular);
  }

  /* The status line. Holds its height whether or not it has anything to say
     (rule 15), so a refusal does not push the block and the rule up the
     screen on its way in. */
  .setup-status {
    min-height: calc(var(--text-sm) * 2);
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--danger);
  }

  /* ---------- the access-mode step ---------- */

  /* The module carries its own intro paragraph, its own forward control and
     its own way back, because those drive a state machine four screens
     share (ticket 30). Inside setup the intro is the step's line and is
     rendered there, so the module's copy of it is not drawn twice; the
     controls keep the foot's drawing, which is the one place on the flow
     where the way on is not in the foot itself. Named in the ticket. */
  .setup-answers :global(.am-intro) {
    display: none;
  }
  .setup-answers :global(.gate-actions),
  .setup-answers :global(.gate-foot) {
    margin-top: var(--space-5);
    text-align: left;
  }

  /* ---------- the foot ---------- */

  /* Three controls, two lines, above a hairline, on the window's bottom
     edge: the one way on at full width, then the two ways past the step
     side by side under it. Outside .setup-below, so it does not ride the
     edge and cannot move between steps (rule 12). */
  .setup-foot {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) 0;
    border-top: 1px solid var(--hairline);
  }
  .setup-outs {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .setup-outs .btn {
    padding: 0 var(--space-3);
  }

  /* ---------- the short form (rule 14) ----------

     Under 640px tall, which is what a raised keyboard leaves on any phone
     and what a 320px phone has at rest: the field drops to the back
     control's row plus the question at 21 and the sun draws at 0.6 of its
     step scale. The answers do not change - the whole point of the short
     form is that the room comes out of the frame rather than out of what is
     being asked.

     Rule 14 also says the foot's second line drops to 40px, and that one is
     not built: 40 is under `--touch-target`, which is Android's 48dp floor
     and the stricter of the two platforms this ships on. Measured at
     320x568, the two ways past a step were 56.8x40 and 166.9x40. The rule
     was written off a sheet rather than against the floor, and the eight
     pixels it was buying come out of a region that already scrolls on the
     steps where they were needed. */
  @media (max-height: 639px) {
    .screen-setup {
      --sun-mult: 0.6;
    }
    .setup {
      --blind-edge: calc(var(--inset-top) + var(--space-2) + 48px + 46px);
    }
    .setup-head {
      min-height: 48px;
    }
    .setup-title {
      font-size: var(--text-xl);
      letter-spacing: var(--display-track);
      line-height: var(--leading-display);
    }
    .setup-field {
      padding-bottom: var(--space-3);
    }
    .setup-rule-input {
      font-size: var(--text-xl);
    }
    .setup-flags .swatch-preview {
      height: 40px;
    }
    .setup-answers {
      margin-top: var(--space-4);
    }
    .setup-foot {
      padding: var(--space-2) 0;
    }
  }

  /* ---------- the first run, wide ----------

     The field is a banner across the app's own 640px column with the one
     radius on all four corners and the sun in its top right, which is
     Today's treatment (rule 7); the step and its foot sit in the column and
     nothing else changes. The paint stops bleeding to the window's edges
     because there are no window edges to bleed to any more - the column has
     its own. */
  @container app (min-width: 1024px) {
    .setup {
      max-width: 640px;
      --blind-edge: calc(var(--space-6) + 175px * var(--step-grow, 1) * var(--sun-mult, 1) + 78px);
    }
    .setup-field {
      margin: 0;
      padding: var(--space-6) var(--space-5) var(--space-4);
    }
    .setup-paint {
      clip-path: inset(0 0 calc(100% - var(--blind-edge)) 0 round var(--r-block));
    }
  }
</style>
