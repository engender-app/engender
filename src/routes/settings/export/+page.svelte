<script lang="ts">
  import { intlLocale } from '$lib/data/dates';
  import { m } from '$lib/paraglide/messages';
  import { runExport, type ExportPath } from '$lib/data/archive/backup';
  import { runAndroidAutoExport } from '$lib/data/archive/android-auto-export';
  import { androidAutoExport, type AutoExportStatus, type FolderSyncOutcome } from '$lib/data/archive/android-auto-export-bridge';
  import { backupAgeDays, backupStanding } from '$lib/data/backupHealth';
  import { preferencesAttached, prefs } from '$lib/data/prefs/store.svelte';
  import { disclose, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly, scrollBehavior } from '$lib/motion/tokens';
  import { archivePasswordProblem } from '$lib/data/archive/password';
  import { changeBackupPassword, checkBackupNow } from '$lib/data/archive/backup-password';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { exportFailureMessage, importFailureMessage, verifyFailureMessage } from '$lib/data/vocabulary/archiveErrorLabels';
  import type { PickedArchive } from '$lib/data/archive/pick';
  import {
    pickForRestore,
    restoreGuard,
    runRestore,
    runVerify,
    type RestoreFailureKind
  } from '$lib/data/journal/restoreFlow';
  import type { DaylioPreview } from '$lib/data/archive/daylio';
  import { DaylioBackupError, type DaylioBackupPreview, type DaylioSkipKind } from '$lib/data/archive/daylioBackup';
  import { normalizePhoto } from '$lib/data/photos/normalize';
  import { recognizeSource } from '$lib/data/archive/sources';
  import { IMPORT_FILE_SIZE_CEILING_BYTES, ZipTooLargeError } from '$lib/data/archive/zipReader';
  import type { ArchiveImportLogRecord } from '$lib/data/archive/payload';
  import { chooseFiles } from '$lib/data/fileDialog';
  import { dimensionName, moodName, tagLabel } from '$lib/data/vocabulary/labels';
  import { journal } from '$lib/data/live/journal.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Progress from '$lib/components/Progress.svelte';
  import { createProgress } from '$lib/components/progress.svelte';
  import type { RestoreProgress } from '$lib/data/journal/restore';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { rovingRadio } from '$lib/components/rovingRadio';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { isAndroid } from '$lib/platform';
  import { onMount } from 'svelte';
  import { periodicCheck } from '$lib/data/backgroundSchedulers';

  let android = $derived(isAndroid());
  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt));
  let standing = $derived(backupStanding(prefs.lastBackupAt));
  /* The last-backup mark comes and goes on this screen: a first export puts
     a tick where there was none, a fresh one replaces the stale mark. Both
     fade in place rather than cut in one frame. The leaving one is out of
     the accessibility tree from its first frame, so a screen reader never
     reads "Time for a new backup" beside "today" while it fades. */
  const markFade = (_node: Element) => fadeOnly(crossfadeDuration());
  const markLeave = (node: Element) => {
    node.setAttribute('aria-hidden', 'true');
    return fadeOnly(crossfadeDuration());
  };
  let verifiedAge = $derived(backupAgeDays(prefs.lastVerifiedAt));

  let expPass = $state('');
  let impPass = $state('');
  let impMode = $state<'merge' | 'replace'>('merge');
  /* Replace asks first (phase 15 release-blockers ticket 05). It used to
     run straight from the Import button with a muted note as its only
     warning, the one action in the app that throws a whole journal away
     on a single tap. Merge only adds, so it still runs at once. */
  let replaceSheet = $state(false);
  /* Set by the sheet's "Make a backup first" row, and read once the sheet
     has gone: the screen is locked while it is up, so the scroll to the
     export password has to wait for it to leave. */
  let backupAfterSheet = false;
  /* The erase sheet's backup row says the same (Settings), in the same
     words. */
  let backupLine = $derived(
    backupAge != null ? m.settings_backup_age({ days: m.n_days({ n: backupAge }) }) : m.settings_backup_none()
  );
  const IMPORT_MODES = [
    { value: 'merge', title: m.imp_mode_merge, sub: m.imp_merge_note },
    { value: 'replace', title: m.imp_mode_replace, sub: m.imp_mode_replace_sub }
  ] as const;
  let picked = $state<PickedArchive | null>(null);
  let importing = $state(false);
  let verifying = $state(false);
  let impError = $state('');
  /* Walkthrough handle for which catalogued sentence impError holds, so the
     suite can tell import failures apart without matching on the wording
     itself (ADR: the walkthrough grips handles, never wording). The kinds
     are restoreFlow.ts's, which is where the guards and the archive's own
     five now sit in one union; '' is this screen's "nothing has gone wrong
     yet" and belongs to the field rather than to the flow. */
  let impErrorKind = $state<RestoreFailureKind | ''>('');
  let plainSheet = $state<'csv' | 'json' | null>(null);
  let daylioSheet = $state(false);
  let daylioName = $state('');
  let daylioPreview = $state.raw<DaylioPreview | null>(null);
  let daylioError = $state('');
  let daylioImporting = $state(false);
  let backupSheet = $state(false);
  let backupName = $state('');
  let backupPreview = $state.raw<DaylioBackupPreview | null>(null);
  let backupError = $state('');
  let backupImporting = $state(false);
  let importLog = $state.raw<ArchiveImportLogRecord[]>([]);
  let exportWarningOpen = $state(false);
  /* Which export is under way, or null. Not a boolean: the encrypted
     button says what it is doing, and it is not encrypting when the CSV
     is what someone asked for. */
  let running = $state<ExportPath | null>(null);
  let autoDestination = $state<string | null>(null);
  let autoDestinationUri = $state<string | null>(null);
  let autoLastSuccessAt = $state<number | null>(null);
  let autoLastFailureAt = $state<number | null>(null);
  let autoLastFailureReason = $state<string | null>(null);
  let autoHasPassword = $state(false);
  let autoBusy = $state(false);

  /* Five bars for six operations (phase 9 audit ticket 11, ADR-0070).
     Import and verify share one because they share their two buttons and
     cannot run at once; everything else has its own place on the screen.
     Each carries a label beside it because these operations move between
     stages a percentage alone would not explain - "72%" of copying photos
     and "72%" of writing rows are the same number about different work. */
  const exportProgress = createProgress();
  let exportLabel = $state('');
  const autoProgress = createProgress();
  let autoLabel = $state('');
  const importProgress = createProgress();
  let importLabel = $state('');
  const daylioProgress = createProgress();
  const backupProgress = createProgress();
  let backupLabel = $state('');

  /** One restore's two stages as a sentence and a fraction, shared by the
      two operations that go through restore.ts with files to write. The
      first stage's wording is the caller's, because what arrives is not
      the same thing twice: an archive's photos are copied in, a Daylio
      backup's are re-encoded on the way (archive.ts). The second stage is
      rows either way, so it is not a parameter. */
  const restoreWatcher =
    (
      run: ReturnType<typeof createProgress>,
      setLabel: (label: string) => void,
      whileWritingFiles: () => string
    ) =>
    (progress: RestoreProgress) => {
      setLabel(progress.stage === 'files' ? whileWritingFiles() : m.imp_running_rows());
      run.report(progress.done, progress.total);
    };

  const done: Record<ExportPath, () => string> = {
    encrypted: m.exp_done_encrypted,
    csv: m.exp_done_csv,
    json: m.exp_done_json
  };

  /* The floor lives in archive/password.ts and the wording lives here:
     each caller has its own sentence for an empty field, and all of them
     share the journal passphrase's too-short line rather than inventing a
     second one (phase 5 security ticket 02). */
  function expPassRefusal(whenMissing: () => string): string | null {
    const problem = archivePasswordProblem(expPass);
    if (problem === null) return null;
    return problem === 'missing'
      ? whenMissing()
      : m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) });
  }

  function openExportWarning() {
    const refusal = expPassRefusal(m.exp_password_first);
    if (refusal) {
      toast(refusal);
      return;
    }
    exportWarningOpen = true;
  }

  function stampText(at: number | null): string {
    if (at == null) return m.exp_last_backup_never();
    return new Date(at).toLocaleString(intlLocale());
  }

  let autoSnapshotAt = $state<number | null>(null);
  let autoStagedAt = $state<number | null>(null);
  let autoDeferredAt = $state<number | null>(null);
  /* Folder sync (FA 49): this device's own switch, and how the last archive
     from another device ended. */
  let autoFolderSync = $state(false);
  let autoFolderOutcome = $state<FolderSyncOutcome | null>(null);
  let autoFolderAt = $state<number | null>(null);
  /* Which wording the line under the switch shows. Null until the first
     status read, so nothing is painted that the read then replaces. */
  let autoFolderLoaded = $state(false);
  const folderSyncState = $derived(
    !autoFolderLoaded ? null
      : autoFolderOutcome == null || autoFolderAt == null ? 'never'
      : autoFolderOutcome === 'merged' || autoFolderOutcome === 'wrong-password' ? autoFolderOutcome
      : 'failed'
  );
  const folderWhen = $derived(stampText(autoFolderAt));

  function applyAutoStatus(status: AutoExportStatus) {
    prefs.autoExportEnabled = status.enabled;
    prefs.autoExportSchedule = status.schedule;
    autoDestination = status.destinationLabel;
    autoDestinationUri = status.destinationUri;
    autoHasPassword = status.hasPassword;
    autoLastSuccessAt = status.lastSuccessAt;
    autoSnapshotAt = status.lastSnapshotAt ?? null;
    autoStagedAt = status.stagedSnapshotAt ?? null;
    autoDeferredAt = status.deferredAt ?? null;
    autoLastFailureAt = status.lastFailureAt;
    autoLastFailureReason = status.lastFailureReason;
    autoFolderSync = status.folderSync ?? false;
    autoFolderOutcome = status.folderLastOutcome ?? null;
    autoFolderAt = status.folderLastAt ?? null;
    autoFolderLoaded = true;
  }

  async function refreshAutoStatus() {
    if (!android) return;
    try {
      applyAutoStatus(await androidAutoExport.status());
    } catch (error) {
      console.error('could not read auto-export status', error);
      toast(m.exp_auto_config_failed());
    }
  }

  async function configureAutoExport(enabled: boolean, schedule: 'weekly' | 'monthly') {
    if (!android) return;
    autoBusy = true;
    try {
      const status = await androidAutoExport.configure({ enabled, schedule });
      applyAutoStatus(status);
      if (enabled && !status.enabled && !status.destinationUri) toast(m.exp_auto_pick_destination_first());
    } catch (error) {
      console.error('could not configure auto-export', error);
      toast(m.exp_auto_config_failed());
    } finally {
      autoBusy = false;
    }
  }

  /* The backup password is set and changed here and nowhere else (FA 56).
     It used to be taken from the export field by the switch and by "Back up
     now", silently, so a typo became the password of every later backup.
     Now it is typed twice in its own sheet and says when it has worked. */
  let passwordSheet = $state(false);
  let newBackupPass = $state('');
  let repeatBackupPass = $state('');
  let passwordError = $state('');
  let passwordErrorAt = $state<'new' | 'repeat' | null>(null);
  let passwordSaving = $state(false);
  /* Turning the schedule on with no password opens the sheet first, and the
     switch goes on only once a password is saved. */
  let enableAfterPassword = false;

  let sheetChanging = $state(false);

  function openPasswordSheet(enableAfter = false) {
    sheetChanging = autoHasPassword;
    newBackupPass = '';
    repeatBackupPass = '';
    passwordError = '';
    passwordErrorAt = null;
    enableAfterPassword = enableAfter;
    passwordSheet = true;
  }

  function clearPasswordError() {
    passwordError = '';
    passwordErrorAt = null;
  }

  async function saveBackupPassword(event: SubmitEvent) {
    event.preventDefault();
    if (passwordSaving) return;
    passwordSaving = true;
    try {
      const result = await changeBackupPassword(newBackupPass, repeatBackupPass);
      if (result !== 'saved') {
        passwordErrorAt = result === 'mismatch' ? 'repeat' : 'new';
        passwordError =
          result === 'missing'
            ? m.exp_password_first()
            : result === 'too-short'
              ? m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) })
              : m.exp_backup_password_mismatch();
        return;
      }
      autoHasPassword = true;
      passwordSheet = false;
      toast(sheetChanging ? m.exp_backup_password_changed_toast() : m.exp_backup_password_saved_toast());
      if (enableAfterPassword) {
        prefs.autoExportEnabled = true;
        await configureAutoExport(true, prefs.autoExportSchedule);
      }
    } catch (error) {
      console.error('could not store the backup password', error);
      passwordErrorAt = null;
      passwordError = m.exp_auto_config_failed();
    } finally {
      passwordSaving = false;
      enableAfterPassword = false;
    }
  }

  async function setAutoEnabled(enabled: boolean) {
    if (enabled && !autoHasPassword) {
      // The switch stays off until the sheet has a password behind it.
      prefs.autoExportEnabled = false;
      openPasswordSheet(true);
      return;
    }
    prefs.autoExportEnabled = enabled;
    await configureAutoExport(enabled, prefs.autoExportSchedule);
  }

  async function setFolderSync(enabled: boolean) {
    if (!android) return;
    autoFolderSync = enabled;
    try {
      applyAutoStatus(await androidAutoExport.configureFolderSync({ enabled }));
    } catch (error) {
      console.error('could not configure folder sync', error);
      autoFolderSync = !enabled;
      toast(m.exp_auto_config_failed());
    }
  }

  async function setAutoSchedule(value: string) {
    const schedule = value === 'monthly' ? 'monthly' : 'weekly';
    prefs.autoExportSchedule = schedule;
    await configureAutoExport(prefs.autoExportEnabled, schedule);
  }

  async function pickAutoDestination() {
    if (!android || autoBusy) return;
    autoBusy = true;
    try {
      const result = await androidAutoExport.pickDestination();
      if (!result.picked) return;
      await refreshAutoStatus();
      toast(m.exp_auto_destination_saved());
    } catch (error) {
      console.error('could not pick auto-export destination', error);
      toast(m.exp_auto_config_failed());
    } finally {
      autoBusy = false;
    }
  }

  /* Not autoBusy: the check is one bridge call, and a refusal would flash
     the button to "Backing up…" and back for a backup that never started. */
  let checkingPassword = false;

  async function backupNowToDestination() {
    if (!android || autoBusy || checkingPassword) return;
    checkingPassword = true;
    try {
      /* The saved password is what the backup is sealed with. A password in
         the export field is only compared with it: a mismatch is refused,
         never saved over it (FA 56). */
      const check = await checkBackupNow(expPass);
      if (!check.ok) {
        if (check.problem === 'no-password') openPasswordSheet();
        else toast(m.exp_backup_password_wrong(), { kind: 'failed' });
        return;
      }
    } catch (error) {
      console.error('could not check the backup password', error);
      toast(m.exp_auto_failed());
      return;
    } finally {
      checkingPassword = false;
    }

    autoBusy = true;
    /* Not exp_auto_running(): the button above already says that while it
       is disabled, and a bar repeating its button says nothing the button
       has not. It names the half that is running instead. */
    autoLabel = m.exp_running_packing();
    const stop = new AbortController();
    autoProgress.start({ onCancel: () => stop.abort() });
    try {
      const snapshot = await journal.archive.snapshot();
      const snapshotAt = Date.now();
      const result = await runAndroidAutoExport(
        {
          snapshot,
          snapshotAt,
          preferences: prefs
        },
        {
          recordBackup: (at) => {
            prefs.lastBackupAt = at;
            prefs.backupNoticeDismissed = false;
          },
          watch: {
            signal: stop.signal,
            onProgress: (done, total) => {
              /* The pack is the countable half. What follows it - base64
                 across the bridge and the SAF write of a multi-megabyte
                 archive - has no unit of work to report, so the bar goes
                 back to sweeping under a sentence that says which half
                 this is. Leaving it parked at 100% through the slower half
                 would be the bar lying, which is the whole thing ADR-0070
                 is about. */
              if (done === total) {
                autoLabel = m.exp_auto_running_writing();
                autoProgress.report(0, 0);
                return;
              }
              autoProgress.report(done, total);
            }
          }
        }
      );

      if (result.outcome === 'ok') {
        await autoProgress.finish();
        toast(m.exp_auto_saved_toast());
      } else if (result.outcome === 'needs-destination') {
        autoProgress.abandon();
        toast(m.exp_auto_reselect_needed());
      } else if (result.outcome === 'cancelled') {
        // Stopping is an answer, not a failure: nothing reached the folder.
        autoProgress.abandon();
        toast(m.exp_cancelled());
      } else if (result.outcome === 'staged') {
        autoProgress.abandon();
      } else {
        autoProgress.abandon();
        console.error('auto-export failed', result.reason);
        toast(m.exp_auto_failed());
      }
      await refreshAutoStatus();
    } catch (error) {
      autoProgress.abandon();
      console.error('auto-export failed', error);
      toast(m.exp_auto_failed());
    } finally {
      autoBusy = false;
    }
  }

  onMount(() => {
    const statusCheck = periodicCheck(() => void refreshAutoStatus());
    if (android) statusCheck.start();
    void refreshImportLog();
    return statusCheck.stop;
  });

  async function refreshImportLog() {
    importLog = await journal.archive.importLog();
  }

  /* Keyed by the registry's own source names (archive/sources.ts); a
     source not in this map falls back to its own key rather than going
     unlabelled, the same tolerance the counts below give an unknown
     kind. */
  const IMPORT_LOG_SOURCE_LABEL: Record<string, () => string> = {
    daylio: m.imp_log_source_daylio,
    'daylio-backup': m.imp_log_source_daylio_backup
  };

  const IMPORT_LOG_KIND_LABEL: Record<string, (n: number) => string> = {
    entries: (n) => m.imp_log_n_entries({ n }),
    tags: (n) => m.imp_log_n_tags({ n }),
    milestones: (n) => m.imp_log_n_milestones({ n }),
    attachments: (n) => m.imp_log_n_attachments({ n })
  };

  function importLogSourceLabel(source: string): string {
    return IMPORT_LOG_SOURCE_LABEL[source]?.() ?? source;
  }

  /* Zeros are left out rather than listed. The record keeps them - it is
     the whole answer to what an import did - but a line reading "3
     entries, 0 milestones, 0 tags, 0 photos and voice notes" spends four
     phrases saying one thing, and an import that added nothing at all says
     so in two words instead of four zeroes. */
  function importLogCountsText(counts: Record<string, number>): string {
    const listed = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([kind, n]) => IMPORT_LOG_KIND_LABEL[kind]?.(n) ?? `${n} ${kind}`);
    return listed.length > 0 ? listed.join(', ') : m.imp_log_nothing();
  }

  /* One function behind all three exports, so the backup timestamp is
     stamped once for every path there is (F21) rather than at three call
     sites where the next one added would forget.

     Deriving the archive key takes about a second by design (ADR-0013) and
     the photos are read one at a time after it, so this is the one button
     in the app that has to say it is working. */
  async function exportNow(path: ExportPath) {
    if (running) return;
    running = path;
    exportLabel = m.exp_running_packing();
    const stop = new AbortController();
    /* Cancellable on the encrypted path alone, and not because the other
       two are dangerous to stop - nothing an export does touches the
       journal (ADR-0070) - but because there is nothing there to stop.
       journalCsv and journalJson build one string before the body is ever
       pulled, so a stop button on them would refuse the only work they do
       after it was already done. */
    exportProgress.start(path === 'encrypted' ? { onCancel: () => stop.abort() } : undefined);
    try {
      // No "still opening" branch: a call through data/live's handle queues until
      // the database is open (ticket 08), and every screen reaches it that way.
      const delivery = await runExport(
        path,
        {
          snapshot: await journal.archive.snapshot(),
          preferences: prefs,
          password: expPass,
          // Built-ins are stored as keys and worded at display time
          // (labels.ts), and a CSV is read by a person.
          naming: { dimensionName, tagLabel }
        },
        {
          recordBackup: (at) => {
            prefs.lastBackupAt = at;
            // The journal is freshly backed up, so the Home notice starts
            // over: dismissing it once does not silence it forever.
            prefs.backupNoticeDismissed = false;
          },
          watch: { signal: stop.signal, onProgress: (done, total) => exportProgress.report(done, total) }
        }
      );

      if (delivery === 'cancelled') {
        exportProgress.abandon();
        toast(m.exp_cancelled());
        return;
      }
      // Before the toast, so the bar finishes its sentence rather than
      // being talked over by the answer (ADR-0070).
      await exportProgress.finish();
      const what = done[path]();
      toast(delivery === 'shared' ? m.exp_done_shared({ what }) : m.exp_done_downloaded({ what }));
    } catch (error) {
      exportProgress.abandon();
      if (stop.signal.aborted) {
        toast(m.exp_cancelled());
        return;
      }
      console.error(`the ${path} export failed`, error);
      toast(exportFailureMessage(error));
    } finally {
      running = null;
    }
  }

  function confirmExport() {
    exportWarningOpen = false;
    exportNow('encrypted');
  }

  /* The plain export happens here and nowhere else: the two buttons on the
     screen only open the warning, so there is no path to an unencrypted
     copy of someone's journal that has not been through it (F22). */
  function confirmPlain() {
    const path = plainSheet;
    plainSheet = null;
    if (path) exportNow(path);
  }

  async function choose() {
    try {
      const chosen = await pickForRestore();
      if (!chosen) return; // backed out
      if ('ok' in chosen) {
        impErrorKind = chosen.kind;
        impError = importFailureMessage(chosen.kind);
        return;
      }
      picked = chosen.picked;
      impError = '';
      impErrorKind = '';
    } catch {
      toast(m.imp_picker_failed());
    }
  }

  /* A missing file or password is refused before anything asks: a sheet
     asking whether to replace the journal, only to say afterwards that no
     file was chosen, has the order backwards. */
  function requestImport() {
    if (impMode === 'replace' && restoreGuard(picked, impPass) === null) replaceSheet = true;
    else void doImport();
  }

  function confirmReplace() {
    replaceSheet = false;
    void doImport();
  }

  function backUpFirst() {
    backupAfterSheet = true;
    replaceSheet = false;
  }

  /* Down to the export password, which is where a backup starts, and into
     it, so the next thing typed is that password. */
  function afterReplaceSheet() {
    if (!backupAfterSheet) return;
    backupAfterSheet = false;
    const field = document.getElementById('exp-pass');
    if (!field) return;
    field.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    field.focus({ preventScroll: true });
  }

  /* The import, run by restoreFlow.ts so the welcome step's restore and this
     one are the same act (ticket 36). What is left here is what this screen
     says about it. */
  async function doImport() {
    impError = '';
    impErrorKind = '';
    importing = true;
    /* No stop button, on either mode (ADR-0070): Replace discards this
       device's journal before installing the archive's and Merge writes as
       it reads, so an abort part way through has no defined rollback
       anywhere in the code. The bar says how far along it is and nothing
       else. */
    importLabel = m.imp_running_files();
    importProgress.start();
    const onProgress = restoreWatcher(importProgress, (label) => (importLabel = label), m.imp_running_files);
    const result = await runRestore(picked, impPass, impMode, onProgress);
    if (result.ok) {
      await importProgress.finish();
      toast(impMode === 'replace' ? m.imp_replaced_toast() : m.imp_merged_toast());
    } else {
      importProgress.abandon();
      impErrorKind = result.kind;
      impError = importFailureMessage(result.kind);
    }
    importing = false;
  }

  /* The backup health drill (ticket 28): the same picked file and password
     as import, but only decrypting, parsing and validating it - nothing here
     is written to. */
  async function doVerify() {
    impError = '';
    impErrorKind = '';
    verifying = true;
    // Not cancellable either, though nothing is written: a half-drained
    // archive proves nothing, and a drill that can be stopped early is a
    // drill somebody can believe they passed (ADR-0070).
    importLabel = m.verify_running_files();
    importProgress.start();
    const result = await runVerify(picked, impPass, (done, total) => importProgress.report(done, total));
    if (result.ok) {
      await importProgress.finish();
      prefs.lastVerifiedAt = Date.now();
      toast(m.verify_ok_toast());
    } else {
      importProgress.abandon();
      impErrorKind = result.kind;
      impError = verifyFailureMessage(result.kind);
    }
    verifying = false;
  }

  function openDaylio() {
    daylioName = '';
    daylioPreview = null;
    daylioError = '';
    daylioSheet = true;
  }

  async function chooseDaylio() {
    try {
      const [file] = await chooseFiles('.csv,text/csv');
      if (!file) return;
      daylioName = file.name;
      daylioPreview = null;
      daylioError = '';
      const { tagLabels } = await import('$lib/data/vocabulary/import-labels');
      daylioPreview = await journal.archive.previewDaylioImport(await file.text(), { tagLabels });
      if (daylioPreview.unmappedMoodLabels.length > 0) {
        daylioError = m.daylio_unmapped({ labels: daylioPreview.unmappedMoodLabels.join(', ') });
      }
    } catch (error) {
      console.error('the Daylio preview failed', error);
      daylioPreview = null;
      // Same rule as importFailure: the parse detail is a console diagnostic.
      daylioError = m.daylio_unreadable();
    }
  }

  async function importDaylio() {
    if (!daylioPreview || daylioPreview.unmappedMoodLabels.length > 0 || daylioImporting) return;
    daylioImporting = true;
    daylioError = '';
    /* A CSV export carries no photos, so this is one stage and one label
       and it may well finish inside the bar's show delay - which is the
       case that delay is for (ADR-0070). */
    daylioProgress.start();
    try {
      const result = await journal.archive.commitDaylioImport(daylioPreview, (progress) =>
        daylioProgress.report(progress.done, progress.total)
      );
      // Before the sheet closes, so the bar is not cut off by the sheet it
      // is sitting in going away.
      await daylioProgress.finish();
      daylioSheet = false;
      toast(m.daylio_imported_toast({ entries: String(result.entriesAdded), tags: String(result.tagsAdded) }));
      void refreshImportLog();
    } catch (error) {
      daylioProgress.abandon();
      console.error('the Daylio import failed', error);
      daylioError = m.daylio_failed();
    } finally {
      daylioImporting = false;
    }
  }

  /* The backup import, beside the CSV one above and deliberately not folded
     into it: the two files carry different things, and somebody holding a
     CSV export has a CSV export (phase 7 ticket 09). */

  function openBackup() {
    backupName = '';
    backupPreview = null;
    backupError = '';
    backupSheet = true;
  }

  /** What the preview counts, in the order the sheet lists them. Rows with
      nothing in them are not rendered: at 390px, a row per collection
      whether or not the file held any is a wall to read past, and every
      line left standing is work the commit will really do. */
  const arrivingRows = (preview: DaylioBackupPreview): { label: string; value: string }[] =>
    [
      { label: m.dlb_entries(), count: preview.entryCount, value: String(preview.entryCount) },
      { label: m.dlb_milestones(), count: preview.milestoneCount, value: String(preview.milestoneCount) },
      {
        /* Counted on the new tags alone, though it reports both: a matched
           tag is one this journal already has, so a file whose every
           activity is already a tag here is adding nothing and this row
           would otherwise be the only thing standing under "Arriving". */
        label: m.dlb_tags(),
        count: preview.newTagCount,
        value: m.dlb_tag_counts({ matched: String(preview.matchedTagCount), new: String(preview.newTagCount) })
      },
      { label: m.dlb_scales(), count: preview.dimensionCount, value: String(preview.dimensionCount) },
      { label: m.dlb_templates(), count: preview.templateCount, value: String(preview.templateCount) },
      {
        label: m.dlb_attachments(),
        count: preview.photoCount + preview.audioCount,
        value: String(preview.photoCount + preview.audioCount)
      }
    ].filter((row) => row.count > 0);

  const SKIP_LABELS: Record<DaylioSkipKind, () => string> = {
    goals: m.dlb_skip_goals,
    statistics: m.dlb_skip_statistics,
    achievements: m.dlb_skip_achievements,
    preferences: m.dlb_skip_preferences,
    reminders: m.dlb_skip_reminders,
    icons: m.dlb_skip_icons,
    anniversaries: m.dlb_skip_anniversaries,
    scales: m.dlb_skip_scales,
    assets: m.dlb_skip_assets,
    unnamed: m.dlb_skip_unnamed
  };

  const nothingArriving = (preview: DaylioBackupPreview): boolean => arrivingRows(preview).length === 0;

  async function chooseBackup() {
    try {
      // Some Android file providers type a .daylio file as
      // application/octet-stream rather than zip, and Capacitor's picker
      // greys out a file that matches no accept entry at all (ticket 66) -
      // application/zip alone made that file unselectable.
      const [file] = await chooseFiles('.daylio,application/zip,application/octet-stream');
      if (!file) return;
      backupName = file.name;
      backupPreview = null;
      backupError = '';

      // Checked before the file is buffered at all: a corrupted or hostile
      // member's declared size is zipReader.ts's job, but the file's own
      // size on disk is cheaper to refuse before a single byte is read.
      if (file.size === 0) {
        backupError = m.dlb_file_empty();
        return;
      }
      if (file.size > IMPORT_FILE_SIZE_CEILING_BYTES) {
        backupError = m.dlb_file_too_large();
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      // A CSV handed to the backup row is a mistake worth naming, since the
      // row that reads it is one screen away (archive/sources.ts).
      if (recognizeSource(bytes)?.name === 'daylio') {
        backupError = m.dlb_is_csv();
        return;
      }

      const { tagLabels } = await import('$lib/data/vocabulary/import-labels');
      backupPreview = await journal.archive.previewDaylioBackupImport(bytes, { tagLabels });
      if (backupPreview.unmappedMoodNames.length > 0) {
        backupError = m.dlb_unmapped({ names: backupPreview.unmappedMoodNames.join(', ') });
      }
    } catch (error) {
      console.error('the Daylio backup preview failed', error);
      backupPreview = null;
      /* The parse detail is a console diagnostic, like importFailure's,
         and the error's own `kind` is what this branches on. One kind gets
         its own sentence: an iPhone backup is a different schema rather
         than a damaged file, and telling somebody their file is unreadable
         when the real answer is "not this platform" sends them looking for
         a fix that does not exist. A ceiling refusal is its own case too,
         ahead of the rest: it isn't a corrupt container. */
      if (error instanceof ZipTooLargeError) {
        backupError = m.dlb_too_large();
      } else if (error instanceof DaylioBackupError && error.kind === 'platform') {
        backupError = m.dlb_not_android();
      } else {
        backupError = m.dlb_unreadable();
      }
    }
  }

  async function importBackup() {
    if (!backupPreview || backupPreview.unmappedMoodNames.length > 0 || backupImporting) return;
    backupImporting = true;
    backupError = '';
    backupLabel = m.dlb_running_assets();
    backupProgress.start();
    try {
      // Its own first-stage wording, because the backup re-encodes every
      // photo it carries rather than just writing it (archive.ts).
      const result = await journal.archive.commitDaylioBackupImport(
        backupPreview,
        normalizePhoto,
        restoreWatcher(backupProgress, (label) => (backupLabel = label), m.dlb_running_assets)
      );
      await backupProgress.finish();
      backupSheet = false;
      await refreshImportLog();
      toast(
        m.dlb_imported_toast({
          entries: String(result.entriesAdded),
          milestones: String(result.milestonesAdded),
          attachments: String(result.attachmentsAdded)
        })
      );
    } catch (error) {
      backupProgress.abandon();
      console.error('the Daylio backup import failed', error);
      backupError = m.dlb_failed();
    } finally {
      backupImporting = false;
    }
  }

</script>

<div class="screen">
  <ScreenHeader title={m.exp_title()} back="/settings" />

  <!-- Both ages are preferences outside the boot set, so on a cold
       navigation straight here they read null until SQLite opens: the card
       said "never" with a tick for a persona backed up 34 days ago, then
       lost a line and shoved everything under it up 19px in one frame
       (ticket 176). The rows stand from the first frame and only their
       values wait, a one-line bar in each, so a one-line age lands without
       moving anything; the two-line "never" grows the card through
       `resize`. -->
  <div class="kit-panel" data-kit-surface style="margin-bottom:var(--space-4)" use:resize>
    <div class="spread">
      <span class="kit-row-text">
        <span class="kit-row-title">{m.exp_last_backup()}</span>
        <!-- Handle for the walkthrough, like data-plain on the export buttons:
             the backup age is what the plain-export flow checks moved to today,
             and reaching it by layout broke silently once this card grew rows. -->
        <span class="kit-row-sub" data-backup-age>
          {#if !preferencesAttached()}
            {@render pendingValue()}
          {:else}
            {backupAge == null
              ? m.exp_last_backup_never()
              : backupAge === 0
                ? m.exp_last_backup_today()
                : m.exp_last_backup_days({ days: m.n_days({ n: backupAge }) })}
          {/if}
        </span>
      </span>
      <!-- One slot that is always there, so a mark arriving or leaving never
           moves the row; the two marks share its cell while they cross. -->
      <span class="backup-mark-slot">
        {#if !preferencesAttached()}
          <!-- Neither mark until the age is known: the tick was the half of the
               wrong answer that looked most sure of itself. -->
        {:else if standing === 'stale'}
          <!-- The age beside it already says how long ago; the mark only says
               that it is long enough to act on. It used to be a badge reading
               "Over 30 days ago" under "34 days ago" (audit UX-11). -->
          <span class="notice-warn backup-stale-mark" data-backup-stale role="img" aria-label={m.exp_stale_mark_aria()} in:markFade out:markLeave><Icon name="alert" size={18} /></span>
        {:else if standing === 'recent'}
          <span class="backup-tick" data-backup-tick in:markFade out:markLeave><Icon name="check" size={20} /></span>
        {/if}
        <!-- Never exported draws no mark: the tick stood beside "No export
             recorded on this device" because that journal is not stale either
             (last-audit UI 54). -->
      </span>
    </div>
    <div class="hr" style="margin:var(--space-3) 0"></div>
    <div class="spread">
      <span class="kit-row-text">
        <span class="kit-row-title">{m.exp_last_verified()}</span>
        <span class="kit-row-sub">
          {#if !preferencesAttached()}
            {@render pendingValue()}
          {:else}
            {verifiedAge == null
              ? m.exp_last_verified_never()
              : verifiedAge === 0
                ? m.exp_last_verified_today()
                : m.exp_last_verified_days({ days: m.n_days({ n: verifiedAge }) })}
          {/if}
        </span>
      </span>
      <Icon name="shield" size={20} />
    </div>
  </div>

  {#snippet pendingValue()}
    <!-- The kit's own skeleton bar, held to the subtitle's line box (12px bar,
         4px either side) so the value that replaces it takes the same height. -->
    <span class="skeleton skeleton-line is-short" style="margin:4px 0" aria-hidden="true"></span>
  {/snippet}

  {#if importLog.length > 0}
    <SectionHeading text={m.imp_log_section()} />
    <!-- The card is gone, so the hairline a list begins and ends with
         (DIRECTION.md rule 4) is the list card's own, and the separator
         between two rows is `.kit-row + .kit-row`'s rather than an `.hr`
         written out per row. -->
    <ListCard>
      {#each importLog as record (record.id)}
        <ListRow
          static
          data-import-log-row
          title={importLogSourceLabel(record.source)}
          subtitle={m.imp_log_row_sub({ counts: importLogCountsText(record.counts), when: stampText(record.importedAt) })}
        />
      {/each}
    </ListCard>
  {/if}

  <SectionHeading text={m.exp_encrypted_section()} />
  <p class="small" style="margin-bottom:var(--space-3)">{m.exp_encrypted_body()}</p>
  <!-- autocomplete off here and on import: an archive's password is not
       this site's login, and a password manager should not offer to save
       it as one (after-release 21, audit A11Y-16). -->
  <Field label={m.exp_password_label()} id="exp-pass">
    {#snippet children(id)}
      <input class="input" type="password" {id} name="exp-pass" placeholder={m.exp_password_placeholder()}
        autocomplete="off" bind:value={expPass} />
    {/snippet}
  </Field>
  <button class="btn btn-primary" data-export onclick={openExportWarning} disabled={running !== null}>
    <Icon name={android ? 'share' : 'download'} size={20} />
    <span>{running === 'encrypted' ? m.exp_running() : android ? m.exp_run_share() : m.exp_run_download()}</span>
  </button>
  <!-- The encrypted path only. journalCsv and journalJson build their
       whole string synchronously before the body is ever pulled, so
       there is nothing for a bar to count and, worse, nothing for it to
       paint: the show-delay timer cannot fire inside a block that never
       yields, so a bar there would appear only once the work it was
       reporting had finished. The two plain buttons stay disabled and
       say so, which is the honest amount this screen knows about them. -->
  {#if running === 'encrypted'}
    <Progress run={exportProgress} label={exportLabel} handle="export" />
  {/if}

  {#if android}
    <!-- The card had been the only thing saying where this area began, and
         it follows another area rather than the screen's own header, so
         unboxed it needs the heading (rule 4, and the entry editor's
         precedent). The switch row's title moves up into it rather than
         being said twice; the switch keeps it as its accessible name. -->
    <SectionHeading text={m.exp_auto_title()} />
    <div class="spread">
      <span class="small muted">{m.exp_auto_sub()}</span>
      <Switch checked={prefs.autoExportEnabled} label={m.exp_auto_title()}
        onChange={setAutoEnabled} />
    </div>

    <div class="spread">
      <span class="small muted">{m.exp_auto_destination_label()}</span>
      <button class="btn btn-soft" type="button" onclick={pickAutoDestination} disabled={autoBusy}>
        <span>{autoDestinationUri ? m.exp_auto_change_destination() : m.exp_auto_choose_destination()}</span>
      </button>
    </div>
    <p class="muted small">
      {m.exp_auto_destination_note()}
    </p>
    <p class="muted small">
      {autoDestination ?? (autoDestinationUri ? m.exp_auto_destination_chosen() : m.exp_auto_destination_missing())}
    </p>

    <!-- The backup password's own row (FA 56): the one place it is set or
         changed. Both wordings of the button and of the line under it are
         always laid out in one grid cell and only their opacity moves, so
         the row keeps its size when a password is first saved. -->
    <div class="spread" data-backup-password-row>
      <span class="small muted">{m.exp_backup_password_label()}</span>
      <button class="btn btn-soft" type="button" onclick={() => openPasswordSheet()} disabled={autoBusy}
        data-change-backup-password>
        <span class="swap">
          <span class:is-on={!autoHasPassword} aria-hidden={autoHasPassword}>{m.exp_backup_password_set()}</span>
          <span class:is-on={autoHasPassword} aria-hidden={!autoHasPassword}>{m.exp_backup_password_change()}</span>
        </span>
      </button>
    </div>
    <p class="muted small swap" data-backup-password-state={autoHasPassword ? 'saved' : 'missing'}>
      <span class:is-on={autoHasPassword} aria-hidden={!autoHasPassword}>{m.exp_auto_password_saved()}</span>
      <span class:is-on={!autoHasPassword} aria-hidden={autoHasPassword}>{m.exp_auto_password_missing()}</span>
    </p>

    <!-- Folder sync (FA 49): the folder above, read back. Always laid out,
         so switching it moves nothing on the screen. -->
    <div class="spread" data-folder-sync-row>
      <span class="small muted">{m.exp_folder_title()}</span>
      <Switch checked={autoFolderSync} label={m.exp_folder_title()} onChange={setFolderSync} />
    </div>
    <p class="muted small">{m.exp_folder_note()}</p>
    <!-- Every wording laid out in one cell and crossfaded, so the first
         status read and a later outcome change no height and swap no text
         in a frame (the backup password line's own pattern). -->
    <p class="muted small swap" data-folder-sync-state={folderSyncState ?? 'loading'}>
      <span class:is-on={folderSyncState === 'never'} aria-hidden={folderSyncState !== 'never'}>{m.exp_folder_never()}</span>
      <span class:is-on={folderSyncState === 'merged'} aria-hidden={folderSyncState !== 'merged'}>{m.exp_folder_last_merged({ when: folderWhen })}</span>
      <span class:is-on={folderSyncState === 'wrong-password'} aria-hidden={folderSyncState !== 'wrong-password'}>{m.exp_folder_last_wrong_password({ when: folderWhen })}</span>
      <span class:is-on={folderSyncState === 'failed'} aria-hidden={folderSyncState !== 'failed'}>{m.exp_folder_last_failed({ when: folderWhen })}</span>
    </p>

    {#if prefs.autoExportEnabled}
      <div class="spread">
        <span class="small muted">{m.exp_schedule()}</span>
        <Segmented name={m.exp_schedule()}
          options={[{ value: 'weekly', label: m.exp_schedule_weekly() }, { value: 'monthly', label: m.exp_schedule_monthly() }]}
          value={prefs.autoExportSchedule}
          onChange={setAutoSchedule} />
      </div>

      <button class="btn btn-soft" type="button"
        onclick={backupNowToDestination} disabled={autoBusy}>
        <span>{autoBusy ? m.exp_auto_running() : m.exp_auto_backup_now()}</span>
      </button>
      <Progress run={autoProgress} label={autoLabel} handle="auto-export" />
    {/if}

    <div role="status" aria-live="polite" aria-atomic="true" data-auto-backup-status>
      <p class="muted small">
        {m.exp_auto_last_success({ when: stampText(autoLastSuccessAt) })}
      </p>
      {#if autoSnapshotAt != null}
        <p class="small muted">{m.exp_auto_snapshot({ when: stampText(autoSnapshotAt) })}</p>
      {/if}
      {#if autoDeferredAt != null}
        <p class="small muted">{m.exp_auto_deferred()}</p>
      {:else if autoStagedAt != null}
        <p class="small muted">{m.exp_auto_staged({ when: stampText(autoStagedAt) })}</p>
      {/if}
      <p class="small muted">
        {m.exp_auto_native_limits()}
      </p>
      {#if autoLastFailureAt !== null}
        <p class="muted small">
          {m.exp_auto_last_failure({ when: stampText(autoLastFailureAt) })}
        </p>
        {#if autoLastFailureReason}
          <p class="muted small">{m.exp_auto_failed()}</p>
        {/if}
      {/if}
    </div>
  {/if}

  <SectionHeading text={m.imp_section()} />
  <Field label={m.imp_file_label()} legend>
    {#snippet children()}
      <button class="input" style="text-align:left;color:var(--text-2)" data-pick-file onclick={choose}>
        <Icon name="upload" size={18} />
        <span id="picked-file" style={picked ? 'color:var(--text)' : ''}>
          {picked ? picked.name : m.imp_file_placeholder()}
        </span>
      </button>
    {/snippet}
  </Field>
  <Field label={m.exp_password_label()} id="imp-pass">
    {#snippet children(id)}
      <input class="input" type="password" {id} name="imp-pass" autocomplete="off"
        placeholder={m.imp_password_placeholder()} bind:value={impPass} />
    {/snippet}
  </Field>
  <!-- Two rows with what each one does, not a Segmented: "Replace this
       journal" was cut to "Replace this journa" at 390px, the destructive
       choice the one clipped, and a choice this heavy wants its
       consequence beside it rather than in a note that changes under it.
       LockAfterChoice's shape: every row carries its check, and only the
       chosen one shows it, so a pick fades the mark across. -->
  <Field label={m.imp_how_label()} legend>
    {#snippet children(id)}
      <div role="radiogroup" tabindex="-1" aria-labelledby={id} use:rovingRadio data-import-modes>
        <ListCard>
          {#each IMPORT_MODES as mode (mode.value)}
            <ListRow
              key={`import-${mode.value}`}
              title={mode.title()}
              subtitle={mode.sub()}
              chevron={false}
              role="radio"
              aria-checked={impMode === mode.value}
              data-import-mode={mode.value}
              onclick={() => (impMode = mode.value)}
            >
              {#snippet trailing()}
                <span class="mode-mark" class:is-on={impMode === mode.value} aria-hidden="true">
                  <Icon name="check" size={20} />
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {/snippet}
  </Field>
  {#if impError}
    <div class="notice notice-danger" style="margin-bottom:var(--space-3)" role="alert" data-import-error={impErrorKind}>
      <Icon name="alert" size={20} />
      <div class="notice-body">{impError}</div>
    </div>
  {/if}
  <!-- Stacked, each the column's width: side by side at 390px both labels
       broke onto two lines. Import is the block, the act this section is
       for; checking a backup is the lighter one under it. -->
  <div class="stack-3">
    <button class="btn btn-soft btn-block" data-import onclick={requestImport} disabled={importing || verifying}>
      <span>{importing ? m.imp_running() : m.imp_run()}</span>
    </button>
    <button class="btn btn-ghost btn-block" data-verify onclick={doVerify} disabled={importing || verifying}>
      <Icon name="shield" size={18} />
      <span>{verifying ? m.verify_running() : m.verify_run()}</span>
    </button>
  </div>
  <!-- One bar for the two buttons above it: they are disabled by each
       other, so only one of them is ever running. -->
  <Progress run={importProgress} label={importLabel} handle="import" />
  <!-- Two entries of one list: the hairlines the list card draws are what
       separates them and what says where they begin and end, so the tonal
       ground each row used to carry is gone (Alicja, 2026-09-09: "the list
       entries have both the bg and the line separators - lose the bg"). The
       `.hr` that used to sit above them was doing the list card's job. -->
  <div data-import-rows>
    <ListCard>
      <ListRow
        icon="book"
        title={m.daylio_row_title()}
        subtitle={m.daylio_row_sub()}
        onclick={openDaylio}
        data-daylio
      />
      <ListRow
        icon="package"
        title={m.dlb_row_title()}
        subtitle={m.dlb_row_sub()}
        onclick={openBackup}
        data-daylio-backup
      />
    </ListCard>
  </div>

  <SectionHeading text={m.plain_section()} />
  <p class="small" style="margin-bottom:var(--space-3)">{m.plain_body()}</p>
  <div class="spread">
    <button class="btn btn-soft" data-plain="csv" disabled={running !== null} onclick={() => (plainSheet = 'csv')}><span>{m.plain_csv()}</span></button>
    <button class="btn btn-soft" data-plain="json" disabled={running !== null} onclick={() => (plainSheet = 'json')}><span>{m.plain_json()}</span></button>
  </div>

  <Sheet open={exportWarningOpen} title={m.exp_warning_sheet()} onClose={() => (exportWarningOpen = false)}>
    <h3>{m.exp_warning_title()}</h3>
    <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
      <Icon name="alert" size={20} />
      <div class="notice-body">
        {m.exp_warning_body()}
      </div>
    </div>
    <div class="stack-3">
      <button class="btn btn-danger" data-confirm-export onclick={confirmExport}>
        <span>{m.exp_warning_confirm()}</span>
      </button>
      <button class="btn btn-ghost" onclick={() => (exportWarningOpen = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>

  <!-- Typed twice, and it says when it worked (FA 56). The wording is fixed
       when the sheet opens, so saving a first password does not rewrite the
       title of a sheet that is on its way out. -->
  <Sheet bind:open={passwordSheet} title={sheetChanging ? m.exp_backup_password_change_title() : m.exp_backup_password_set_title()}>
    <h3>{sheetChanging ? m.exp_backup_password_change_title() : m.exp_backup_password_set_title()}</h3>
    <p class="small" style="margin-bottom:var(--space-4)">
      {sheetChanging ? m.exp_backup_password_change_body() : m.exp_backup_password_set_body()}
    </p>
    <form onsubmit={saveBackupPassword} data-backup-password-form>
      <Field label={m.exp_backup_password_new()}>
        {#snippet children(id)}
          <input class="input" type="password" {id} name="new-backup-password" autocomplete="off"
            bind:value={newBackupPass} oninput={clearPasswordError} readonly={passwordSaving}
            aria-invalid={passwordErrorAt === 'new'}
            aria-describedby={passwordErrorAt === 'new' ? 'backup-password-error' : undefined}
            data-new-backup-password />
        {/snippet}
      </Field>
      <Field label={m.exp_backup_password_repeat()}>
        {#snippet children(id)}
          <input class="input" type="password" {id} name="repeat-backup-password" autocomplete="off"
            bind:value={repeatBackupPass} oninput={clearPasswordError} readonly={passwordSaving}
            aria-invalid={passwordErrorAt === 'repeat'}
            aria-describedby={passwordErrorAt === 'repeat' ? 'backup-password-error' : undefined}
            data-repeat-backup-password />
        {/snippet}
      </Field>
      <!-- Opens its own height rather than pushing the buttons down in one
           frame, and closes again as soon as either field is edited. -->
      {#if passwordError}
        <p class="small backup-password-error" role="alert" id="backup-password-error" data-backup-password-error transition:disclose>{passwordError}</p>
      {/if}
      <div class="stack-3">
        <button class="btn btn-primary" type="submit" disabled={passwordSaving} data-save-backup-password>
          <span>{m.exp_backup_password_save()}</span>
        </button>
        <button class="btn btn-ghost" type="button" onclick={() => (passwordSheet = false)}><span>{m.cancel()}</span></button>
      </div>
    </form>
  </Sheet>

  <Sheet open={plainSheet !== null} title={m.plain_section()} onClose={() => (plainSheet = null)}>
    {#if plainSheet}
      <h3>{m.plain_sheet_title({ format: plainSheet.toUpperCase() })}</h3>
      <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
        <Icon name="alert" size={20} />
        <div class="notice-body">
          <span class="notice-title">{m.plain_notice_title()}</span>
          {m.plain_notice_body()}
        </div>
      </div>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-plain onclick={confirmPlain}>
          <span>{m.plain_confirm({ format: plainSheet.toUpperCase() })}</span>
        </button>
        <button class="btn btn-ghost" onclick={() => (plainSheet = null)}><span>{m.cancel()}</span></button>
      </div>
    {/if}
  </Sheet>

  <!-- The erase sheet's shape (Settings, phase 14 pre-release 15): the loss
       first, then the way to keep a copy with how old the last one is, then
       the act in danger red and the way out. -->
  <Sheet bind:open={replaceSheet} title={m.imp_replace_sheet_title()} onClosed={afterReplaceSheet}>
    <h3>{m.imp_replace_sheet_title()}</h3>
    <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
      <Icon name="alert" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.erase_no_undo()}</span>
        {m.imp_replace_note()}
      </div>
    </div>
    <ListCard>
      <ListRow
        key="replace-backup"
        icon="download"
        title={m.erase_backup_first()}
        subtitle={backupLine}
        chevron={false}
        onclick={backUpFirst}
      />
    </ListCard>
    <div class="stack-3" style="margin-top:var(--space-4)">
      <button class="btn btn-danger" data-confirm-replace onclick={confirmReplace}>
        <span>{m.imp_replace_confirm()}</span>
      </button>
      <button class="btn btn-ghost" data-keep-journal onclick={() => (replaceSheet = false)}>
        <span>{m.erase_keep()}</span>
      </button>
    </div>
  </Sheet>

  <Sheet bind:open={daylioSheet} title={m.daylio_sheet_title()}>
    <h3>{m.daylio_sheet_title()}</h3>
    <Field label={m.daylio_file_label()} legend>
      {#snippet children()}
        <button class="input" style="text-align:left;color:var(--text-2)" data-pick-daylio onclick={chooseDaylio}>
          <Icon name="upload" size={18} />
          <span style={daylioName ? 'color:var(--text)' : ''}>
            {daylioName || m.daylio_file_placeholder()}
          </span>
        </button>
      {/snippet}
    </Field>
    {#if daylioError}
      <div class="notice notice-danger" style="margin-bottom:var(--space-4)" role="alert">
        <Icon name="alert" size={20} />
        <div class="notice-body">{daylioError}</div>
      </div>
    {/if}
    {#if daylioPreview}
      <div class="kit-panel" data-kit-surface style="margin-bottom:var(--space-4)">
        <div class="rows-divide value-row"><span>{m.daylio_entries_to_add()}</span><strong>{daylioPreview.entryCount}</strong></div>
        <div class="rows-divide value-row">
          <span>{m.daylio_activities_to_tags()}</span>
          <strong>{m.daylio_tag_counts({ matched: String(daylioPreview.matchedTagCount), new: String(daylioPreview.newTagCount) })}</strong>
        </div>
        <div class="rows-divide value-row"><span>{m.daylio_notes_row()}</span><strong>{m.daylio_notes_kept()}</strong></div>
        <div class="rows-divide value-row"><span>{m.daylio_photos_row()}</span><strong>{m.daylio_photos_absent()}</strong></div>
        <div class="hr"></div>
        <p class="small" style="margin-bottom:var(--space-2)"><strong>{m.daylio_mood_mapping()}</strong></p>
        {#if daylioPreview.moodMappings.length > 0}
          {#each daylioPreview.moodMappings as mapping (mapping.label)}
            <div class="rows-divide value-row">
              <span>{mapping.label}</span>
              <strong>{mapping.mood === null ? m.daylio_mood_unmapped() : `${mapping.mood} · ${moodName(mapping.mood)}`}</strong>
            </div>
          {/each}
        {:else}
          <p class="muted small">{m.daylio_no_moods()}</p>
        {/if}
      </div>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.daylio_always_merge()}</p>
    {/if}
    <div class="stack-3">
      {#if daylioPreview}
        <button class="btn btn-primary" data-confirm-daylio onclick={importDaylio}
          disabled={daylioPreview.unmappedMoodLabels.length > 0 || daylioImporting}>
          <span>{daylioImporting ? m.imp_running() : m.daylio_confirm({ count: daylioPreview.entryCount })}</span>
        </button>
      {/if}
      <Progress run={daylioProgress} label={m.daylio_running_rows()} handle="daylio" />
      <button class="btn btn-ghost" onclick={() => (daylioSheet = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>

  <Sheet bind:open={backupSheet} title={m.dlb_sheet_title()}>
    <h3>{m.dlb_sheet_title()}</h3>
    <Field label={m.dlb_file_label()} legend>
      {#snippet children()}
        <button class="input" style="text-align:left;color:var(--text-2)" data-pick-backup onclick={chooseBackup}>
          <Icon name="upload" size={18} />
          <span style={backupName ? 'color:var(--text)' : ''}>
            {backupName || m.dlb_file_placeholder()}
          </span>
        </button>
      {/snippet}
    </Field>
    {#if backupError}
      <div class="notice notice-danger" style="margin-bottom:var(--space-4)" role="alert">
        <Icon name="alert" size={20} />
        <div class="notice-body">{backupError}</div>
      </div>
    {/if}
    {#if backupPreview}
      {#if backupPreview.unexpectedVersion !== null}
        <div class="notice notice-info" style="margin-bottom:var(--space-4)">
          <Icon name="info" size={20} />
          <div class="notice-body">{m.dlb_version_note({ version: String(backupPreview.unexpectedVersion) })}</div>
        </div>
      {/if}
      <!-- One card holding three blocks rather than three cards: what is
           arriving, how each mood landed, and what stays behind. The rows
           arrive in sequence on the app's own stagger, which reads down the
           list in the order somebody would check it. -->
      <div class="kit-panel" data-kit-surface style="margin-bottom:var(--space-4)">
        {#if nothingArriving(backupPreview)}
          <p class="muted small" style="margin:0" data-import-nothing-new>{m.dlb_nothing_new()}</p>
        {:else}
          <p class="small" style="margin-bottom:var(--space-2)"><strong>{m.dlb_arriving()}</strong></p>
          {#each arrivingRows(backupPreview) as row, i (row.label)}
            <div class="rows-divide value-row stagger-in" style="--stagger-i:{i}">
              <span>{row.label}</span><strong>{row.value}</strong>
            </div>
          {/each}
        {/if}

        <div class="hr"></div>
        <p class="small" style="margin-bottom:var(--space-2)"><strong>{m.dlb_moods()}</strong></p>
        {#if backupPreview.moods.length > 0}
          <!-- A mood Daylio named itself has no name in the file, so its
               own row is headed by this app's word for that position and
               says the position alone rather than repeating the word. -->
          {#each backupPreview.moods as mood}
            <div class="rows-divide value-row" data-backup-mood>
              <span data-backup-mood-name>{mood.name ?? (mood.mood === null ? m.dlb_mood_unmapped() : moodName(mood.mood))}</span>
              <strong data-backup-mood-position>
                {mood.mood === null
                  ? m.dlb_mood_unmapped()
                  : mood.name === null
                    ? mood.mood
                    : `${mood.mood} · ${moodName(mood.mood)}`}
              </strong>
            </div>
          {/each}
        {:else}
          <p class="muted small">{m.dlb_no_moods()}</p>
        {/if}

        {#if backupPreview.skipped.length > 0}
          <div class="hr"></div>
          <p class="small" style="margin-bottom:var(--space-2)"><strong>{m.dlb_left_behind()}</strong></p>
          {#each backupPreview.skipped as skip (skip.kind)}
            <div class="rows-divide value-row">
              <span>{SKIP_LABELS[skip.kind]()}</span>
              {#if skip.count !== undefined}<strong>{skip.count}</strong>{/if}
            </div>
          {/each}
          <p class="muted small" style="margin:var(--space-3) 0 0">{m.dlb_left_behind_note()}</p>
        {/if}
      </div>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.daylio_always_merge()}</p>
    {/if}
    <div class="stack-3">
      {#if backupPreview && !nothingArriving(backupPreview)}
        <button class="btn btn-primary" data-confirm-backup onclick={importBackup}
          disabled={backupPreview.unmappedMoodNames.length > 0 || backupImporting}>
          <span>{backupImporting ? m.imp_running() : m.dlb_confirm()}</span>
        </button>
      {/if}
      <Progress run={backupProgress} label={backupLabel} handle="daylio-backup" />
      <button class="btn btn-ghost" onclick={() => (backupSheet = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>
</div>

<style>
  /* The stale mark's footprint, held whether a mark is in it or not. The
     tick sits at the slot's end edge, where it sat before the slot. */
  .backup-mark-slot {
    display: grid;
    flex: none;
    width: 28px;
    height: 28px;
    align-items: center;
    justify-items: end;
  }
  .backup-mark-slot > * {
    grid-area: 1 / 1;
  }
  .backup-tick {
    display: flex;
  }
  /* The same footprint as the tick it stands in for, on the warning ground. */
  .backup-stale-mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--r-block);
  }
  /* From components.css once Settings stopped drawing one (ticket 277):
     this screen is the only reader left. */
  .hr {
    border: none;
    border-top: 1px solid var(--hairline);
    margin: var(--space-4) 0;
  }
  /* Two wordings in one cell: the cell is as big as the longer one either
     way, and changing state crossfades rather than swapping text in a
     frame. */
  .swap {
    display: inline-grid;
  }
  p.swap {
    display: grid;
  }
  /* The resting wording leaves selection and hit-testing once it has faded:
     visibility flips after the fade on the way out and at once on the way
     in. */
  .swap > * {
    grid-area: 1 / 1;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      visibility 0s linear var(--dur-fast);
  }
  .swap > .is-on {
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      visibility 0s;
  }
  .backup-password-error {
    color: var(--danger);
    margin: 0 0 var(--space-4);
  }
  .mode-mark {
    display: inline-flex;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .mode-mark.is-on {
    opacity: 1;
  }
</style>
