<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { runExport, type ExportPath } from '$lib/data/archive/backup';
  import { runAndroidAutoExport } from '$lib/data/archive/android-auto-export';
  import { androidAutoExport, type AutoExportStatus } from '$lib/data/archive/android-auto-export-bridge';
  import { backupAgeDays, backupIsStale } from '$lib/data/backupHealth';
  import { applyPortablePreferences, prefs } from '$lib/data/prefs/store.svelte';
  import { openArchive } from '$lib/data/archive/pack';
  import { CorruptArchiveError, UnsupportedArchiveError } from '$lib/data/archive/container';
  import { pickArchive, type PickedArchive } from '$lib/data/archive/pick';
  import { DaylioCsvError, type DaylioPreview } from '$lib/data/archive/daylio';
  import { chooseFiles } from '$lib/data/fileDialog';
  import { dimensionName, moodName, tagLabel, tagLabels } from '$lib/data/vocabulary/labels';
  import { DecryptionFailedError } from '$lib/crypto/aesGcm';
  import { journal } from '$lib/data/live/journal.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { isAndroid } from '$lib/platform';
  import { onMount } from 'svelte';

  let android = $derived(isAndroid());
  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt));
  let stale = $derived(backupIsStale(prefs.lastBackupAt));

  let expPass = $state('');
  let impPass = $state('');
  let impMode = $state('merge');
  let picked = $state<PickedArchive | null>(null);
  let importing = $state(false);
  let impError = $state('');
  let plainSheet = $state<'csv' | 'json' | null>(null);
  let daylioSheet = $state(false);
  let daylioName = $state('');
  let daylioPreview = $state.raw<DaylioPreview | null>(null);
  let daylioError = $state('');
  let daylioImporting = $state(false);
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

  function openExportWarning() {
    if (!expPass) {
      toast(m.exp_password_first());
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
      if (!expPass) {
        toast(m.exp_auto_password_needed());
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
    if (!expPass) {
      toast(m.exp_password_first());
      return;
    }

    autoBusy = true;
    try {
      const result = await runAndroidAutoExport(
        {
          snapshot: await journal.archive.snapshot(),
          preferences: prefs,
          password: expPass
        },
        {
          recordBackup: (at) => {
            prefs.lastBackupAt = at;
            prefs.backupNoticeDismissed = false;
          }
        }
      );

      if (result.outcome === 'ok') {
        if (expPass) {
          await androidAutoExport.setPassword({ password: expPass });
          autoHasPassword = true;
        }
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
  });

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
    } catch (error) {
      console.error('the archive picker failed', error);
      toast(m.imp_picker_failed());
    }
  }

  /* The import. Every step before the last one is reversible, and the last
     one is a single journal operation that either lands whole or leaves the
     journal exactly as it was (ADR-0011) - which is why this screen does no
     sequencing of its own beyond picking a mode. */
  async function doImport() {
    if (!picked) {
      impError = m.imp_pick_first();
      return;
    }
    if (!impPass) {
      impError = m.imp_password_needed();
      return;
    }
    impError = '';
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
      impError = importFailure(error);
    } finally {
      importing = false;
    }
  }

  /* Each branch is a catalogued sentence rather than an error message: the
     archive errors carry English diagnostics for the console, and a Polish
     reader must not get one of those spliced into a Polish paragraph
     (docs/ui-copy.md). */
  function importFailure(error: unknown): string {
    if (error instanceof DecryptionFailedError) return m.imp_wrong_password();
    if (error instanceof UnsupportedArchiveError) {
      return error.kind === 'newer-version' ? m.imp_newer_version() : m.imp_not_an_archive();
    }
    if (error instanceof CorruptArchiveError) return m.imp_corrupt();
    return m.imp_failed();
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
    } catch (error) {
      console.error('the Daylio import failed', error);
      daylioError = m.daylio_failed();
    } finally {
      daylioImporting = false;
    }
  }

</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.exp_title()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="card spread" style="margin-bottom:var(--space-4)">
    <span class="row-text">
      <span class="row-title">{m.exp_last_backup()}</span>
      <span class="row-subtitle">
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

  <SectionTitle text={m.exp_encrypted_section()} />
  <div class="card editor-section">
    <p class="small" style="margin-bottom:var(--space-3)">{m.exp_encrypted_body()}</p>
    <div class="field">
      <label class="field-label" for="exp-pass">{m.exp_password_label()}</label>
      <input class="input" type="password" id="exp-pass" name="exp-pass" placeholder={m.exp_password_placeholder()}
        autocomplete="new-password" bind:value={expPass} />
    </div>
    <button class="btn btn-primary" data-export onclick={openExportWarning} disabled={running !== null}>
      <Icon name={android ? 'share' : 'download'} size={20} />
      <span>{running === 'encrypted' ? m.exp_running() : android ? m.exp_run_share() : m.exp_run_download()}</span>
    </button>
    <p class="muted small" style="margin-top:var(--space-3)">
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
        <span class="row-text">
          <span class="row-title">{m.exp_auto_title()}</span>
          <span class="row-subtitle">{m.exp_auto_sub()}</span>
        </span>
        <Switch checked={prefs.autoExportEnabled} label={m.exp_auto_title()}
          onChange={setAutoEnabled} />
      </div>

        <div class="spread" style="margin-top:var(--space-3)">
          <span class="small muted">{m.exp_auto_destination_label()}</span>
          <button class="btn btn-soft" type="button" onclick={pickAutoDestination} disabled={autoBusy}>
            <span>{autoDestination ? m.exp_auto_change_destination() : m.exp_auto_choose_destination()}</span>
          </button>
        </div>
        <p class="muted small" style="margin-top:var(--space-2)">
          {m.exp_auto_destination_hint()}
        </p>
        <p class="muted small" style="margin-top:var(--space-2)">
          {autoDestination ?? m.exp_auto_destination_missing()}
        </p>

      {#if prefs.autoExportEnabled}
        <div class="spread" style="margin-top:var(--space-3)">
          <span class="small muted">{m.exp_schedule()}</span>
          <Segmented name={m.exp_schedule()}
            options={[{ value: 'weekly', label: m.exp_schedule_weekly() }, { value: 'monthly', label: m.exp_schedule_monthly() }]}
            value={prefs.autoExportSchedule}
            onChange={setAutoSchedule} />
        </div>

          <button class="btn btn-soft" style="margin-top:var(--space-3)" type="button"
            onclick={backupNowToDestination} disabled={autoBusy}>
            <span>{autoBusy ? m.exp_auto_running() : m.exp_auto_backup_now()}</span>
          </button>
      {/if}

        <p class="muted small" style="margin-top:var(--space-3)">
          {m.exp_auto_note({ folder: autoDestination ?? m.exp_auto_destination_missing() })}
        </p>
        <p class="muted small" style="margin-top:var(--space-2)">
          {autoHasPassword ? m.exp_auto_password_saved() : m.exp_auto_password_missing()}
        </p>
        <p class="muted small" style="margin-top:var(--space-2)">
          {m.exp_auto_last_success({ when: stampText(autoLastSuccessAt) })}
        </p>
        {#if autoLastFailureAt !== null}
          <p class="muted small" style="margin-top:var(--space-2)">
            {m.exp_auto_last_failure({ when: stampText(autoLastFailureAt) })}
          </p>
          {#if autoLastFailureReason}
            <p class="muted small" style="margin-top:var(--space-1)">{m.exp_auto_failed()}</p>
          {/if}
        {/if}
    </div>
  {/if}

  <SectionTitle text={m.imp_section()} />
  <div class="card editor-section">
    <div class="field">
      <span class="field-label">{m.imp_file_label()}</span>
      <button class="input" style="text-align:left;color:var(--text-2)" data-pick-file onclick={choose}>
        <Icon name="upload" size={18} />
        <span id="picked-file" style={picked ? 'color:var(--text)' : ''}>
          {picked ? picked.name : m.imp_file_placeholder()}
        </span>
      </button>
    </div>
    <div class="field">
      <label class="field-label" for="imp-pass">{m.exp_password_label()}</label>
      <input class="input" type="password" id="imp-pass" name="imp-pass"
        placeholder={m.imp_password_placeholder()} bind:value={impPass} />
    </div>
    <div class="field">
      <span class="field-label">{m.imp_how_label()}</span>
      <Segmented name={m.imp_how_label()}
        options={[{ value: 'merge', label: m.imp_mode_merge() }, { value: 'replace', label: m.imp_mode_replace() }]}
        value={impMode} onChange={(v) => (impMode = v)} />
    </div>
    {#if impError}
      <div class="notice notice-danger" style="margin-bottom:var(--space-3)" role="alert">
        <Icon name="alert" size={20} />
        <div class="notice-body">{impError}</div>
      </div>
    {/if}
    <p class="muted small" style="margin-bottom:var(--space-3)">
      {impMode === 'replace' ? m.imp_replace_note() : m.imp_merge_note()}
    </p>
    <button class="btn btn-soft" data-import onclick={doImport} disabled={importing}>
      <span>{importing ? m.imp_running() : m.imp_run()}</span>
    </button>
    <div class="hr"></div>
    <button class="list-row" data-daylio style="border-radius:var(--radius-md);background:var(--surface-2)"
      onclick={openDaylio}>
      <span class="row-icon"><Icon name="book" size={20} /></span>
      <span class="row-text">
        <span class="row-title">{m.daylio_row_title()}</span>
        <span class="row-subtitle">{m.daylio_row_sub()}</span>
      </span>
      <Icon name="chevronRight" size={18} />
    </button>
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
    <div class="field">
      <span class="field-label">{m.daylio_file_label()}</span>
      <button class="input" style="text-align:left;color:var(--text-2)" data-pick-daylio onclick={chooseDaylio}>
        <Icon name="upload" size={18} />
        <span style={daylioName ? 'color:var(--text)' : ''}>
          {daylioName || m.daylio_file_placeholder()}
        </span>
      </button>
    </div>
    {#if daylioError}
      <div class="notice notice-danger" style="margin-bottom:var(--space-4)" role="alert">
        <Icon name="alert" size={20} />
        <div class="notice-body">{daylioError}</div>
      </div>
    {/if}
    {#if daylioPreview}
      <div class="card" style="box-shadow:none;background:var(--surface-2);margin-bottom:var(--space-4)">
        <div class="value-row"><span>{m.daylio_entries_to_add()}</span><strong>{daylioPreview.entryCount}</strong></div>
        <div class="value-row">
          <span>{m.daylio_activities_to_tags()}</span>
          <strong>{m.daylio_tag_counts({ matched: String(daylioPreview.matchedTagCount), new: String(daylioPreview.newTagCount) })}</strong>
        </div>
        <div class="value-row"><span>{m.daylio_notes_row()}</span><strong>{m.daylio_notes_kept()}</strong></div>
        <div class="value-row"><span>{m.daylio_photos_row()}</span><strong>{m.daylio_photos_absent()}</strong></div>
        <div class="hr"></div>
        <p class="small" style="margin-bottom:var(--space-2)"><strong>{m.daylio_mood_mapping()}</strong></p>
        {#if daylioPreview.moodMappings.length > 0}
          {#each daylioPreview.moodMappings as mapping (mapping.label)}
            <div class="value-row">
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
</div>
