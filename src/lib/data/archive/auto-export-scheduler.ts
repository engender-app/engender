import { journal } from '$lib/data/live/journal.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
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
let observedFailureAt = 0;

const MIN_GAP_MS = 60 * 1000;

/* The failure notice, under the unprompted registry's rules (phase 6 ticket
   04). It lives here rather than in runAndroidAutoExport because a
   notification is only ever right for the scheduled path, and because
   holding one needs the next tick: a failure inside quiet hours sets
   `heldExportFailureNotice` and a later check outside the window posts it,
   which is what makes the hold a hold rather than a drop. Called on every
   tick with `failedNow: false` for exactly that reason. */
async function reportFailure(failedNow: boolean, at: number) {
  const step = exportFailureNoticeStep({
    failedNow,
    held: prefs.heldExportFailureNotice,
    enabled: prefs.exportFailureNoticeEnabled,
    quiet: quietHoursOf(prefs),
    at: new Date(at)
  });

  if (prefs.heldExportFailureNotice !== step.held) prefs.heldExportFailureNotice = step.held;
  if (!step.post) return;

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
  }
}

async function maybeRun() {
  if (running || !isAndroid()) return;

  const now = Date.now();
  if (now - lastAttemptAt < MIN_GAP_MS) return;

  running = true;
  lastAttemptAt = now;
  try {
    /* A held notice waits for quiet hours to end, not for another backup. */
    await reportFailure(false, now);
    const status = await androidAutoExport.status();
    // Packing stays deferred until this Android-only check runs.
    const { isDue, runAndroidAutoExport } = await import('./android-auto-export');
    if (status.lastFailureAt != null && status.lastFailureAt > observedFailureAt) {
      observedFailureAt = status.lastFailureAt;
      await reportFailure(true, now);
    }
    if (status.lastSnapshotAt != null && (prefs.lastBackupAt == null || status.lastSnapshotAt > prefs.lastBackupAt)) {
      prefs.lastBackupAt = status.lastSnapshotAt;
      prefs.backupNoticeDismissed = false;
    }
    if (!status.enabled || !status.destinationUri || !status.hasPassword) return;
    const refreshWindow = (status.nextDueAt ?? 0) - 24 * 60 * 60 * 1000;
    if (!isDue(status, now) && status.stagedSnapshotAt != null &&
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
    await reportFailure(true, now);
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
