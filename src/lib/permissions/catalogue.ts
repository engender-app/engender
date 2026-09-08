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

/** The ones that need no permission, because the system asks instead and
    hands the app exactly one thing back. */
export const AMBIENT_KEYS = [
  'takePhoto',
  'pickFile',
  'backupFolder',
  'print',
  'clipboard'
] as const;
export type AmbientKey = (typeof AMBIENT_KEYS)[number];

export type Platform = 'android' | 'web';

/** What the OS says, plus the one thing the OS cannot say: that this
    platform has no such capability to grant at all. */
export type GrantState = 'granted' | 'denied' | 'unavailable';

export type GrantStates = Record<GrantKey, GrantState>;

/** What pressing the row's trailing control does. `none` is a row with
    nothing to press: granted, unavailable, or refused with nowhere to send
    somebody afterwards. */
export type GrantAction = 'prompt' | 'settings' | 'none';

/** The system screen a refusal sends somebody to. `appInfo` is the app's own
    details page, which is all Android offers for the microphone and the
    camera - the gap the inventory names, and the reason this ticket adds the
    intent for it. */
export type SettingsTarget = 'notifications' | 'exactAlarms' | 'appInfo';

export interface GrantRow {
  key: GrantKey;
  icon: string;
  state: GrantState;
  action: GrantAction;
  settingsTarget: SettingsTarget | null;
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
  clipboard: 'key'
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
    return { key, icon: GRANT_ICON[key], state, settingsTarget, action: actionFor() };

    function actionFor(): GrantAction {
      if (state !== 'denied') return 'none';
      if (key === 'exactAlarms' || asked.has(key)) return settingsTarget ? 'settings' : 'none';
      return 'prompt';
    }
  });
}

/** The second group, which has no buttons because there is nothing to press:
    the system asks at the moment it is used, and hands over the one file it
    was asked for. The backup folder is the one that does not exist on the
    web - `ACTION_OPEN_DOCUMENT_TREE` is Android's, and the web build's export
    is a download rather than a folder the app keeps writing to. */
export function ambientRows(platform: Platform): AmbientRow[] {
  return AMBIENT_KEYS.filter((key) => platform === 'android' || key !== 'backupFolder').map(
    (key) => ({ key, icon: AMBIENT_ICON[key] })
  );
}
