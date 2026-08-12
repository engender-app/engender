import { journal } from '$lib/data/live/journal.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { isAndroid } from '$lib/platform';
import { m } from '$lib/paraglide/messages';
import { androidAutoExport } from './android-auto-export-bridge';
import { isDue, runAndroidAutoExport } from './android-auto-export';

let active = false;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastAttemptAt = 0;

const CHECK_EVERY_MS = 15 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

async function maybeRun() {
  if (!active || running || !isAndroid()) return;

  const now = Date.now();
  if (now - lastAttemptAt < MIN_GAP_MS) return;

  const status = await androidAutoExport.status();
  if (!isDue(status, now)) return;

  const { password } = await androidAutoExport.revealPassword();
  if (!password) return;

  running = true;
  lastAttemptAt = now;
  try {
    const result = await runAndroidAutoExport(
      {
        snapshot: await journal.archive.snapshot(),
        preferences: prefs,
        password
      },
      {
        now: () => now,
        recordBackup: (at) => {
          prefs.lastBackupAt = at;
          prefs.backupNoticeDismissed = false;
        }
      },
      'scheduled'
    );

    if (result.outcome === 'ok') return;
    if (result.outcome === 'needs-destination') toast(m.exp_auto_reselect_needed());
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
