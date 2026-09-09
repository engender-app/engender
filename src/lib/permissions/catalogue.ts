/* Everything this app can ask the phone for, in one list (phase 10 redesign
   ticket 31).

   The app asks for four things and, until this list existed, never explained
   them together: notifications from the reminders screen, exact alarms from a
   warning notice, the microphone and the camera at the moment somebody taps
   record. Each had its own inline sentence and there was no shared picture.
   For an app whose whole claim is that nothing leaves the device, the list is
   the claim made concrete - four things it can ask for, several it reaches
   only by handing you a system picker, and no internet permission at all
   (`tests/browser-tier/verify-build.mjs` asserts that last one).

   What lives here is the shape of the list and the rule for what a row's
   trailing control does. The states themselves come from the OS
   (`status.svelte.ts`), and the words come from the catalogue, so this module
   is rune-free and DOM-free and runs in the Node tier next to the rest of the
   pure model (ADR-0017).

   The inventory this was written from, with the file references and the
   deep-links that already existed, is
   `.scratch/phase-10/redesign/permissions-inventory.md`. */

/** The ones an OS dialog or a system settings screen exists for. In the
    order the list draws them: the two that make the app speak first, then
    the two that let it listen and look. */
export const GRANT_KEYS = ['notifications', 'exactAlarms', 'microphone', 'camera'] as const;
export type GrantKey = (typeof GRANT_KEYS)[number];

/** The ones that need no permission. Five of them because the system asks
    instead and hands the app exactly one thing back; the last two because
    they are the device's own business and the app only ever gets the answer.

    All seven, rather than the five the ticket's Scope enumerated: the whole
    claim of this list is that it is the whole list, and the inventory
    (`.scratch/phase-10/redesign/permissions-inventory.md`) files battery
    optimisation and the biometric under exactly this heading. A list that
    quietly drops two of them is not the claim it says it is. */
export const AMBIENT_KEYS = [
  'takePhoto',
  'pickFile',
  'backupFolder',
  'print',
  'clipboard',
  'batteryOptimisation',
  'biometric'
] as const;
export type AmbientKey = (typeof AMBIENT_KEYS)[number];

export type Platform = 'android' | 'web';

/** What the OS says, plus the one thing the OS cannot say: that this
    platform has no such capability to grant at all. */
export type GrantState = 'granted' | 'denied' | 'unavailable';

export type GrantStates = Record<GrantKey, GrantState>;

/** Nothing granted: where both platforms start, what a failed read falls back
    to, and what every test and fixture builds its cases from.

    Here rather than in `grant.ts` because this is the module that owns the
    shape, and four copies of the same four keys is how a fifth capability
    ends up silently missing from one of them. Falling back to this rather
    than to granted is the one direction that cannot mislead: it shows a
    button that may turn out to be unnecessary instead of hiding one that
    was. */
export const NOTHING_GRANTED: GrantStates = {
  notifications: 'denied',
  exactAlarms: 'denied',
  microphone: 'denied',
  camera: 'denied'
};

/** What pressing the row's trailing control does. `none` is a row with
    nothing to press: granted, unavailable, or refused with nowhere to send
    somebody afterwards. */
export type GrantAction = 'prompt' | 'settings' | 'none';

/** The system screen a refusal sends somebody to. `appInfo` is the app's own
    details page, which is all Android offers for the microphone and the
    camera - the gap the inventory names, and the reason this ticket adds the
    intent for it. */
export type SettingsTarget = 'notifications' | 'exactAlarms' | 'appInfo';

/** The second line a row grows when there is nowhere for its control to
    send anybody.

    One case: a refused web prompt. Every other refusal ends on a button into
    the right system screen, and this is the one the app cannot offer, because
    a page cannot open the browser's own site settings - so the row says where
    the browser keeps it rather than ending on an inert word.

    The exact-alarms row was the other candidate and was cut. It shows a
    settings link from the first render, beside three siblings showing Allow,
    which a note would have explained - but the note ran to three lines beside
    the button on a 390px phone, on the one step in setup with the least room
    to spare (`.claude/permissions-measurements.json`), and the label already
    says where pressing it goes. */
export type RowNote = 'browserHolds';

export interface GrantRow {
  key: GrantKey;
  icon: string;
  state: GrantState;
  action: GrantAction;
  settingsTarget: SettingsTarget | null;
  note: RowNote | null;
}

export interface AmbientRow {
  key: AmbientKey;
  icon: string;
}

const GRANT_ICON: Record<GrantKey, string> = {
  notifications: 'bell',
  exactAlarms: 'clock',
  microphone: 'mic',
  camera: 'video'
};

const AMBIENT_ICON: Record<AmbientKey, string> = {
  takePhoto: 'camera',
  pickFile: 'image',
  backupFolder: 'download',
  print: 'documents',
  /* Not `key`, though what is copied is the recovery key: `/settings`' own
     row into this list wears that glyph, and the same icon meaning two
     things one navigation apart is the kind of small lie a list like this
     cannot afford. */
  clipboard: 'note',
  batteryOptimisation: 'zap',
  biometric: 'fingerprint'
};

/** Where a refusal can send somebody, per capability. Null on the web: a
    page cannot open the browser's own site settings, so a refused web prompt
    ends on a sentence rather than on a button that would do nothing. */
function settingsTargetFor(key: GrantKey, platform: Platform): SettingsTarget | null {
  if (platform === 'web') return null;
  if (key === 'notifications') return 'notifications';
  if (key === 'exactAlarms') return 'exactAlarms';
  return 'appInfo';
}

/** Whether this platform can grant the thing at all.

    Notifications and exact alarms are Android's: the web build schedules
    nothing (ADR-0063), so a web notification would be a permission granted
    for a feature that cannot exist. The microphone and the camera are
    `getUserMedia` on both, so both can ask. */
function availableOn(key: GrantKey, platform: Platform): boolean {
  if (platform === 'android') return true;
  return key === 'microphone' || key === 'camera';
}

/** The four rows, resolved against what the OS currently says and what has
    already been asked for in this visit.

    `asked` is what turns a prompt into a way out. A row starts offering the
    real dialog; once that dialog has been shown and the answer is still no,
    a second press of the same button would do nothing at all on Android,
    which is the dead end the microphone and the camera have today. So the
    button becomes the link into the system screen instead. Exact alarms skip
    the first half of that: Android has no runtime dialog for
    SCHEDULE_EXACT_ALARM, only the deep-link, so its button is the link from
    the start rather than after a refusal. */
export function grantRows(
  platform: Platform,
  states: GrantStates,
  asked: ReadonlySet<GrantKey>
): GrantRow[] {
  return GRANT_KEYS.map((key) => {
    const state = availableOn(key, platform) ? states[key] : 'unavailable';
    const settingsTarget = settingsTargetFor(key, platform);
    const action = actionFor();
    return { key, icon: GRANT_ICON[key], state, settingsTarget, action, note: noteFor() };

    function actionFor(): GrantAction {
      if (state !== 'denied') return 'none';
      if (key === 'exactAlarms' || asked.has(key)) return settingsTarget ? 'settings' : 'none';
      return 'prompt';
    }

    /* Only where the row would otherwise dead-end. Every second line costs
       the step height it can least afford, so a row whose button says what
       happens next does not get one. */
    function noteFor(): RowNote | null {
      return state === 'denied' && asked.has(key) && !settingsTarget ? 'browserHolds' : null;
    }
  });
}

/** Rows the web has nothing to draw for.

    The backup folder is `ACTION_OPEN_DOCUMENT_TREE`, Android's, and the web
    build's export is a download rather than a folder the app keeps writing
    to. Battery optimisation is an Android idea altogether: there is no
    browser equivalent to be exempted from, and the web build schedules
    nothing that could be delayed by one (ADR-0063). The biometric stays on
    both, because both have one - a Keystore auth-bound key on Android and
    WebAuthn PRF in a browser. */
const ANDROID_ONLY_AMBIENT: readonly AmbientKey[] = ['backupFolder', 'batteryOptimisation'];

/** The second group, which has no buttons because there is nothing to press:
    the system asks at the moment it is used, or never asks the app at all. */
export function ambientRows(platform: Platform): AmbientRow[] {
  return AMBIENT_KEYS.filter(
    (key) => platform === 'android' || !ANDROID_ONLY_AMBIENT.includes(key)
  ).map((key) => ({ key, icon: AMBIENT_ICON[key] }));
}
