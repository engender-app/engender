import { journal } from '$lib/data/live/journal.svelte';
import { prefs, setPreferenceDurably } from '$lib/data/prefs/store.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { isAndroid } from '$lib/platform';
import { m } from '$lib/paraglide/messages';
/* Relative, not `$lib`: auto-export-scheduler.test.ts runs on the Node
   tier, where the alias does not resolve (ADR-0016), and this rule is pure
   enough that mocking it out would only hide what the notice actually says. */
import { notificationText } from '../../unprompted/notificationText';
import { quietHoursOf } from '../../unprompted/quietHours';
import { androidAutoExport } from './android-auto-export-bridge';
import { exportFailureNoticeStep } from './failureNotice';
import { periodicCheck } from '../backgroundSchedulers';

let running = false;
let lastAttemptAt = 0;

const MIN_GAP_MS = 60 * 1000;

/* The failure notice, under the unprompted registry's rules (phase 6 ticket
   04). It lives here rather than in runAndroidAutoExport because a
   notification is only ever right for the scheduled path, and because
   holding one needs the next tick: a failure inside quiet hours sets
   `heldExportFailureNotice` and a later check outside the window posts it,
   which is what makes the hold a hold rather than a drop. Called on every
   tick even when no new failure is waiting. */
async function reportFailure(failedNow: boolean, at: number, failureAt?: number) {
  if (failureAt != null && prefs.lastExportFailureNotifiedAt === failureAt) failedNow = false;
  const step = exportFailureNoticeStep({
    failedNow,
    held: prefs.heldExportFailureNotice,
    enabled: prefs.exportFailureNoticeEnabled,
    quiet: quietHoursOf(prefs),
    at: new Date(at)
  });

  if (step.post) {
    const channelName = m.notif_export_failure_channel();
    try {
      await androidAutoExport.notifyFailure({
        ...notificationText(
          { title: m.notif_export_failure_notice_title(), body: m.notif_export_failure_notice_body() },
          channelName,
          prefs.hideNotificationTitles
        ),
        channelName
      });
    } catch (error) {
      console.error('Could not post the backup failure notice', error);
      return;
    }
  }
  if (prefs.heldExportFailureNotice !== step.held) {
    await setPreferenceDurably('heldExportFailureNotice', step.held);
    if (prefs.heldExportFailureNotice !== step.held) return;
  }
  // A held or disabled notice is consumed too, so reopening cannot replay it.
  if (failedNow && failureAt != null) {
    await setPreferenceDurably('lastExportFailureNotifiedAt', failureAt);
  }
}

async function maybeRun() {
  if (running || !isAndroid()) return;

  const now = Date.now();
  if (now - lastAttemptAt < MIN_GAP_MS) return;

  running = true;
  lastAttemptAt = now;
  try {
    const status = await androidAutoExport.status();
    // A held notice waits for quiet hours to end, not for another backup.
    await reportFailure(status.lastFailureAt != null, now, status.lastFailureAt ?? undefined);
    if (status.lastFailureAt == null && prefs.lastExportFailureNotifiedAt != null) {
      await setPreferenceDurably('lastExportFailureNotifiedAt', null);
    }
    // Packing stays deferred until this Android-only check runs.
    const { runAndroidAutoExport } = await import('./android-auto-export');
    if (status.lastSnapshotAt != null && (prefs.lastBackupAt == null || status.lastSnapshotAt > prefs.lastBackupAt)) {
      prefs.lastBackupAt = status.lastSnapshotAt;
      prefs.backupNoticeDismissed = false;
    }
    if (!status.enabled || !status.destinationUri || !status.hasPassword) return;
    const refreshWindow = (status.nextDueAt ?? 0) - 24 * 60 * 60 * 1000;
    if (status.stagedSnapshotAt != null &&
        (now < refreshWindow || status.stagedSnapshotAt >= refreshWindow)) return;

    const snapshot = await journal.archive.snapshot();
    const snapshotAt = Date.now();
    const result = await runAndroidAutoExport(
      {
        snapshot,
        snapshotAt,
        preferences: prefs
      },
      {
        now: () => now,
        scheduled: true,
        recordBackup: (at) => {
          prefs.lastBackupAt = at;
          prefs.backupNoticeDismissed = false;
        }
      }
    );

    if (result.outcome === 'ok' || result.outcome === 'staged') return;
    if (result.outcome === 'needs-destination') toast(m.exp_auto_reselect_needed());
    // Native delivery records its own timestamp. Use that same identity here
    // and on the next tick; packing failures have no native receipt.
    const failure = await androidAutoExport.status();
    await reportFailure(true, now,
      failure.lastFailureAt !== status.lastFailureAt ? failure.lastFailureAt ?? undefined : undefined);
  } catch (error) {
    console.error('scheduled auto-export failed', error);
    await reportFailure(true, now);
  } finally {
    running = false;
  }
}

const check = periodicCheck(() => void maybeRun());

export function startAutoExportScheduler() {
  if (isAndroid()) {
    lastAttemptAt = 0;
    check.start();
  }
}

export const stopAutoExportScheduler = check.stop;
