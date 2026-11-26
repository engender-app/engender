<script lang="ts">
  import { rovingRadio } from '$lib/components/rovingRadio';
  import { paletteNameFit } from '$lib/components/paletteNameFit';
  /* The first run (F16), rebuilt for phase 5 ticket 26.

     Six settings, one pass. What a person had to leave here and go and find
     afterwards was the flag, which is the app's whole look and something
     someone decides in the first minute and almost never revisits. So the
     flow is welcome, name, flag, scales, features, lock, permissions,
     disguise, finish,
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

     This screen appears before unlock. Under disguise it keeps the neutral
     field and no sun, as the other pre-unlock screens do. */

  import { afterNavigate, pushState } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { registerSetupBack } from '$lib/onboarding/back';
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { chooseLanguage, flushPreferences, prefs, setPreferenceDurably, type AppLanguage } from '$lib/data/prefs/store.svelte';
  import { getLocale } from '$lib/paraglide/runtime';
  import { playOpening } from '$lib/onboarding/opening';
  import { appWordmark } from '$lib/disguise/identity';
  import { fieldPart } from '$lib/motion/navigation';
  import { blindEdge } from '$lib/motion/stepBlind';
  import { EASE_OUT_CSS, crossfadeDuration, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { replaceRoute } from '$lib/navigation/smart-back';
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
    stepSun,
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
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import { featureAreas, type HubRow, type HubRowKey } from '$lib/data/hubRows';
  import { DEFAULT_MODULES, firstRunModuleWrites } from '$lib/onboarding/features';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import FlagSun from '$lib/components/FlagSun.svelte';
  import ScaleChecklist from '$lib/components/ScaleChecklist.svelte';
  import FeatureVisibilityList from '$lib/components/FeatureVisibilityList.svelte';
  import { firstRunScales } from '$lib/onboarding/firstRunScales';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import DisguisePreview from '$lib/components/DisguisePreview.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import LockAfterChoice from '$lib/components/LockAfterChoice.svelte';
  import { accessModeHasSecret } from '$lib/data/journal-access-mode';
  import type { LockAfter } from '$lib/data/prefs/catalogue';
  import PermissionList from '$lib/components/PermissionList.svelte';

  import { PALETTES } from '$lib/theme/paletteChoices';
  import { changePalette, isAppearancePending } from '$lib/motion/paletteChange';

  const restoreOnEntry = untrack(() => page.url.searchParams.get('restore') === '1');
  /* Settings' "Delete everything" lands here (phase 14 ticket 15). The
     wipe cannot be undone, so its result stays on the welcome as a line
     rather than a toast that fades. */
  const erasedOnEntry = untrack(() => page.url.searchParams.get('erased') === '1');
  /* Read once, then taken off the address, so a reload part way through
     setup does not announce the wipe a second time. replaceRoute rather
     than history.replaceState, which page.url never sees. */
  $effect(() => {
    if (untrack(() => page.url.searchParams.has('erased'))) void replaceRoute('/onboarding');
  });
  /* The line arrives after the page it sits on rather than with it: the
     welcome is the same screen setup always opens on, and the one new thing
     on it fades up once the rest is there. A fade rather than a travel, so
     it survives reduced motion as the contract's crossfade. */
  function erasedArrival(node: HTMLElement) {
    node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: Math.max(motionDuration('--dur-slow'), crossfadeDuration()),
      delay: motionDuration('--dur-fast'),
      easing: EASE_OUT_CSS,
      fill: 'backwards'
    });
  }
  let step = $state<OnboardingStep>(restoreOnEntry ? 'restore' : 'welcome');

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

  let genitalEffectsChoice = $state<boolean | null>(null);
  let sexualEffectsChoice = $state<boolean | null>(null);
  let cycleChoice = $state<boolean | null>(null);
  let restoring = $state(restoreOnEntry);
  let moduleChoices = $state<HubRowKey[] | null>(null);
  let cycleEpisodes = liveQuery((j) => j.regimen.getEpisodes());
  let cycleShown = $derived(cycleChoice ?? (restoring || prefs.onboarded
    ? cycleTrackingVisible(cycleEpisodes.value ?? [], Date.now(), prefs.cycleTrackingChoice)
    : false));
  /* Stored state once there is a journal to read it from, off before. */
  const effectCategoryOn = (key: string) => restoring || prefs.onboarded
    ? vocabulary.effectCategories.find((category) => category.key === key)?.enabled ?? false
    : false;
  let genitalEffectsShown = $derived(genitalEffectsChoice ?? effectCategoryOn('genital'));
  let sexualEffectsShown = $derived(sexualEffectsChoice ?? effectCategoryOn('sexual'));

  /* Null until the features step is touched, which reads as the default
     set both here and in complete() - so the step opens with what a skip
     would keep. */
  let tickedModules = $derived(moduleChoices ?? DEFAULT_MODULES);

  function moduleEnabled(row: HubRow): boolean {
    return tickedModules.includes(row.key);
  }

  function chooseModule(row: HubRow, enabled: boolean) {
    moduleChoices = enabled
      ? [...tickedModules, row.key]
      : tickedModules.filter((key) => key !== row.key);
  }

  /* The lock step's own answer once a mode is set up: when that mode's
     secret is asked for again (lock-timing ticket 01). A minute is offered
     rather than the catalogue's restart, which is only the default because
     it is what an old journal's "off" meant. Null after a Skip, which writes
     nothing and so leaves the restart. */
  let lockAfter = $state<LockAfter | null>('one-minute');

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
  let accessSetup: { back(): void } | undefined = $state();
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
  let picked = $state.raw<PickedArchive | null>(null);
  let archivePass = $state('');
  let archiveReady = $state(false);
  let archiveBusy = $state(false);
  let archiveError = $state('');
  /* The walkthrough's handle on which refusal this is, matching the Settings
     screen's own `data-import-error` so the suite grips a kind rather than a
     sentence in one language. */
  let archiveErrorKind = $state<RestoreFailureKind | ''>('');
  let setupBusy = $state(false);
  let setupError = $state('');
  const archiveProgress = createProgress();

  /* One flow for everybody (ADR-0079): setup does not vary by disguise,
     and steps.ts says why the shorter flow it used to offer went. It does
     vary by whether a journal is being restored, which is a different axis
     and the one thing an archive can actually answer for a person: the steps
     whose answers it carries are dropped rather than asked and overwritten
     (ticket 36, steps.ts). */
  let steps = $derived(restoring ? restoreSteps() : onboardingSteps());
  let index = $derived(stepIndex(steps, step));
  let growth = $derived(stepSun(step, steps));

  /* The welcome is the hero (pre-release-human ticket 19): the field most of
     a phone tall with the sun large in its corner and the wordmark on it,
     and "Set up the app" collapses it into the first question. */
  let hero = $derived(step === 'welcome');

  /* The welcome's language switch. The labels are Settings' own options,
     which name each language in itself; the visible text is the code.
     Picking one reloads the page (setLocale), back onto this welcome, and
     chooseLanguage holds the choice across that reload when there is no
     journal yet to write it to. */
  const LANGUAGES = [
    ['pl', 'Polski'],
    ['en', 'English']
  ] as const;
  const locale = getLocale();
  function pickLanguage(code: AppLanguage) {
    if (code !== locale) void chooseLanguage(code);
  }

  /* The opening ($lib/onboarding/opening.ts) plays on a cold load of the
     welcome and never again in the same page: the back arrow returning here
     is a step change, not a mount. Not inside a door change either, where
     the navigation draws the arrival (FlagSun's `carried`), and not on a
     setup entered at the restore step. */
  const opens =
    untrack(() => step === 'welcome') &&
    typeof document !== 'undefined' &&
    !('nav' in document.documentElement.dataset);
  let frame: HTMLElement | undefined = $state();
  /* The first sun drawn is the opening's: its CSS entrance gives way to the
     opening's own (the stylesheet below). Marked once and never unmarked,
     since taking the class off would restart the CSS entrance; a flag
     picked later redraws a new sun with the entrance it always had. */
  let openingSunDrawn = !opens;
  function openingSun(node: HTMLElement) {
    if (openingSunDrawn) return;
    openingSunDrawn = true;
    node.classList.add('is-opening');
    node.dataset.openingSun = '';
  }
  onMount(() => {
    if (!opens || !frame) return;
    return playOpening(frame, { reduced: isReducedMotion() });
  });

  /* Whether this step is the forced choice rather than the toggle under it
     (ticket 54): true from the moment the flow reaches the lock step until
     a mode is actually set up, which is the one stretch with no Skip, no
     back arrow and no "leave setup" - the same hard-gate rule JournalGate
     already holds a returning install to, here because reading `bootState`
     directly is simpler than a second flag mirroring it. */
  let awaitingAccessMode = $derived(step === 'lock' && needsOnboardingAccessMode(bootState));
  /** Whether the mode just set up has a secret to ask for again, which is
      whether the lock step has a question left once the module is done. */
  let lockAsks = $derived(accessModeHasSecret(bootState.accessMode, isAndroid()));

  let question = $derived.by(() => {
    if (awaitingAccessMode) {
      return accessChosen === null ? m.am_setup_title() : accessModeTitle(accessChosen);
    }
    if (step === 'lock' && !lockAsks) return m.lock_after_no_secret_setup_title();
    if (step === 'done') {
      if (restoring && archiveReady) return m.ob_restore_done_title();
      return name.trim() ? m.ob_done_title_named({ name: name.trim() }) : m.ob_done_title();
    }
    return QUESTION[step]();
  });

  let line = $derived.by(() => {
    if (awaitingAccessMode) return m.am_setup_body();
    if (step === 'lock' && !lockAsks) return m.lock_after_no_secret_setup();
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

  function previousStep(): boolean {
    if (setupBusy || archiveBusy || accessBusy) return true;
    if (awaitingAccessMode) {
      accessSetup?.back();
      return true;
    }
    if (step === 'welcome') return false;
    if (step === 'restore') abandonRestore();
    else go(stepBefore(steps, step));
    return true;
  }

  let historyArmed = false;
  let finishHistory: (() => Promise<void>) | undefined;
  afterNavigate(() => {
    if (historyArmed) return;
    // Wait for the initial router entry, including a direct setup address.
    pushState('', {});
    historyArmed = true;
  });
  onMount(() => {
    let active = true;
    let finishing = false;
    const popped = () => queueMicrotask(() => {
      if (!active) return;
      if (finishing) return;
      previousStep();
      pushState('', {});
    });
    window.addEventListener('popstate', popped);
    const unregister = registerSetupBack(previousStep);
    finishHistory = () => new Promise<void>((resolve) => {
      finishing = true;
      // Registered after the router, so it settles the pop before we navigate.
      window.addEventListener('popstate', () => queueMicrotask(resolve), { once: true });
      history.back();
    });
    return () => {
      active = false;
      unregister();
      window.removeEventListener('popstate', popped);
      finishHistory = undefined;
      clearTimeout(collapseDone);
    };
  });

  /* Out of the welcome, the sun shrinks on the closing curve stepBlind
     gives a shrinking field, so the two travel as one. On its own
     transition's ease-out it was at 0.67 of its size while the edge had
     travelled a third of the way, and the two read as two things
     (pre-release-human ticket 19, frame samples). Every way out of the
     welcome goes through here. */
  let collapsing = $state(false);
  let collapseDone: ReturnType<typeof setTimeout> | undefined;
  /* The field's box drops to the first step's height in one layout while
     its painted edge travels there, and .step-field cuts everything 120px
     past its box (components.css, overflow-clip-margin), which is room for
     every other step's close. The welcome's is 355px on a phone, so for the
     first frames the paint, the sun and the wordmark were cut at 367px: the
     field's edge jumped 235px and the wordmark vanished in one frame
     (sign-off round 1, frame 20 of the collapse). For the length of this
     close the margin is the hero's own height, which is more than the close
     can travel. Written from here in pixels because Chromium takes no calc()
     in overflow-clip-margin. */
  let field: HTMLElement | undefined = $state();
  let collapseMargin = $state<string | null>(null);
  function go(to: OnboardingStep) {
    if (step === 'welcome' && to !== 'welcome') {
      collapsing = true;
      collapseMargin = field ? `${field.offsetHeight}px` : null;
      clearTimeout(collapseDone);
      /* Let go the moment the edge lands. While the margin stands, the
         paint (a window tall) counts as the frame's overflow, and holding
         it for a fixed 580ms left the first step 17 to 20px "clipped" when
         measured at 500ms (walkthrough setup no-scroll, 360x640 and
         390x844). The timer is only the backstop for an edge that does not
         transition, under reduced motion or when nothing moved. */
      const host = field?.parentElement;
      const release = () => {
        clearTimeout(collapseDone);
        host?.removeEventListener('transitionend', landed);
        collapsing = false;
        collapseMargin = null;
      };
      const landed = (event: TransitionEvent) => {
        if (event.target === host && event.propertyName === '--blind-edge') release();
      };
      host?.addEventListener('transitionend', landed);
      collapseDone = setTimeout(release, motionDuration('--dur-slow') + 200);
    }
    step = to;
  }

  /* Each step's question takes focus as it arrives, so a screen reader
     says the new step and a keyboard starts from it (audit A11Y-12). Focus
     used to stay on Continue, which said nothing, and on the two steps
     whose Continue is a different button it fell to the body.

     The first question is left to the layout, which focuses a screen's
     heading when the screen arrives (navigation/arrivalFocus.ts). A frame
     later rather than on mount, so the question's entrance has started
     before focus asks for a layout (ticket 115's Android teleport).

     The id is how the name field is named by its question. The question is
     keyed, so for the length of a change two of them are in the document,
     and the arriving one takes the id from the leaving one. */
  const QUESTION_ID = 'ob-question';
  let questionsArrived = 0;
  function questionArrives(node: HTMLElement) {
    for (const leaving of document.querySelectorAll(`#${QUESTION_ID}`)) {
      if (leaving !== node) leaving.removeAttribute('id');
    }
    node.id = QUESTION_ID;
    if (questionsArrived++ === 0) return;
    /* Only if nothing else took focus in that frame: a tap on an answer
       that quickly is the person already moving on. */
    const was = document.activeElement;
    const frame = requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now === was || !now || now === document.body) node.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
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
    features: m.ob_features_title,
    lock: m.ob_lock_title,
    permissions: m.ob_perms_title,
    disguise: m.ob_disguise_title,
    done: m.ob_done_title
  };

  /* One line under the field: what the answer does. The welcome is the one
     step whose slot holds two paragraphs and it renders them itself; lock
     and done have none, since their question already says it. */
  const LINE: Record<OnboardingStep, () => string> = {
    welcome: () => '',
    restore: m.ob_restore_body,
    name: m.ob_name_body,
    flag: m.ob_flag_body,
    scales: m.ob_track_body,
    features: m.ob_features_body,
    lock: () => '',
    permissions: m.ob_perms_body,
    disguise: m.ob_disguise_body,
    done: () => ''
  };

  /* The welcome's second action. Quiet, and it changes the flow rather than
     opening anything: what it settles is that this is a person with a
     journal already, which is the fact every later step reads. */
  function beginRestore() {
    restoring = true;
    genitalEffectsChoice = null;
    sexualEffectsChoice = null;
    cycleChoice = null;
    moduleChoices = null;
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
      archiveError = m.picker_failed();
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

  /* The same bloom out of the sun as a flag picked in Settings (prh12): the
     new colours grow from this field's sun with its rings on the edge,
     where writing the preference alone cut the whole screen in one frame.
     Skip's reset below stays a plain write, since it leaves the step. */
  function pickPalette(key: string) {
    if (prefs.palette !== key || isAppearancePending('palette')) changePalette(() => { prefs.palette = key; });
  }

  function skip() {
    if (step === 'name') name = '';
    else if (step === 'flag') prefs.palette = paletteOnEntry;
    else if (step === 'scales') scales = null;
    else if (step === 'features') {
      genitalEffectsChoice = null;
      sexualEffectsChoice = null;
      cycleChoice = null;
      moduleChoices = null;
    } else if (step === 'lock') lockAfter = null;
    /* The permissions step is not in this list, and that is the whole of
       what skipping it does (ticket 31). Its answers live in the OS rather
       than in `prefs`, so there is no stored default for a Skip to protect:
       nothing was granted, nothing is revoked, and every row is still there
       under /settings/permissions. */
    else if (step === 'disguise') disguise = false;
    go(stepAfter(steps, step));
  }

  /* One way out, whichever control was pressed. "Straight to the app" from
     an early step and "Go to Today" from the finish are the same act -
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
    if (setupBusy) return;
    setupBusy = true;
    setupError = '';
    const wasOnboarded = prefs.onboarded;
    try {
      /* Restore precedes setup answers. The archive supplies its own
         journal choices; setup still applies device-local choices. */
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

      /* All answers must land before disguise can close the Android process. */
      await completeSetup({
        async writeAnswers() {
          const firstRun = !restoring && !wasOnboarded;
          const modules = firstRunModuleWrites(restoring, wasOnboarded, moduleChoices);
          if (modules.length > 0) {
            await journal.areaStates.setAreasHidden(modules.filter(({ hidden }) => hidden).flatMap(({ row }) => featureAreas(row)), true);
            await journal.areaStates.setAreasHidden(modules.filter(({ hidden }) => !hidden).flatMap(({ row }) => featureAreas(row)), false);
          }
          if (firstRun || genitalEffectsChoice !== null) {
            await journal.effectCategories.setCategoryEnabled('genital', genitalEffectsChoice ?? false);
          }
          if (firstRun || sexualEffectsChoice !== null) {
            await journal.effectCategories.setCategoryEnabled('sexual', sexualEffectsChoice ?? false);
          }
          if (!restoring && !wasOnboarded) prefs.cycleTrackingChoice = cycleChoice ?? false;
          else if (cycleChoice !== null) prefs.cycleTrackingChoice = cycleChoice;
          if (name.trim()) prefs.name = name.trim();
          if (scales) prefs.activeScales = scales;
          /* Only where the question was asked: a mode with no secret
             shows none, and a timing it never saw should not be waiting
             for a mode that has one. */
          if (lockAfter && lockAsks) prefs.lockAfter = lockAfter;
          prefs.onboarded = true;
        },
        flushWrites: flushPreferences,
        disguise,
        turnOnDisguise: () => setPreferenceDurably('disguise', true),
        leaveSetup: async () => {
          await finishHistory?.();
          await replaceRoute(onboardingDestination());
        }
      });
    } catch (error) {
      archiveBusy = false;
      console.error('Could not finish setup', error);
      setupError = m.ob_setup_save_failed();
    } finally {
      setupBusy = false;
    }
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
     571px of overflow on the permissions step (ticket 31). Now the screen
     is exactly the window, the answers have their own region, and the
     question and the foot cannot move at all. -->
<div class="screen screen-setup" data-setup-frame style={`--step-grow:${growth}`} bind:this={frame}>
  <div class="setup step-field-host" class:is-hero={hero} class:is-collapsing={collapsing}>
    <!-- The field. Its height is the sun's reach at this step plus the
         question, so it comes down one step's worth per step with the
         question riding on it, and that edge is rule 10's blind on this
         screen. `blindEdge` is what moves it: it watches this box rather
         than the step counter, because the height also changes when the
         access-mode step walks to its pad, when a question re-wraps and
         when a raised keyboard drops the flow into its short form, and
         each of those has to travel rather than jump. -->
    <div
      class="setup-field step-field"
      data-setup-field
      use:blindEdge
      bind:this={field}
      style:overflow-clip-margin={collapseMargin}
    >
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
      <div class="setup-paint step-field-paint" data-field-blind>
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
              <div class="setup-sun-draw" in:layer={{ z: 1 }} out:layer={{ z: 0 }} {@attach openingSun}>
                <FlagSun />
              </div>
            {/key}
          </div>
        {/if}
      </div>

      <!-- The back control, top left, in the field's own ink. Absent on the
           welcome and wherever a step has no way back (rule 12). The
           welcome has the language switch in its place, and the two cross
           in one cell as the field collapses into the first step. -->
      <div class="setup-head">
        {#if hero}
          <div
            class="setup-lang"
            role="radiogroup"
            aria-label={m.language()}
            data-opening="sign"
            use:rovingRadio={{ selectOnArrow: false }}
            in:fieldPart
            out:fieldPart
          >
            {#each LANGUAGES as [code, name] (code)}
              <button
                role="radio"
                aria-checked={code === locale}
                aria-label={name}
                lang={code}
                data-language-pick={code}
                onclick={() => pickLanguage(code)}
              >
                {code.toUpperCase()}
              </button>
            {/each}
          </div>
        {:else if !awaitingAccessMode}
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
            onclick={previousStep}
            in:fieldPart
            out:fieldPart
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
      <div class="step-field-ask">
        {#key question}
          <!-- `data-field-part` for the same reason the paint carries
               `data-field-blind`: on a navigation the question is printed on
               the field and rides its edge, fading where it stands, rather
               than being part of the screen's own crossfade. Between steps
               it is the two transitions below that move it - one mechanism
               per kind of change, both reading one set of numbers.

               The welcome prints the wordmark instead of its question
               (ticket 19): "Welcome!" stays the heading a screen reader
               lands on, and the name of the app is what the eye does. -->
          <div
            class="setup-ask-part"
            data-field-part
            in:fieldPart={{ printed: true }}
            out:fieldPart={{ printed: true }}
          >
            <h1
              class="setup-title"
              class:visually-hidden={hero}
              data-setup-question
              tabindex="-1"
              data-arrival-focus
              {@attach questionArrives}
            >
              {question}
            </h1>
            {#if hero}
              <p class="setup-wordmark" data-opening="mark">{appWordmark(prefs.disguise, m.app_name(), m.disguise_name())}</p>
              <!-- The dictionary entry spells the app's name, so under the
                   disguise, whose name is on the field instead, it is left
                   out rather than signed under the wrong word. -->
              {#if !prefs.disguise}<p class="setup-def" data-opening="sign">{m.ob_welcome_def()}</p>{/if}
            {/if}
          </div>
        {/key}
      </div>
    </div>

    <!-- Everything under the edge, riding it on the edge's own clock: the
         line and the answers travel together, so the pair reads as one
         sheet of page being uncovered rather than as two blocks each
         finding its own way down. -->
    <div class="step-field-below">
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
              {#if erasedOnEntry}<p class="setup-line is-result" role="status" data-erased-result use:erasedArrival>{m.reset_done()}</p>{/if}
              <!-- What the app is, and only that: the privacy promise that
                   stood under it made the screen too busy (Alicja,
                   pre-release-human ticket 19 sign-off). -->
              <p class="setup-line is-pitch" data-opening="line">{m.ob_welcome_what({ appName: appWordmark(prefs.disguise, m.app_name(), m.disguise_name()) })}</p>
            {:else if line && step !== 'features'}
              <p class="setup-line">{line}</p>
            {/if}

            <!-- The answers, 20 under the line, each drawn the way rule 13
                 has for what it is: a row in a flush list, a block, a
                 typed answer on a rule, or a key. This region is the only
                 thing on a step that scrolls. -->
            <div class="setup-answers" class:has-feature-line={step === 'features'} data-setup-answers>
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
                           (`tests/restore-gallery.mjs`), which sampled `none`
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
                <div class="typed">
                  <label class="field-label" for="ob-restore-pass">{m.backup_password_label()}</label>
                  <input
                    class="rule-input"
                    type="password"
                    id="ob-restore-pass"
                    name="ob-restore-pass"
                    autocomplete="off"
                    placeholder={m.imp_password_placeholder()}
                    bind:value={archivePass}
                    oninput={unproveArchive}
                  />
                </div>
              {:else if step === 'name'}
                <!-- The person's name is the first thing in the app set in
                     the app's own voice: the display face at 28 on a 3px
                     rule, no box and no fill (rule 13). -->
                <div class="typed is-bare">
                  <input
                    class="rule-input"
                    id="ob-name"
                    name="ob-name"
                    aria-labelledby={QUESTION_ID}
                    placeholder={m.ob_name_placeholder()}
                    autocomplete="off"
                    bind:value={name}
                  />
                </div>
              {:else if step === 'flag'}
                <!-- A flag is a block of its own stripes (rule 13), drawn
                     by screens.css's .palette-grid the same way Settings
                     draws it: four across, the name under it on the page,
                     the chosen one framed in the section rule's 3px. -->
                <div class="palette-grid setup-flags" role="radiogroup" use:rovingRadio use:paletteNameFit aria-label={m.colour_palette()}>
                  {#each PALETTES as [key, label] (key)}
                    <button
                      class="palette-swatch"
                      class:is-active={prefs.palette === key}
                      role="radio"
                      aria-checked={prefs.palette === key}
                      data-palette-pick={key}
                      onclick={() => pickPalette(key)}
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
                <ScaleChecklist
                  ticked={tickedScales}
                  onToggle={toggleScale}
                  offered={vocabulary.ready ? undefined : firstRunScales()}
                />
              {:else if step === 'features'}
                <p class="setup-line setup-feature-line">{line}</p>
                <FeatureVisibilityList
                  {moduleEnabled}
                  onModuleChange={chooseModule}
                />
                <h2 class="setup-feature-heading">{m.feature_filters_title()}</h2>
                <ListCard>
                  <ListRow
                    key="feature-genital-effects"
                    title={m.feature_genital_effects()}
                    subtitle={m.feature_genital_effects_sub()}
                    checked={genitalEffectsShown}
                    chevron={false}
                    onclick={() => (genitalEffectsChoice = !genitalEffectsShown)}
                  />
                  <ListRow
                    key="feature-sexual-effects"
                    title={m.feature_sexual_effects()}
                    subtitle={m.feature_sexual_effects_sub()}
                    checked={sexualEffectsShown}
                    chevron={false}
                    onclick={() => (sexualEffectsChoice = !sexualEffectsShown)}
                  />
                  <ListRow
                    key="feature-cycle-tracking"
                    title={m.cycle_tracking_toggle_title()}
                    subtitle={m.feature_cycle_tracking_sub()}
                    checked={cycleShown}
                    chevron={false}
                    onclick={() => (cycleChoice = !cycleShown)}
                  />
                </ListCard>
              {:else if step === 'lock'}
                <!-- The module and the question after it cross rather than
                     swap: the module leaves on the frame the keystore is
                     made, and the timing arrives in the same cell, so there
                     is no frame with neither and none with both stacked. -->
                <div class="setup-lock-stage">
                  {#key awaitingAccessMode}
                    <div class="setup-lock-part" in:fieldPart out:fieldPart>
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
                             the eye meets the same shape it met on earlier steps. -->
                        <AccessModeSetup
                          bind:this={accessSetup}
                          purpose="setup"
                          busy={accessBusy}
                          error={accessError}
                          onChoose={chooseAccessMode}
                          bind:chosen={accessChosen}
                        />
                      {:else if lockAsks}
                        <!-- What is left once the module above has run: when
                             the mode's secret is asked for again, the one
                             thing this step still decides for itself. A mode
                             with nothing to ask has no question, and the
                             line above says so. -->
                        <LockAfterChoice
                          value={lockAfter ?? 'one-minute'}
                          onChange={(next) => (lockAfter = next)}
                          aria-label={m.ob_lock_title()}
                        />
                      {/if}
                    </div>
                  {/key}
                </div>
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
                <PermissionList asksOnly />
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
                    static
                    key="disguise"
                    title={m.disguise_app_title()}
                    subtitle={isAndroid() ? m.disguise_app_sub_android() : m.disguise_app_sub_web()}
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
    <div class="setup-foot" data-setup-foot data-opening="foot">
      {#if setupError}<p class="setup-status" role="alert">{setupError}</p>{/if}
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
          disabled={archiveBusy || setupBusy}
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
     same place on all nine steps.

     `--blind-edge` is where the field's bottom edge is, in pixels. It is
     registered rather than left as a plain custom property for the reason
     every var()-driven animation in this app has to be: an unregistered
     property has no type, so it cannot be interpolated, and a transition
     naming it would jump. Registered as a length, it animates, and the
     clip below reads it per frame. */
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
    /* Queried by the welcome's hero (below). The frame is exactly the
       window's height by its own rule, so containing its size changes
       nothing about how it is laid out. */
    container: setup-frame / size;
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
      var(--space-2) + 175px * var(--step-grow, 1) * var(--sun-mult, 1) + 78px
    );
  }
  /* ---------- the field ---------- */

  /* Picking a flag changes what colour the field is, and a state change
     moves (ADR-0078). Measured on the first flipbook: the whole field went
     from trans pink to agender green between two frames while the sun was
     still redrawing ring by ring underneath, so the loudest surface on the
     screen was the one thing that teleported.

     What moves is the flag being left: it lies over the flag arriving and
     wipes off towards the far corner, so the new colour is uncovered from
     the sun's corner outwards on the sun's own clock. First in the paint's
     DOM order and so under the sun, which keeps drawing over both.

     The rest of the palette still arrives in one frame - a tick's fill, a
     row's icon block (Skip's words fade, see .setup-outs) - because `--accent` and the
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
  .setup.is-collapsing .setup-sun :global(.sun) {
    transition-timing-function: var(--ease-out-soft);
  }

  /* The sun's room, which is also the back control's row. Reserved as the
     sun's reach at this step rather than at full size: the reserve is what
     the field's height is made of, so reserving the finish's 175px from the
     first step would make every step's field the tallest one's.

     Home gained --space-7 of room under its disc in carpet ticket 154 and
     this did not, though the ticket first added it here too. The two are
     not the same shape: Home's field bottom edge *is* this reserve, with
     the wordmark sitting on it, so without the room the innermost ring
     lands 6px off that edge and touches it at the breathing loop's
     midpoint. Here the question sits below the reserve, so the disc never
     reaches the field's own bottom edge and there is nothing to hold it
     off. Adding it anyway cost a step 32px of a budget rule 14 measures:
     the walkthrough caught the disguise step's foot intercepting clicks
     on the switch above it, because a step may not scroll and the
     answers had nowhere left to go. */
  .setup-head {
    position: relative;
    /* Keep Back above questions that cross its target during a step change. */
    z-index: 2;
    min-height: calc(175px * var(--step-grow, 1) * var(--sun-mult, 1));
    /* One cell, so the welcome's language switch and the back control
       that replaces it cross where they stand rather than stacking. */
    display: grid;
    align-content: start;
    justify-items: start;
  }
  .setup-head > * {
    grid-area: 1 / 1;
  }
  .setup-head .icon-btn {
    color: inherit;
    /* The glyph sits 13px inside a 48px target, so the box starts left of
       the content edge for the arrow to look aligned with the question
       under it. The target keeps its full width; only the box moves. */
    margin-left: calc(-1 * var(--space-3));
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
  /* The lock step's two halves in one cell, like the stage above it. */
  .setup-lock-stage {
    display: grid;
  }
  .setup-lock-stage > * {
    grid-area: 1 / 1;
    min-height: 0;
  }

  /* One line under the field, on the page, 12 below the edge: what the
     answer does, at 15/600 in the secondary ink (rules 2 and 12). Never a
     paragraph - the welcome's line under its wordmark is the flow's one exception. */
  .setup-line {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
  /* What a wipe from Settings left behind (phase 14 ticket 15): a result
     rather than a description, so it reads in the text colour above the
     welcome's own muted lines. */
  .setup-line.is-result {
    margin-top: 0;
    color: var(--text);
  }
  .setup-line.is-pitch {
    font-weight: var(--weight-regular);
    line-height: var(--leading-body);
  }
  /* A measure for reading, which the 640px column on a desktop is not. */
  .setup-line.is-pitch {
    max-width: 60ch;
  }

  /* ---------- the welcome (pre-release-human ticket 19) ----------

     The app's first screen, so the field is its hero: most of a phone
     tall, the sun large in its corner (steps.ts, WELCOME_SUN) and the
     wordmark on its bottom edge. The field takes whatever the line
     and the foot leave, up to 70% of the frame, which is 60 to 70% on a
     phone; everything under it is its own height. "Set up the app" takes
     the class off, the field's box drops to the first step's in one
     layout, and stepBlind travels the painted edge up to it on the same
     clock as every step change, while the sun shrinks on its own
     transition: one object moving, never a cut. */
  .setup.is-hero > .setup-field {
    flex: 1 1 auto;
    max-height: 70%;
    display: flex;
    flex-direction: column;
  }
  /* The head grows into the room and asks for none of it. Its own floor is
     the sun's reach (175px x the scale), which on the welcome made the
     field's smallest size 224 to 280px plus the wordmark, and a frame that
     could not give that much pushed the foot past its bottom: 35px at
     390x844 under the demo bar, 84px with the window at 360. The
     walkthrough then hit the scroll region instead of "Set up the app".
     The field now gives way first, and the sun is sized to the frame below
     so the room it leaves is still room for it. */
  .setup.is-hero .setup-head {
    flex: 1 1 auto;
    min-height: 0;
  }
  .setup.is-hero > .step-field-below,
  .setup.is-hero .setup-stage {
    flex: 0 0 auto;
  }
  /* With one line under the field, a tall frame has room left over once
     the field reaches its 70%: it goes above the foot, which stays on the
     window's bottom edge as it does on every step (rule 12). */
  .setup.is-hero > .setup-foot {
    margin-top: auto;
  }
  /* Nothing is asked on the welcome, and the empty region's 20px of margin
     is room the field needs on a short frame. */
  .setup.is-hero .setup-answers {
    display: none;
  }
  /* The hero sun keeps clear of the language switch on a narrow phone and
     of the wordmark on a short frame. Its reach is the corner's quarter,
     and the field is what the line and the foot leave of the frame,
     so the steps go by the frame's own height (the demo bar and a raised
     keyboard both take from it, and neither shows in a media query). */
  @media (max-width: 399px) {
    .setup.is-hero {
      --sun-mult: 0.8;
    }
  }
  /* Each step keeps the quarter's reach under where the wordmark starts,
     measured with the larger text setting on at 412, 390, 360 and 320
     wide. */
  @container setup-frame (max-height: 759px) {
    .setup.is-hero {
      --sun-mult: 0.85;
    }
  }
  @container setup-frame (max-height: 699px) {
    .setup.is-hero {
      --sun-mult: 0.65;
    }
  }
  @container setup-frame (max-height: 639px) {
    .setup.is-hero {
      --sun-mult: 0.45;
    }
  }
  @container setup-frame (max-height: 559px) {
    .setup.is-hero {
      --sun-mult: 0.25;
    }
  }
  /* A window under 480px (a raised keyboard, or a phone held sideways) has
     no room for a display-size wordmark and its signature: the name drops
     to the short form's question size beside the language switch, on one
     row, and the dictionary line is left out, so the line and the
     foot still fit (at 390x360 with larger text the stacked field left the
     frame 24px short). */
  @container setup-frame (max-height: 479px) {
    .setup.is-hero > .setup-field {
      flex-direction: row;
      align-items: center;
      gap: var(--space-4);
    }
    .setup.is-hero .setup-head {
      flex: none;
    }
    .setup.is-hero .setup-wordmark {
      font-size: var(--text-xl);
      letter-spacing: var(--display-track);
      line-height: var(--leading-display);
    }
    .setup.is-hero .setup-def {
      display: none;
    }
  }

  /* The name of the app at display size, in the field's ink: the same
     treatment as a question (rule 2), one size up, because on this screen
     it is the headline. The disguise name when the disguise is on. */
  .setup-wordmark {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(3.5rem, 19vw, 6rem);
    font-weight: var(--weight-display);
    letter-spacing: -0.045em;
    line-height: 0.9;
    overflow-wrap: break-word;
  }
  /* The dictionary line, signed under the wordmark: small, italic, in the
     field's own ink. */
  .setup-def {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    font-style: italic;
    font-weight: var(--weight-medium);
    /* "istnienia." alone on the second line at 412px otherwise. */
    text-wrap: pretty;
  }

  /* PL / EN, top left where the back control is on every other step: one
     pill with a stroke in the field's ink, the language in use filled with
     that ink and lettered in the field's colour (sign-off round 1: "make
     the language chooser a little bit more visible, maybe a stroke over the
     button?"). The ink is what the field's text is measured in, so the
     stroke and the fill hold the text's own contrast against the field,
     well over the 3:1 a control's edge owes (9.59:1 on trans, light and
     dark). 2px rather than the kit's 1.5px input edge, which Chromium
     snaps to 1px at a 2x density and which read as faint on the flag.

     The stroke is an inset shadow rather than a border, so it takes no
     room: as a border it left each half 44px tall inside a 48px pill,
     under the touch floor the walkthrough's setup no-scroll flow measures
     every button against. Each half is now the full 48 by at least 48,
     and the pill looks the same. */
  .setup-lang {
    display: flex;
    border-radius: 999px;
    box-shadow: inset 0 0 0 2px currentColor;
  }
  .setup-lang button {
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: 999px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    letter-spacing: 0.06em;
  }
  .setup-lang button[aria-checked='true'] {
    background: var(--field-ink);
    color: var(--field);
  }

  /* The first sun's CSS entrance gives way to the opening's own, which
     draws the rings from the corner outwards after the first frame has
     left ($lib/onboarding/opening.ts). The breathing stays. Not under
     reduced motion, where the rings have no animation at all and naming
     the loop here would bring it back as a 1ms strobe. */
  @media (prefers-reduced-motion: no-preference) {
    :global(html:not([data-a11y-motion='reduce'])) .setup-sun-draw:global(.is-opening .sun i) {
      animation-name: none, breathe;
    }
  }

  /* The answers, 20 under the line, and the one region on a step that may
     scroll (rule 14). It bleeds to the screen's edges and pads back in: a
     region that scrolls clips on both axes, so a block reaching past the
     content edge inside it would be cut. */
  /* 4px of the 20 above moved inside the scroller (after-release 17,
     U16): the name field sits at the region's very top, and its focus
     ring - 2px drawn 2px out - was cut off along its top edge by the
     scroller's own clip. The content lands where it did. */
  .setup-answers {
    flex: 1 1 0;
    min-height: 0;
    margin: calc(var(--space-5) - 4px) calc(-1 * var(--screen-inset)) 0;
    padding: 4px var(--screen-inset) 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* Nothing in a step's answers touches the thing above it. The app's own
     20 between blocks (rule 1), stated here because this region is not
     `.screen`'s child and so is outside that rule's reach. */
  .setup-answers > * + * {
    margin-top: var(--space-5);
  }
  .setup-answers.has-feature-line {
    margin-top: var(--space-3);
    padding-top: 0;
  }
  .setup-feature-line {
    margin-top: 0;
  }
  /* A new group after the features, so it stands well clear of the last
     feature row: 40 above, the section rhythm's own gap (bug session 18,
     item 51 - it sat a few pixels under Documents and read as one more row). */
  .setup-feature-heading {
    margin-top: var(--space-8);
    margin-bottom: 0;
    font-size: var(--text-md);
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
  /* Four flags across, so a row of the grid is four and the four arrive
     together. */
  .setup-flags .palette-swatch:nth-child(n + 5) {
    --row-index: 1;
  }
  .setup-flags .palette-swatch:nth-child(n + 9) {
    --row-index: 2;
  }
  .setup-flags .palette-swatch:nth-child(n + 13) {
    --row-index: 3;
  }

  /* A typed answer sits on the rule: the display face at 28 on a 3px --text
     bottom rule, no box and no fill, the placeholder in the secondary ink
     (rule 13). The person's name is the first thing in the app set in the
     app's own voice. A passphrase is the same shape with its characters
     hidden. */
  /* The rule-shaped input, its label and the rule that draws itself in on
     focus are `.typed`/`.rule-input` in components.css since redesign ticket
     34: the gates ask for a passphrase on the same shape, and rule 13 says
     they are one drawing. */

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
     side by side under it. Outside .step-field-below, so it does not ride the
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
  /* Colour joins .btn's list here because picking a flag changes
     --accent-ink under these words: without it Skip and "straight to the
     app" changed colour in one frame while the field beside them wiped
     (carpet 15 row 51). Text, so the sRGB mix the field avoids is not
     visible at this size. */
  .setup-outs .btn {
    padding: 0 var(--space-3);
    transition-property: transform, background, filter, opacity, color;
    transition-duration: var(--dur-press), var(--dur-fast), var(--dur-fast), var(--dur-fast), var(--dur-authored);
    transition-timing-function: var(--ease-press), var(--ease-out), ease, var(--ease-out), var(--ease-out);
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
      --blind-edge: calc(var(--space-2) + 48px + 46px);
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
    /* A 640px column has room for a larger quarter than a phone. */
    .setup.is-hero {
      --sun-mult: 1.25;
    }
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
    /* screens.css sets the flags eight across here, so a row of the grid is
       eight: the fifth to eighth arrive with the first four, the second
       eight together after them. */
    .setup-flags .palette-swatch:nth-child(n + 5) {
      --row-index: 0;
    }
    .setup-flags .palette-swatch:nth-child(n + 9) {
      --row-index: 1;
    }
  }
</style>
