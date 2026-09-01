import { journal } from '$lib/data/live/journal.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { isAndroid } from '$lib/platform';
import { m } from '$lib/paraglide/messages';
/* Relative, not `$lib`: auto-export-scheduler.test.ts runs on the Node
   tier, where the alias does not resolve (ADR-0017), and this rule is pure
   enough that mocking it out would only hide what the notice actually says. */
import { notificationText } from '../../unprompted/notificationText';
import { androidAutoExport } from './android-auto-export-bridge';
import { isDue, runAndroidAutoExport } from './android-auto-export';
import { exportFailureNoticeStep } from './failureNotice';

let active = false;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastAttemptAt = 0;

const CHECK_EVERY_MS = 15 * 60 * 1000;
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
    quiet: { enabled: prefs.quietHoursEnabled, start: prefs.quietHoursStart, end: prefs.quietHoursEnd },
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
  if (!active || running || !isAndroid()) return;

  const now = Date.now();
  if (now - lastAttemptAt < MIN_GAP_MS) return;

  /* Before the due check, not after: a notice held from last week's failure
     is waiting on the window ending, not on the next backup being due. */
  await reportFailure(false, now);

  const status = await androidAutoExport.status();
  if (!isDue(status, now)) return;

  running = true;
  lastAttemptAt = now;
  try {
    const result = await runAndroidAutoExport(
      {
        snapshot: await journal.archive.snapshot(),
        preferences: prefs
      },
      {
        now: () => now,
        recordBackup: (at) => {
          prefs.lastBackupAt = at;
          prefs.backupNoticeDismissed = false;
        }
      }
    );

    if (result.outcome === 'ok') return;
    if (result.outcome === 'needs-destination') toast(m.exp_auto_reselect_needed());
    await reportFailure(true, now);
  } catch (error) {
    console.error('scheduled auto-export failed', error);
  } finally {
    running = false;
  }
}

export function startAutoExportScheduler() {
  if (active || !isAndroid()) return;
  active = true;
  void maybeRun();
  timer = setInterval(() => void maybeRun(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopAutoExportScheduler() {
  if (!active) return;
  active = false;
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (document.visibilityState === 'visible') void maybeRun();
}
