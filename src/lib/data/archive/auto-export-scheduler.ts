import { journal } from '$lib/data/live/journal.svelte';
import { prefs, setPreferenceDurably } from '$lib/data/prefs/store.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { isAndroid } from '$lib/platform';
import { m } from '$lib/paraglide/messages';
/* Relative, not `$lib`: auto-export-scheduler.test.ts runs on the Node tier, where the
   alias does not resolve, and this rule is pure enough that mocking it out would only hide
   what the notice actually says. */
import { notificationText } from '../../unprompted/notificationText';
import { quietHoursOf } from '../../unprompted/quietHours';
import { androidAutoExport, type AutoExportStatus } from './android-auto-export-bridge';
import type { FolderSyncResult } from './folder-sync';
import { exportFailureNoticeStep } from './failureNotice';
import { periodicCheck } from '../backgroundSchedulers';

let running: AbortController | null = null;
let activeRun: Promise<void> | null = null;
let lastAttemptAt = 0;

const MIN_GAP_MS = 60 * 1000;

/* The failure notice, under the unprompted registry's rules. It lives here rather than in runAndroidAutoExport because a
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

/* Folder sync, on the same tick as the backup and ahead of it: on open after unlock (the
   scheduler starts only on an unlocked, ready journal) and again whenever the app comes
   back to the front. A merge says so; so does an archive that would not open, once, since
   the plugin moves past it either way. Nothing new in the folder says nothing. */
async function syncFromFolder(status: AutoExportStatus, signal: AbortSignal) {
  const { runFolderSync, folderSyncReady, localFileBytes } = await import('./folder-sync');
  if (!folderSyncReady(status)) return;
  const { Capacitor } = await import('@capacitor/core');
  let result: FolderSyncResult;
  try {
    result = await runFolderSync(status, {
      merge: (contents) => journal.archive.merge(contents),
      read: (path) => localFileBytes(Capacitor.convertFileSrc(path)),
      signal
    });
  } catch (error) {
    if (signal.aborted) return;
    console.error('folder sync failed', error);
    return;
  }
  if (result.outcome === 'none') return;
  if (result.outcome === 'merged') toast(m.exp_folder_merged_toast(), { kind: 'folder-sync' });
  else if (result.outcome === 'wrong-password') toast(m.exp_folder_wrong_password_toast(), { kind: 'folder-sync' });
  else if (result.outcome === 'no-space') toast(m.exp_folder_no_space_toast(), { kind: 'folder-sync' });
  else toast(m.exp_folder_failed_toast(), { kind: 'folder-sync' });
}

function maybeRun() {
  if (running || !isAndroid()) return;

  const now = Date.now();
  if (now - lastAttemptAt < MIN_GAP_MS) return;

  const owner = new AbortController();
  running = owner;
  lastAttemptAt = now;
  activeRun = run(owner, now);
}

async function run(owner: AbortController, now: number) {
  try {
    const status = await androidAutoExport.status();
    owner.signal.throwIfAborted();
    // A held notice waits for quiet hours to end, not for another backup.
    await reportFailure(status.lastFailureAt != null, now, status.lastFailureAt ?? undefined);
    if (status.lastFailureAt == null && prefs.lastExportFailureNotifiedAt != null) {
      await setPreferenceDurably('lastExportFailureNotifiedAt', null);
    }
    await syncFromFolder(status, owner.signal);
    owner.signal.throwIfAborted();
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
    owner.signal.throwIfAborted();
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
        watch: { signal: owner.signal },
        recordBackup: (at) => {
          if (owner.signal.aborted) return;
          prefs.lastBackupAt = at;
          prefs.backupNoticeDismissed = false;
        }
      }
    );

    if (owner.signal.aborted || result.outcome === 'cancelled' || result.outcome === 'ok' || result.outcome === 'staged') return;
    if (result.outcome === 'needs-destination') toast(m.exp_auto_reselect_needed());
    // Native delivery records its own timestamp. Use that same identity here
    // and on the next tick; packing failures have no native receipt.
    const failure = await androidAutoExport.status();
    await reportFailure(true, now,
      failure.lastFailureAt !== status.lastFailureAt ? failure.lastFailureAt ?? undefined : undefined);
  } catch (error) {
    if (owner.signal.aborted) return;
    console.error('scheduled auto-export failed', error);
    await reportFailure(true, now);
  } finally {
    if (running === owner) { running = null; activeRun = null; }
  }
}

const check = periodicCheck(() => void maybeRun());

export function startAutoExportScheduler() {
  if (isAndroid()) {
    lastAttemptAt = 0;
    check.start();
  }
}

export function stopAutoExportScheduler(): Promise<void> {
  check.stop();
  running?.abort();
  return activeRun ?? Promise.resolve();
}
