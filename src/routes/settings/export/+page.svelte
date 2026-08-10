<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db, save } from '$lib/data/db.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let android = $derived(ui.frame === 'phone');
  let backupAge = $derived(
    db.prefs.lastBackupAt ? Math.floor((Date.now() - db.prefs.lastBackupAt) / 86400000) : null
  );

  let expPass = $state('');
  let impPass = $state('');
  let impMode = $state('merge');
  let filePicked = $state(false);
  let impError = $state('');
  let plainSheet = $state<string | null>(null);
  let daylioSheet = $state(false);

  function doExport() {
    if (!expPass) {
      toast('Choose a password first.');
      return;
    }
    db.prefs.lastBackupAt = Date.now();
    db.prefs.backupNoticeDismissed = false;
    save();
    toast(android ? 'Encrypted. Opening share sheet…' : 'Encrypted. Downloading…');
  }

  function doImport() {
    if (!filePicked) {
      impError = 'Pick a backup file first.';
      return;
    }
    if (impPass !== 'demo') {
      impError = "That password doesn’t unlock this file. Passwords are case-sensitive — check and try again. Nothing was imported.";
      return;
    }
    impError = '';
    toast('Backup restored.');
  }

  function confirmPlain() {
    const fmt = plainSheet;
    plainSheet = null;
    db.prefs.lastBackupAt = Date.now();
    save();
    toast(`${fmt} exported.`);
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
    {#if backupAge != null && backupAge > 30}
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
    <button class="btn btn-primary" data-export onclick={doExport}>
      <Icon name={android ? 'share' : 'download'} size={20} /><span>{android ? 'Encrypt & share' : 'Encrypt & download'}</span>
    </button>
    <p class="muted small" style="margin-top:var(--space-3)">
      <Icon name="key" size={13} /> AES-256-GCM, key derived with Argon2id. Without the password the file is
      unreadable — including by us.
    </p>
  </div>

  {#if android}
    <div class="card editor-section">
      <div class="spread">
        <span class="row-text">
          <span class="row-title">Auto-export</span>
          <span class="row-subtitle">encrypted backup to a folder you pick</span>
        </span>
        <Switch checked={db.prefs.autoExport.enabled} label="Auto-export"
          onChange={(v) => { db.prefs.autoExport.enabled = v; save(); }} />
      </div>
      {#if db.prefs.autoExport.enabled}
        <div class="spread" style="margin-top:var(--space-3)">
          <span class="small muted">Schedule</span>
          <Segmented name="Schedule"
            options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
            value={db.prefs.autoExport.schedule}
            onChange={(v) => { db.prefs.autoExport.schedule = v as 'weekly' | 'monthly'; save(); }} />
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
      <button class="input" style="text-align:left;color:var(--text-2)" data-pick-file
        onclick={() => (filePicked = true)}>
        <Icon name="upload" size={18} />
        <span id="picked-file" style={filePicked ? 'color:var(--text)' : ''}>
          {filePicked ? 'alice-journal-2026-08-02.ttbackup' : 'Choose a .ttbackup file…'}
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
    <button class="btn btn-soft" data-import onclick={doImport}><span>Import backup</span></button>
    <div class="hr"></div>
    <button class="list-row" data-daylio style="border-radius:var(--radius-md);background:var(--surface-2)"
      onclick={() => (daylioSheet = true)}>
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
      <button class="btn btn-soft" data-plain="csv" onclick={() => (plainSheet = 'CSV')}><span>CSV</span></button>
      <button class="btn btn-soft" data-plain="json" onclick={() => (plainSheet = 'JSON')}><span>JSON</span></button>
    </div>
  </div>

  <Sheet open={plainSheet !== null} title="Plain export" onClose={() => (plainSheet = null)}>
    {#if plainSheet}
      <h3>Export unencrypted {plainSheet}?</h3>
      <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
        <Icon name="alert" size={20} />
        <div class="notice-body">
          <span class="notice-title">This file is not encrypted</span>
          Anyone who gets it can read your whole journal. Store it somewhere only you can reach, or use the
          encrypted export instead.
        </div>
      </div>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-plain onclick={confirmPlain}><span>Export plain {plainSheet}</span></button>
        <button class="btn btn-ghost" onclick={() => (plainSheet = null)}><span>{m.cancel()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet bind:open={daylioSheet} title="Import from Daylio">
    <h3>Import from Daylio</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">daylio_export_2026-08-01.csv</p>
    <div class="card" style="box-shadow:none;background:var(--surface-2);margin-bottom:var(--space-4)">
      <div class="value-row"><span>Entries found</span><strong>412</strong></div>
      <div class="value-row"><span>Activities → tags</span><strong>18 matched · 5 new in “Imported”</strong></div>
      <div class="value-row"><span>Notes</span><strong>preserved</strong></div>
      <div class="value-row"><span>Photos</span><strong>not in Daylio’s CSV</strong></div>
      <div class="hr"></div>
      <p class="small" style="margin-bottom:var(--space-2)"><strong>Mood mapping</strong></p>
      <div class="value-row"><span>rad → great</span><span>awful → awful</span></div>
      <div class="value-row"><span>good → good</span><span>bad → bad</span></div>
      <div class="value-row"><span>meh → meh</span><span></span></div>
    </div>
    <p class="muted small" style="margin-bottom:var(--space-4)">
      Imports are always a <strong>merge</strong> — nothing you already logged is touched.
    </p>
    <div class="stack-3">
      <button class="btn btn-primary" data-confirm-daylio
        onclick={() => { daylioSheet = false; toast('412 entries merged in.'); }}>
        <span>Import 412 entries</span>
      </button>
      <button class="btn btn-ghost" onclick={() => (daylioSheet = false)}><span>{m.cancel()}</span></button>
    </div>
  </Sheet>
</div>
