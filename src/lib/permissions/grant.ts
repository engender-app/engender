/* The acts behind the permissions list's buttons (phase 10 redesign ticket
   31): reading what the OS currently says, and asking it for something.

   Split from the component because these are four platform calls with four
   different shapes, and from `catalogue.ts` because that module is the pure
   one - it decides what a row offers, and never touches a device.

   Nothing here changes when a feature asks for its own permission at first
   use. The reminders screen still asks for notifications and the editor
   still asks for the microphone at the moment somebody taps record. This is
   a second door onto the same prompts, not a replacement for the first. */

import { androidPermissions } from './android-bridge';
import { androidReminders } from '$lib/reminders/android-bridge';
import { isAndroid } from '$lib/platform';
import type { GrantKey, GrantState, GrantStates, SettingsTarget } from './catalogue';

/** Nothing granted. The starting point on both platforms, and what a failed
    read falls back to: showing a capability as granted when the read did not
    answer would be the one wrong way round - it would hide the button that
    is the whole point of the row. */
const NOTHING_GRANTED: GrantStates = {
  notifications: 'denied',
  exactAlarms: 'denied',
  microphone: 'denied',
  camera: 'denied'
};

/** Opens the device, then closes it again.

    The prompt is the point; the stream is not. Anything left live keeps the
    OS recording indicator lit over an app that is not recording, which on a
    journal is a worse lie than a missing feature.

    The camera asks for video alone rather than the constraints a video note
    records under (`videoCaptureConstraints`), which ask for the microphone in
    the same breath. One row, one permission: somebody who wants the camera
    and not the microphone gets exactly that, and the microphone's own row is
    directly above it.

    Two calls with the constraints written out, rather than one call reading
    them from a table. tests/permissions-policy.test.ts derives which
    capabilities the app requires from every `getUserMedia` argument in the
    tree, resolving a literal object or a named helper and nothing else -
    which is what stops a capability shipping dark behind the deployed
    Permissions-Policy header, whose allowlist denies the app's own origin for
    anything not named in it. */
async function askForMedia(key: 'microphone' | 'camera'): Promise<GrantState> {
  try {
    const stream =
      key === 'microphone'
        ? await navigator.mediaDevices.getUserMedia({ audio: true })
        : await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (error) {
    console.error(`the ${key} could not be opened`, error);
    return 'denied';
  }
}

/** What a browser will say without prompting, where it answers at all.

    The Permissions API is the only way to draw a granted row as granted on
    the web without opening the device to find out. Firefox throws on
    `microphone` and Safari has never implemented either name, so an
    unanswered query is an ordinary outcome and means "not granted" rather
    than an error. */
async function webMediaState(name: 'microphone' | 'camera'): Promise<GrantState> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Everything the four rows draw themselves from, read fresh.

    Read again whenever the app comes back to the front, because the way out
    of a refusal is a system screen: somebody who grants the microphone in
    Android's settings and swipes back has changed the answer without the app
    hearing about it. */
export async function readGrantStates(): Promise<GrantStates> {
  if (!isAndroid()) {
    const [microphone, camera] = await Promise.all([
      webMediaState('microphone'),
      webMediaState('camera')
    ]);
    return { ...NOTHING_GRANTED, microphone, camera };
  }

  /* Two readers, because two plugins own these four answers: RemindersPlugin
     has held notifications and exact alarms since the reminders screen was
     built, and PermissionsPlugin was added by this ticket for the two it
     had nothing to say about. Settled together rather than in sequence so a
     slow bridge call does not draw the list twice. */
  const [reminders, media] = await Promise.all([
    androidReminders.getStatus().catch((error) => {
      console.error('could not read the notification permissions', error);
      return null;
    }),
    androidPermissions.getStatus().catch((error) => {
      console.error('could not read the capture permissions', error);
      return null;
    })
  ]);

  /* "not-required" is an older Android saying the permission does not exist
     on it, which for this list is the same row as granted: there is nothing
     left to ask for. A read that failed reports denied, which shows a button
     that may turn out to be unnecessary rather than hiding one that is. */
  const settled = (state: 'granted' | 'denied' | 'not-required' | undefined): GrantState =>
    state === undefined || state === 'denied' ? 'denied' : 'granted';

  return {
    notifications: settled(reminders?.notifications),
    exactAlarms: settled(reminders?.exactAlarms),
    microphone: media?.microphone === 'granted' ? 'granted' : 'denied',
    camera: media?.camera === 'granted' ? 'granted' : 'denied'
  };
}

/** Fires the real prompt for one capability and answers with what it said.

    Exact alarms never reach here: Android has no runtime dialog for
    SCHEDULE_EXACT_ALARM, so `catalogue.ts` gives that row a settings link
    from the start rather than a prompt that would not appear. */
export async function requestGrant(key: Exclude<GrantKey, 'exactAlarms'>): Promise<GrantState> {
  if (key === 'notifications') {
    try {
      const status = await androidReminders.requestNotificationPermission();
      return status.notifications === 'denied' ? 'denied' : 'granted';
    } catch (error) {
      console.error('could not ask for the notification permission', error);
      return 'denied';
    }
  }
  return askForMedia(key);
}

/** Opens the system screen a refusal can be undone on. */
export async function openSystemSettings(target: SettingsTarget): Promise<void> {
  try {
    if (target === 'exactAlarms') await androidReminders.requestExactAlarmPermission();
    else if (target === 'notifications') await androidReminders.openNotificationSettings();
    else await androidPermissions.openAppInfo();
  } catch (error) {
    console.error(`could not open the ${target} settings screen`, error);
  }
}
