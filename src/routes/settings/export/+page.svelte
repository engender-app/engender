<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { runExport, type ExportPath } from '$lib/data/archive/backup';
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

  const DONE: Record<ExportPath, string> = {
    encrypted: 'Encrypted',
    csv: 'CSV exported',
    json: 'JSON exported'
  };

  function openExportWarning() {
    if (!expPass) {
      toast('Choose a password first.');
      return;
    }
    exportWarningOpen = true;
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
        toast('Export cancelled. Nothing left the app.');
        return;
      }
      toast(delivery === 'shared' ? `${DONE[path]} and shared.` : `${DONE[path]}. Check your downloads.`);
    } catch (error) {
      console.error(`the ${path} export failed`, error);
      toast('The export could not be finished. Nothing was saved.');
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
      toast("Couldn't open the file picker.");
    }
  }

  /* The import. Every step before the last one is reversible, and the last
     one is a single journal operation that either lands whole or leaves the
     journal exactly as it was (ADR-0011) - which is why this screen does no
     sequencing of its own beyond picking a mode. */
  async function doImport() {
    if (!picked) {
      impError = 'Pick a backup file first.';
      return;
    }
    if (!impPass) {
      impError = 'Type the password this backup was made with.';
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
        toast('Restored. This journal is the backup now.');
      } else {
        // A merge writes no settings, for the same reason it leaves rows
        // alone: what is already on this device wins.
        await journal.archive.merge(contents);
        toast('Merged in. Nothing you already had was touched.');
      }
    } catch (error) {
      console.error('the import failed', error);
      impError = importFailure(error);
    } finally {
      importing = false;
    }
  }

  function importFailure(error: unknown): string {
    if (error instanceof DecryptionFailedError) {
      return 'That password doesn’t unlock this file. Passwords are case-sensitive, so check and try again. Nothing was imported.';
    }
    if (error instanceof UnsupportedArchiveError) return `${error.message} Nothing was imported.`;
    if (error instanceof CorruptArchiveError) {
      return 'This file is damaged and can’t be read to the end. Nothing was imported; your journal is exactly as it was.';
    }
    return 'The import couldn’t be finished. Your journal is exactly as it was.';
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
        daylioError = `These mood labels aren't mapped: ${daylioPreview.unmappedMoodLabels.join(', ')}. Nothing has been imported. Rename them in Daylio to a default English or Polish mood, export again, and retry.`;
      }
    } catch (error) {
      console.error('the Daylio preview failed', error);
      daylioPreview = null;
      daylioError = error instanceof DaylioCsvError
        ? `${error.message}. Nothing has been imported.`
        : `This CSV couldn't be read. Nothing has been imported.`;
    }
  }

  async function importDaylio() {
    if (!daylioPreview || daylioPreview.unmappedMoodLabels.length > 0 || daylioImporting) return;
    daylioImporting = true;
    daylioError = '';
    try {
      const result = await journal.archive.commitDaylioImport(daylioPreview);
      daylioSheet = false;
      toast(`${result.entriesAdded} entries and ${result.tagsAdded} new tags imported.`);
    } catch (error) {
      console.error('the Daylio import failed', error);
      daylioError = `The Daylio import couldn't be finished. Your journal is exactly as it was.`;
    } finally {
      daylioImporting = false;
    }
  }

</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">Export & import</h1>
    <div class="header-action"></div>
  </header>

  <div class="card spread" style="margin-bottom:var(--space-4)">
    <span class="row-text">
      <span class="row-title">Last backup</span>
      <span class="row-subtitle">
        {backupAge == null ? 'never — your journal exists only on this device' : backupAge === 0 ? 'today' : `${backupAge} days ago`}
      </span>
    </span>
    {#if stale}
      <span class="notice-warn" style="padding:4px 10px;border-radius:var(--radius-pill);font-size:var(--text-xs);font-weight:700">stale</span>
    {:else}
      <Icon name="check" size={20} />
    {/if}
  </div>

  <SectionTitle text="Encrypted export" />
  <div class="card editor-section">
    <p class="small" style="margin-bottom:var(--space-3)">
      Everything — entries, photos, milestones, tags, custom dimensions & presets, lab results, settings — packed
      into one file and encrypted <strong>before</strong> it leaves the app.
    </p>
    <div class="field">
      <label class="field-label" for="exp-pass">Password</label>
      <input class="input" type="password" id="exp-pass" name="exp-pass" placeholder="Choose a strong password"
        autocomplete="new-password" bind:value={expPass} />
    </div>
    <button class="btn btn-primary" data-export onclick={openExportWarning} disabled={running !== null}>
      <Icon name={android ? 'share' : 'download'} size={20} />
      <span>{running === 'encrypted' ? 'Encrypting…' : android ? 'Encrypt & share' : 'Encrypt & download'}</span>
    </button>
    <p class="muted small" style="margin-top:var(--space-3)">
      <Icon name="key" size={13} /> AES-256-GCM, key derived with Argon2id. Without the password the file is
      unreadable — including by us.
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
          <span class="row-title">Auto-export</span>
          <span class="row-subtitle">encrypted backup to a folder you pick</span>
        </span>
        <Switch checked={prefs.autoExportEnabled} label="Auto-export"
          onChange={(v) => (prefs.autoExportEnabled = v)} />
      </div>
      {#if prefs.autoExportEnabled}
        <div class="spread" style="margin-top:var(--space-3)">
          <span class="small muted">Schedule</span>
          <Segmented name="Schedule"
            options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
            value={prefs.autoExportSchedule}
            onChange={(v) => (prefs.autoExportSchedule = v as 'weekly' | 'monthly')} />
        </div>
        <p class="muted small" style="margin-top:var(--space-3)">
          Folder: <strong>Downloads/TransitionTracker</strong> · password asked once; only a device-locked key is
          kept, never the password.
        </p>
      {/if}
    </div>
  {/if}

  <SectionTitle text="Import" />
  <div class="card editor-section">
    <div class="field">
      <span class="field-label">Backup file</span>
      <button class="input" style="text-align:left;color:var(--text-2)" data-pick-file onclick={choose}>
        <Icon name="upload" size={18} />
        <span id="picked-file" style={picked ? 'color:var(--text)' : ''}>
          {picked ? picked.name : 'Choose a .ttbackup file…'}
        </span>
      </button>
    </div>
    <div class="field">
      <label class="field-label" for="imp-pass">Password</label>
      <input class="input" type="password" id="imp-pass" name="imp-pass"
        placeholder="The password it was exported with" bind:value={impPass} />
    </div>
    <div class="field">
      <span class="field-label">How to import</span>
      <Segmented name="Import mode"
        options={[{ value: 'merge', label: 'Merge into current' }, { value: 'replace', label: 'Replace everything' }]}
        value={impMode} onChange={(v) => (impMode = v)} />
    </div>
    {#if impError}
      <div class="notice notice-danger" style="margin-bottom:var(--space-3)" role="alert">
        <Icon name="alert" size={20} />
        <div class="notice-body">{impError}</div>
      </div>
    {/if}
    <p class="muted small" style="margin-bottom:var(--space-3)">
      {impMode === 'replace'
        ? 'Everything in this journal is discarded and the backup takes its place. Your PIN, app lock and disguise settings stay as they are.'
        : 'Anything the backup has and this device doesn’t is added. Nothing you already logged is changed.'}
    </p>
    <button class="btn btn-soft" data-import onclick={doImport} disabled={importing}>
      <span>{importing ? 'Importing…' : 'Import backup'}</span>
    </button>
    <div class="hr"></div>
    <button class="list-row" data-daylio style="border-radius:var(--radius-md);background:var(--surface-2)"
      onclick={openDaylio}>
      <span class="row-icon"><Icon name="book" size={20} /></span>
      <span class="row-text">
        <span class="row-title">Import from Daylio (CSV)</span>
        <span class="row-subtitle">moods, activities and notes — always a merge</span>
      </span>
      <Icon name="chevronRight" size={18} />
    </button>
  </div>

  <SectionTitle text="Plain export" />
  <div class="card editor-section">
    <p class="small" style="margin-bottom:var(--space-3)">For spreadsheets and portability: CSV (flat) or JSON (full structure).</p>
    <div class="spread">
      <button class="btn btn-soft" data-plain="csv" disabled={running !== null} onclick={() => (plainSheet = 'csv')}><span>CSV</span></button>
      <button class="btn btn-soft" data-plain="json" disabled={running !== null} onclick={() => (plainSheet = 'json')}><span>JSON</span></button>
    </div>
  </div>

  <Sheet open={exportWarningOpen} title="Before you continue" onClose={() => (exportWarningOpen = false)}>
    <h3>There's no way to recover a forgotten password</h3>
    <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
      <Icon name="alert" size={20} />
      <div class="notice-body">
        <span class="notice-title">This can't be undone</span>
        If you forget this password, the archive is unreadable forever - including to us. There is no recovery
        option, no exceptions.
      </div>
    </div>
    <div class="stack-3">
      <button class="btn btn-danger" data-confirm-export onclick={confirmExport}>
        <span>I understand, encrypt & export</span>
      </button>
      <button class="btn btn-ghost" onclick={() => (exportWarningOpen = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>

  <Sheet open={plainSheet !== null} title="Plain export" onClose={() => (plainSheet = null)}>
    {#if plainSheet}
      <h3>Export unencrypted {plainSheet.toUpperCase()}?</h3>
      <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
        <Icon name="alert" size={20} />
        <div class="notice-body">
          <span class="notice-title">This file is not encrypted</span>
          Anyone who gets it can read your whole journal. Store it somewhere only you can reach, or use the
          encrypted export instead.
        </div>
      </div>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-plain onclick={confirmPlain}>
          <span>Export plain {plainSheet.toUpperCase()}</span>
        </button>
        <button class="btn btn-ghost" onclick={() => (plainSheet = null)}><span>{m.cancel()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet bind:open={daylioSheet} title="Import from Daylio">
    <h3>Import from Daylio</h3>
    <div class="field">
      <span class="field-label">Daylio CSV</span>
      <button class="input" style="text-align:left;color:var(--text-2)" data-pick-daylio onclick={chooseDaylio}>
        <Icon name="upload" size={18} />
        <span style={daylioName ? 'color:var(--text)' : ''}>
          {daylioName || 'Choose a Daylio .csv file…'}
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
        <div class="value-row"><span>Entries to add</span><strong>{daylioPreview.entryCount}</strong></div>
        <div class="value-row">
          <span>Activities → tags</span>
          <strong>{daylioPreview.matchedTagCount} matched · {daylioPreview.newTagCount} new in "Imported"</strong>
        </div>
        <div class="value-row"><span>Notes</span><strong>preserved</strong></div>
        <div class="value-row"><span>Photos</span><strong>not in Daylio's CSV</strong></div>
        <div class="hr"></div>
        <p class="small" style="margin-bottom:var(--space-2)"><strong>Mood mapping</strong></p>
        {#if daylioPreview.moodMappings.length > 0}
          {#each daylioPreview.moodMappings as mapping (mapping.label)}
            <div class="value-row">
              <span>{mapping.label}</span>
              <strong>{mapping.mood === null ? 'not mapped' : `${mapping.mood} · ${moodName(mapping.mood)}`}</strong>
            </div>
          {/each}
        {:else}
          <p class="muted small">No moods in this file.</p>
        {/if}
      </div>
      <p class="muted small" style="margin-bottom:var(--space-4)">
        This import is always a <strong>merge</strong>. Nothing you already logged is changed.
      </p>
    {/if}
    <div class="stack-3">
      {#if daylioPreview}
        <button class="btn btn-primary" data-confirm-daylio onclick={importDaylio}
          disabled={daylioPreview.unmappedMoodLabels.length > 0 || daylioImporting}>
          <span>{daylioImporting ? 'Importing…' : `Import ${daylioPreview.entryCount} entries`}</span>
        </button>
      {/if}
      <button class="btn btn-ghost" onclick={() => (daylioSheet = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>
</div>
