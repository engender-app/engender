<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { runExport, type ExportPath } from '$lib/data/archive/backup';
  import { runAndroidAutoExport } from '$lib/data/archive/android-auto-export';
  import { androidAutoExport, type AutoExportStatus } from '$lib/data/archive/android-auto-export-bridge';
  import { backupAgeDays, backupIsStale } from '$lib/data/backupHealth';
  import { applyPortablePreferences, prefs } from '$lib/data/prefs/store.svelte';
  import { openArchive } from '$lib/data/archive/pack';
  import { archivePasswordProblem } from '$lib/data/archive/password';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { archiveFailureKind, type ArchiveFailureKind } from '$lib/data/archive/failure';
  import { importFailureMessage, verifyFailureMessage } from '$lib/data/vocabulary/archiveErrorLabels';
  import { EmptyArchiveFileError, pickArchive, type PickedArchive } from '$lib/data/archive/pick';
  import { verifyArchive } from '$lib/data/journal/restore';
  import { DaylioCsvError, type DaylioPreview } from '$lib/data/archive/daylio';
  import { DaylioBackupError, type DaylioBackupPreview, type DaylioSkipKind } from '$lib/data/archive/daylioBackup';
  import { normalizePhoto } from '$lib/data/photos/normalize';
  import { recognizeSource } from '$lib/data/archive/sources';
  import { IMPORT_FILE_SIZE_CEILING_BYTES, ZipTooLargeError } from '$lib/data/archive/zipReader';
  import type { ArchiveImportLogRecord } from '$lib/data/archive/payload';
  import { chooseFiles } from '$lib/data/fileDialog';
  import { dimensionName, moodName, tagLabel, tagLabels } from '$lib/data/vocabulary/labels';
  import { journal } from '$lib/data/live/journal.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import { isAndroid } from '$lib/platform';
  import { onMount } from 'svelte';

  let android = $derived(isAndroid());
  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt));
  let stale = $derived(backupIsStale(prefs.lastBackupAt));
  let verifiedAge = $derived(backupAgeDays(prefs.lastVerifiedAt));

  let expPass = $state('');
  let impPass = $state('');
  let impMode = $state('merge');
  let picked = $state<PickedArchive | null>(null);
  let importing = $state(false);
  let verifying = $state(false);
  let impError = $state('');
  /* Walkthrough handle for which catalogued sentence impError holds, so the
     suite can tell import failures apart without matching on the wording
     itself (ADR: the walkthrough grips handles, never wording). The
     archive's own four kinds come from archive/failure.ts, which classifies
     what the container, the codec and the crypto throw; the three below are
     this screen's own guards ahead of that: 'pick-first' and
     'password-needed' never reach a file, and 'empty-file' reaches one but
     refuses it (EmptyArchiveFileError, pick.ts) before a byte is
     decrypted - still this screen's guard, not the container's, because
     nothing archive-shaped was ever opened. */
  type ImportGuardKind = '' | 'pick-first' | 'password-needed' | 'empty-file';
  let impErrorKind = $state<ArchiveFailureKind | ImportGuardKind>('');
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
  let autoLastSuccessAt = $state<number | null>(null);
  let autoLastFailureAt = $state<number | null>(null);
  let autoLastFailureReason = $state<string | null>(null);
  let autoHasPassword = $state(false);
  let autoBusy = $state(false);

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
    return new Date(at).toLocaleString();
  }

  function applyAutoStatus(status: AutoExportStatus) {
    prefs.autoExportEnabled = status.enabled;
    prefs.autoExportSchedule = status.schedule;
    autoDestination = status.destinationLabel;
    autoHasPassword = status.hasPassword;
    autoLastSuccessAt = status.lastSuccessAt;
    autoLastFailureAt = status.lastFailureAt;
    autoLastFailureReason = status.lastFailureReason;
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

  async function setAutoEnabled(enabled: boolean) {
    if (enabled && !autoHasPassword) {
      const refusal = expPassRefusal(m.exp_auto_password_needed);
      if (refusal) {
        toast(refusal);
        prefs.autoExportEnabled = false;
        return;
      }
      await androidAutoExport.setPassword({ password: expPass });
      autoHasPassword = true;
    }
    prefs.autoExportEnabled = enabled;
    await configureAutoExport(enabled, prefs.autoExportSchedule);
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

  async function backupNowToDestination() {
    if (!android || autoBusy) return;
    const refusal = expPassRefusal(m.exp_password_first);
    if (refusal) {
      toast(refusal);
      return;
    }

    autoBusy = true;
    try {
      if (expPass) {
        await androidAutoExport.setPassword({ password: expPass });
        autoHasPassword = true;
      }

      const result = await runAndroidAutoExport(
        {
          snapshot: await journal.archive.snapshot(),
          preferences: prefs
        },
        {
          recordBackup: (at) => {
            prefs.lastBackupAt = at;
            prefs.backupNoticeDismissed = false;
          }
        }
      );

      if (result.outcome === 'ok') {
        toast(m.exp_auto_saved_toast());
      } else if (result.outcome === 'needs-destination') {
        toast(m.exp_auto_reselect_needed());
      } else {
        console.error('auto-export failed', result.reason);
        toast(m.exp_auto_failed());
      }
      await refreshAutoStatus();
    } catch (error) {
      console.error('auto-export failed', error);
      toast(m.exp_auto_failed());
    } finally {
      autoBusy = false;
    }
  }

  onMount(() => {
    if (android) void refreshAutoStatus();
    void refreshImportLog();
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
          }
        }
      );

      if (delivery === 'cancelled') {
        toast(m.exp_cancelled());
        return;
      }
      const what = done[path]();
      toast(delivery === 'shared' ? m.exp_done_shared({ what }) : m.exp_done_downloaded({ what }));
    } catch (error) {
      console.error(`the ${path} export failed`, error);
      toast(m.exp_failed());
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
      const chosen = await pickArchive();
      if (!chosen) return; // backed out
      picked = chosen;
      impError = '';
      impErrorKind = '';
    } catch (error) {
      console.error('the archive picker failed', error);
      if (error instanceof EmptyArchiveFileError) {
        impErrorKind = 'empty-file';
        impError = m.imp_file_empty();
      } else {
        toast(m.imp_picker_failed());
      }
    }
  }

  /* The import. Every step before the last one is reversible, and the last
     one is a single journal operation that either lands whole or leaves the
     journal exactly as it was (ADR-0011) - which is why this screen does no
     sequencing of its own beyond picking a mode. */
  async function doImport() {
    if (!picked) {
      impError = m.imp_pick_first();
      impErrorKind = 'pick-first';
      return;
    }
    if (!impPass) {
      impError = m.imp_password_needed();
      impErrorKind = 'password-needed';
      return;
    }
    impError = '';
    impErrorKind = '';
    importing = true;
    try {
      const { payload, files } = await openArchive(picked.bytes(), impPass);
      const contents = { journal: payload.journal, files };

      if (impMode === 'replace') {
        await journal.archive.replace(contents);
        /* The settings that describe the journal travel with it (ADR-0003);
           the ones that describe this installation - the PIN, the lock flags,
           the disguise - are not in the archive at all, so restoring cannot
           lock anybody out of an app with no recovery path. */
        applyPortablePreferences(payload.preferences);
        toast(m.imp_replaced_toast());
      } else {
        // A merge writes no settings, for the same reason it leaves rows
        // alone: what is already on this device wins.
        await journal.archive.merge(contents);
        toast(m.imp_merged_toast());
      }
    } catch (error) {
      console.error('the import failed', error);
      impErrorKind = archiveFailureKind(error);
      impError = importFailureMessage(impErrorKind);
    } finally {
      importing = false;
    }
  }

  /* The backup health drill (ticket 28): the same picked file and password
     as import, but only decrypting, parsing and validating it - restore.ts's
     verifyArchive never takes a driver or a file store, so there is nothing
     here for it to write to. */
  async function doVerify() {
    if (!picked) {
      impError = m.imp_pick_first();
      return;
    }
    if (!impPass) {
      impError = m.imp_password_needed();
      return;
    }
    impError = '';
    verifying = true;
    try {
      await verifyArchive(picked.bytes(), impPass);
      prefs.lastVerifiedAt = Date.now();
      toast(m.verify_ok_toast());
    } catch (error) {
      console.error('the verify drill failed', error);
      impError = verifyFailureMessage(archiveFailureKind(error));
    } finally {
      verifying = false;
    }
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
    try {
      const result = await journal.archive.commitDaylioImport(daylioPreview);
      daylioSheet = false;
      toast(m.daylio_imported_toast({ entries: String(result.entriesAdded), tags: String(result.tagsAdded) }));
      void refreshImportLog();
    } catch (error) {
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
    try {
      const result = await journal.archive.commitDaylioBackupImport(backupPreview, normalizePhoto);
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
      console.error('the Daylio backup import failed', error);
      backupError = m.dlb_failed();
    } finally {
      backupImporting = false;
    }
  }

</script>

<div class="screen">
  <ScreenHeader title={m.exp_title()} back="/settings" />

  <div class="card" style="margin-bottom:var(--space-4)">
    <div class="spread">
      <span class="kit-row-text">
        <span class="kit-row-title">{m.exp_last_backup()}</span>
        <!-- Handle for the walkthrough, like data-plain on the export buttons:
             the backup age is what the plain-export flow checks moved to today,
             and reaching it by layout broke silently once this card grew rows. -->
        <span class="kit-row-sub" data-backup-age>
          {backupAge == null
            ? m.exp_last_backup_never()
            : backupAge === 0
              ? m.exp_last_backup_today()
              : m.exp_last_backup_days({ days: m.n_days({ n: backupAge }) })}
        </span>
      </span>
      {#if stale}
        <span class="notice-warn" style="padding:4px 10px;border-radius:var(--radius-pill);font-size:var(--text-xs);font-weight:700">{m.exp_stale_badge()}</span>
      {:else}
        <Icon name="check" size={20} />
      {/if}
    </div>
    <div class="hr" style="margin:var(--space-3) 0"></div>
    <div class="spread">
      <span class="kit-row-text">
        <span class="kit-row-title">{m.exp_last_verified()}</span>
        <span class="kit-row-sub">
          {verifiedAge == null
            ? m.exp_last_verified_never()
            : verifiedAge === 0
              ? m.exp_last_verified_today()
              : m.exp_last_verified_days({ days: m.n_days({ n: verifiedAge }) })}
        </span>
      </span>
      <Icon name="shield" size={20} />
    </div>
  </div>

  {#if importLog.length > 0}
    <SectionTitle text={m.imp_log_section()} />
    <div class="card editor-section">
      {#each importLog as record, i (record.id)}
        {#if i > 0}<div class="hr"></div>{/if}
        <ListRow
          static
          data-import-log-row
          title={importLogSourceLabel(record.source)}
          subtitle={m.imp_log_row_sub({ counts: importLogCountsText(record.counts), when: stampText(record.importedAt) })}
        />
      {/each}
    </div>
  {/if}

  <SectionTitle text={m.exp_encrypted_section()} />
  <div class="card editor-section">
    <p class="small" style="margin-bottom:var(--space-3)">{m.exp_encrypted_body()}</p>
    <Field label={m.exp_password_label()} id="exp-pass">
      {#snippet children(id)}
        <input class="input" type="password" {id} name="exp-pass" placeholder={m.exp_password_placeholder()}
          autocomplete="new-password" bind:value={expPass} />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-export onclick={openExportWarning} disabled={running !== null}>
      <Icon name={android ? 'share' : 'download'} size={20} />
      <span>{running === 'encrypted' ? m.exp_running() : android ? m.exp_run_share() : m.exp_run_download()}</span>
    </button>
    <p class="muted small">
      <Icon name="key" size={13} /> {m.exp_crypto_note()}
    </p>
  </div>

  {#if android}
    <!-- Mockup only: no password prompt or export trigger exists yet, so
         there's nothing here to attach ticket 12's "warning before any
         encrypted export" to. Its real Android implementation must show
         the same warning the manual export sheet above does, once. -->
    <div class="card editor-section">
      <div class="spread">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.exp_auto_title()}</span>
          <span class="kit-row-sub">{m.exp_auto_sub()}</span>
        </span>
        <Switch checked={prefs.autoExportEnabled} label={m.exp_auto_title()}
          onChange={setAutoEnabled} />
      </div>

        <div class="spread">
          <span class="small muted">{m.exp_auto_destination_label()}</span>
          <button class="btn btn-soft" type="button" onclick={pickAutoDestination} disabled={autoBusy}>
            <span>{autoDestination ? m.exp_auto_change_destination() : m.exp_auto_choose_destination()}</span>
          </button>
        </div>
        <p class="muted small">
          {m.exp_auto_destination_note()}
        </p>
        <p class="muted small">
          {autoDestination ?? m.exp_auto_destination_missing()}
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
      {/if}

        <p class="muted small">
          {m.exp_auto_note({ folder: autoDestination ?? m.exp_auto_destination_missing() })}
        </p>
        <p class="muted small">
          {autoHasPassword ? m.exp_auto_password_saved() : m.exp_auto_password_missing()}
        </p>
        <p class="muted small">
          {m.exp_auto_last_success({ when: stampText(autoLastSuccessAt) })}
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

  <SectionTitle text={m.imp_section()} />
  <div class="card editor-section">
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
        <input class="input" type="password" {id} name="imp-pass"
          placeholder={m.imp_password_placeholder()} bind:value={impPass} />
      {/snippet}
    </Field>
    <Field label={m.imp_how_label()} legend>
      {#snippet children()}
        <Segmented name={m.imp_how_label()}
          options={[{ value: 'merge', label: m.imp_mode_merge() }, { value: 'replace', label: m.imp_mode_replace() }]}
          value={impMode} onChange={(v) => (impMode = v)} />
      {/snippet}
    </Field>
    {#if impError}
      <div class="notice notice-danger" style="margin-bottom:var(--space-3)" role="alert" data-import-error={impErrorKind}>
        <Icon name="alert" size={20} />
        <div class="notice-body">{impError}</div>
      </div>
    {/if}
    <p class="muted small" style="margin-bottom:var(--space-3)">
      {impMode === 'replace' ? m.imp_replace_note() : m.imp_merge_note()}
    </p>
    <div class="spread">
      <button class="btn btn-ghost" data-verify onclick={doVerify} disabled={importing || verifying}>
        <Icon name="shield" size={18} />
        <span>{verifying ? m.verify_running() : m.verify_run()}</span>
      </button>
      <button class="btn btn-soft" data-import onclick={doImport} disabled={importing || verifying}>
        <span>{importing ? m.imp_running() : m.imp_run()}</span>
      </button>
    </div>
    <div class="hr"></div>
    <div data-import-rows>
    <ListRow
      icon="book"
      title={m.daylio_row_title()}
      subtitle={m.daylio_row_sub()}
      onclick={openDaylio}
      data-daylio
      style="border-radius:var(--radius-md);background:var(--surface-2)"
    />
    <ListRow
      icon="package"
      title={m.dlb_row_title()}
      subtitle={m.dlb_row_sub()}
      onclick={openBackup}
      data-daylio-backup
      style="border-radius:var(--radius-md);background:var(--surface-2);margin-top:var(--space-2)"
    />
    </div>
  </div>

  <SectionTitle text={m.plain_section()} />
  <div class="card editor-section">
    <p class="small" style="margin-bottom:var(--space-3)">{m.plain_body()}</p>
    <div class="spread">
      <button class="btn btn-soft" data-plain="csv" disabled={running !== null} onclick={() => (plainSheet = 'csv')}><span>CSV</span></button>
      <button class="btn btn-soft" data-plain="json" disabled={running !== null} onclick={() => (plainSheet = 'json')}><span>JSON</span></button>
    </div>
  </div>

  <Sheet open={exportWarningOpen} title={m.exp_warning_sheet()} onClose={() => (exportWarningOpen = false)}>
    <h3>{m.exp_warning_title()}</h3>
    <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
      <Icon name="alert" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.exp_warning_notice_title()}</span>
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
      <div class="card" style="box-shadow:none;background:var(--surface-2);margin-bottom:var(--space-4)">
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
      <div class="card" style="box-shadow:none;background:var(--surface-2);margin-bottom:var(--space-4)">
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
          {#each backupPreview.moods as mood, i (mood.name ?? `built-in-${i}`)}
            <div class="rows-divide value-row">
              <span>{mood.name ?? (mood.mood === null ? m.dlb_mood_unmapped() : moodName(mood.mood))}</span>
              <strong>
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
      <button class="btn btn-ghost" onclick={() => (backupSheet = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>
</div>
