<script lang="ts">
  /* Settings, on the surface kit (phase 5 ticket 24). The three sections
     stay hand-written, per this ticket's own scope line - what changes is
     the container each sits in, same as the More hub next to it.

     Appearance's swatches, segments and switches are heterogeneous content
     with no row shape to them, so they sit in one ListCard's padded slot
     (.settings-pad) rather than being forced through ListRow. Tracking and
     Privacy's navigable rows are genuinely list-card material and go
     through ListRow properly; the handful of rows that carry a Switch or a
     Segmented instead of a chevron stay hand-written in the kit's own row
     classes (ticket 16, once ListRow gained `static`: not a nested-button
     problem any more, but `.kit-row.is-static` also drops the row's cursor
     and its :active wash, and moving a row that keeps neither today would
     be a press-state change on tap - out of this ticket's reach). */
  import { m } from '$lib/paraglide/messages';
  import { setLocale, getLocale } from '$lib/paraglide/runtime';
  import { DECOY_NAME } from '$lib/disguise/identity';
  import { backupAgeDays } from '$lib/data/backupHealth';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import ScaleChecklist from '$lib/components/ScaleChecklist.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { isAndroid } from '$lib/platform';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  /* Keyed, not worded, so the swatch names translate with everything else. */
  const PALETTES: [string, () => string][] = [
    ['trans', m.palette_trans], ['nonbinary', m.palette_nonbinary], ['genderfluid', m.palette_genderfluid],
    ['bisexual', m.palette_bisexual], ['lesbian', m.palette_lesbian], ['pansexual', m.palette_pansexual],
    ['rainbow', m.palette_rainbow], ['agender', m.palette_agender],
  ];

  /* COL-001: mood's own fixed 5-step scale, picked independently of the
     gender palette above - see ADR-0025. */
  const MOOD_PRESETS: [string, () => string][] = [
    ['amber', m.mood_preset_amber], ['teal', m.mood_preset_teal],
    ['plum', m.mood_preset_plum], ['moss', m.mood_preset_moss],
  ];

  let isWeb = $derived(!isAndroid());
  /* The row's subtitle names the ticked scales rather than counting them.
     PR-001 chose names over "3 scales" when the row had a preset name to
     beat; with the preset gone the names are all there is to say, and they
     are also the only way to see the set without opening the sheet. */
  let tickedNames = $derived(vocabulary.activeDimensions.map((d) => d.name).join(', '));
  let metricName = $derived(vocabulary.metricName);
  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt));

  /* Reminders are not mirrored (ADR-0004 lists what is), and this row shows a
     count of the enabled ones - which only the Android build displays at all. */
  let reminders = liveList((j) => j.reminders.getReminders());
  let activeReminders = $derived((reminders.rows).filter((r) => r.enabled).length);

  let scalesSheet = $state(false);

  /* Written straight through rather than held and applied on close: the
     sheet has no confirm and never has, so a tick is the change. Assigned
     as a new array because the preference store's proxy writes on
     assignment, and mutating the stored list in place would leave SQLite
     holding the old one. */
  function toggleScale(key: string) {
    prefs.activeScales = prefs.activeScales.includes(key)
      ? prefs.activeScales.filter((k) => k !== key)
      : [...prefs.activeScales, key];
  }
  let metricSheet = $state(false);
  let disguiseSheet = $state(false);
  let aboutSheet = $state(false);

  function setLanguage(v: string) {
    prefs.language = v as typeof prefs.language;
    const target = v === 'system' ? ((navigator.language || 'en').startsWith('pl') ? 'pl' : 'en') : (v as 'en' | 'pl');
    if (target !== getLocale()) setLocale(target); // reloads; all state is persisted
  }

  function pickPalette(key: string) {
    prefs.palette = key;
  }

  function pickMoodPreset(key: string) {
    prefs.moodPreset = key;
  }
</script>

<div class="screen">
  <!-- Hidden on the live build (Alicja, 2026-08-25): a visible "Settings"
       sitting directly above "Appearance" is the same two-headers-stacked
       problem DIRECTION.md 3d names for the More hub, even though this
       screen isn't itself a tab - the title stays in the document for a
       screen reader and the outline, same as there. -->
  <ScreenHeader title={m.nav_settings()} titleHidden />

  <SectionHeading text={m.settings_appearance()} />
  <ListCard>
    <div class="settings-pad">
      <p class="field-label" style="margin-bottom:var(--space-3)">{m.colour_palette()}</p>
      <div class="palette-grid" role="radiogroup" aria-label={m.colour_palette()}>
        {#each PALETTES as [key, label] (key)}
          <button
            class="palette-swatch press"
            class:is-active={prefs.palette === key}
            role="radio"
            aria-checked={prefs.palette === key}
            data-palette-pick={key}
            onclick={() => pickPalette(key)}
          >
            <span class="swatch-preview" data-swatch={key}></span>
            <span class="swatch-name">{label()}</span>
          </button>
        {/each}
      </div>
      <div class="hr"></div>
      <p class="field-label" style="margin-bottom:var(--space-3)">{m.mood_colours()}</p>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.mood_colours_note()}</p>
      <div class="mood-preset-grid" role="radiogroup" aria-label={m.mood_colours()}>
        {#each MOOD_PRESETS as [key, label] (key)}
          <button
            class="palette-swatch press"
            class:is-active={prefs.moodPreset === key}
            role="radio"
            aria-checked={prefs.moodPreset === key}
            data-mood-preset-pick={key}
            onclick={() => pickMoodPreset(key)}
          >
            <span class="swatch-preview" data-mood-swatch={key}></span>
            <span class="swatch-name">{label()}</span>
          </button>
        {/each}
      </div>
      <div class="hr"></div>
      <div class="pref-row">
        <span class="kit-row-title">{m.theme()}</span>
        <Segmented
          name={m.theme()}
          options={[
            { value: 'system', label: m.theme_system() },
            { value: 'light', label: m.theme_light() },
            { value: 'dark', label: m.theme_dark() },
          ]}
          value={prefs.theme}
          onChange={(v) => {
            prefs.theme = v as typeof prefs.theme;
          }}
        />
      </div>
      <div class="pref-row">
        <span class="kit-row-title">{m.language()}</span>
        <Segmented
          name={m.language()}
          options={[
            { value: 'system', label: m.theme_system() },
            { value: 'en', label: 'English' },
            { value: 'pl', label: 'Polski' },
          ]}
          value={prefs.language}
          onChange={setLanguage}
        />
      </div>
      <div class="hr"></div>
      <p class="field-label" style="margin-bottom:var(--space-3)">{m.settings_accessibility_pack()}</p>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.a11y_text_size_boost()}</span>
          <span class="kit-row-sub">{m.a11y_text_size_boost_sub()}</span>
        </span>
        <Switch
          checked={prefs.a11yTextSizeBoost}
          label={m.a11y_text_size_boost()}
          onChange={(v) => {
            prefs.a11yTextSizeBoost = v;
          }}
        />
      </div>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.a11y_legibility_boost()}</span>
          <span class="kit-row-sub">{m.a11y_legibility_boost_sub()}</span>
        </span>
        <Switch
          checked={prefs.a11yLegibilityBoost}
          label={m.a11y_legibility_boost()}
          onChange={(v) => {
            prefs.a11yLegibilityBoost = v;
          }}
        />
      </div>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.a11y_motion_reduce_override()}</span>
          <span class="kit-row-sub">{m.a11y_motion_reduce_override_sub()}</span>
        </span>
        <Switch
          checked={prefs.a11yMotionReduce}
          label={m.a11y_motion_reduce_override()}
          onChange={(v) => {
            prefs.a11yMotionReduce = v;
          }}
        />
      </div>
    </div>
  </ListCard>

  <SectionHeading text={m.settings_tracking()} />
  <!-- Tracking is several cards, not one: the navigable rows, tag groups,
       the four related toggles, and the metric picker each want a
       different shape (DIRECTION.md 2b), but sitting flush against each
       other with no heading between them read as one accidental slab
       rather than four deliberate ones (Alicja, on the live build).
       .stack-3 (components.css) already gives a run of siblings a gap
       between each - reused rather than a one-off margin per card. -->
  <div class="stack-3" data-settings-list>
    <ListCard>
      <ListRow
        key="scales"
        icon="heart"
        title={m.gender_scales()}
        subtitle={tickedNames || m.scales_none_ticked()}
        chevron={false}
        onclick={() => (scalesSheet = true)}
      >
        <!-- SH-103: chevronDown ("opens in place") rather than chevronRight
             ("navigates away"), so a sheet-opening row no longer looks
             identical to the href rows around it. -->
        {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
      </ListRow>
      <ListRow key="dimension" icon="stats" title={m.custom_dimension()} subtitle={m.custom_dimension_sub()} href="/settings/dimension" />
      <ListRow
        key="reminders"
        icon="bell"
        title={m.reminders()}
        subtitle={isWeb
          ? m.reminders_web_sub()
          : m.settings_reminders_sub({ count: String(activeReminders), state: prefs.checkInEnabled ? m.on() : m.off() })}
        href="/settings/reminders"
        chevron={false}
      >
        {#snippet trailing()}<Icon name={isWeb ? 'info' : 'chevronRight'} size={isWeb ? 18 : 20} />{/snippet}
      </ListRow>
      <!-- Ticket 51: the wrapped/on-this-day toggles and every live tile's
           kind switch live behind this one row, not in this card. -->
      <ListRow key="live-tiles" icon="grid" title={m.live_tiles_title()} subtitle={m.live_tiles_sub()} href="/settings/live-tiles" />
      <ListRow
        key="journey-anchor"
        icon="flag"
        title={m.journey_anchor_title()}
        subtitle={vocabulary.journeyAnchor
          ? m.journey_anchor_row_sub_set({ name: vocabulary.journeyAnchor.name })
          : m.journey_anchor_row_sub_unset()}
        href="/settings/journey-anchor"
      />
      <ListRow key="affirmations" icon="sparkle" title={m.affirmations_row_title()} subtitle={m.affirmations_row_sub()} href="/settings/affirmations" />
      <ListRow key="body-regions" icon="heart" title={m.body_regions_row_title()} subtitle={m.body_regions_row_sub()} href="/settings/body-regions" />
      <ListRow key="streak-goal" icon="sparkle" title={m.streak_goal_title()} subtitle={m.streak_goal_row_sub()} href="/settings/streak-goal" />
      <ListRow key="journaling-pause" icon="moon" title={m.journaling_pause_title()} subtitle={m.journaling_pause_row_sub()} href="/settings/journaling-pause" />
    </ListCard>

    <ListCard>
      <div class="kit-row settings-unit-row" style="cursor:default">
        <span class="kit-row-ico"><Icon name="ruler" size={22} /></span>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.settings_measurement_unit_title()}</span>
          <span class="kit-row-sub">{m.settings_measurement_unit_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Segmented
            name={m.settings_measurement_unit_title()}
            key="measurement-unit"
            compact
            options={[
              { value: 'cm', label: m.measurement_unit_cm() },
              { value: 'in', label: m.measurement_unit_in() }
            ]}
            value={prefs.measurementUnit}
            onChange={(v) => (prefs.measurementUnit = v as typeof prefs.measurementUnit)}
          />
        </span>
      </div>
    </ListCard>

    <ListCard>
      <div class="kit-row" style="cursor:default">
        <span class="kit-row-ico"><Icon name="tag" size={22} /></span>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.tag_groups()}</span>
          <span class="kit-row-sub">{m.tag_groups_sub()}</span>
        </span>
      </div>
      <div class="taggroup-toggles">
        {#each vocabulary.tagGroups as g (g.key)}
          <div class="spread taggroup-row">
            <span>{g.name}</span>
            <Switch checked={g.enabled} label={m.settings_taggroup_switch({ group: g.name })} onChange={(v) => journal.tags.setGroupEnabled(g.key, v)} />
          </div>
        {/each}
        <a class="manage-tags-link" href="/settings/tags">{m.manage_tags()} <Icon name="chevronRight" size={16} /></a>
      </div>
    </ListCard>

    <!-- Two related toggles as one card with a hairline between, rather
         than two boxes stacked with a margin apart - DIRECTION.md's
         decision 3: "tighter, not airier", and the shape One rounded card
         repeated is the thing 2b calls generic; a run of the same-shaped
         row is not that, it is one surface with several related facts on
         it. Each stays a plain div rather than a ListRow: the row itself
         does nothing when tapped, the switch inside it does, and a row
         that acted too would make the switch a button inside a button. -->
    <ListCard>
      <div class="kit-row" data-entry-nudges>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.entry_nudges()}</span>
          <span class="kit-row-sub">{m.entry_nudges_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.entryNudges}
            label={m.entry_nudges()}
            onChange={(v) => {
              prefs.entryNudges = v;
            }}
          />
        </span>
      </div>
      <div class="kit-row" data-guided-prompts>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.guided_prompts()}</span>
          <span class="kit-row-sub">{m.guided_prompts_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.guidedPromptsEnabled}
            label={m.guided_prompts()}
            onChange={(v) => {
              prefs.guidedPromptsEnabled = v;
            }}
          />
        </span>
      </div>
      <div class="kit-row" data-roadmap-milestone-sync>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.roadmap_milestone_sync_title()}</span>
          <span class="kit-row-sub">{m.roadmap_milestone_sync_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.roadmapMilestoneSyncEnabled}
            label={m.roadmap_milestone_sync_title()}
            onChange={(v) => {
              prefs.roadmapMilestoneSyncEnabled = v;
            }}
          />
        </span>
      </div>
      <!-- Wrapped's and on-this-day's toggles were here too until ticket 51
           moved them, with their notification sub-toggles and the permission
           notice, behind the Live tiles and notices row above. -->
    </ListCard>

    <ListCard>
      <ListRow
        key="metric"
        icon="palette"
        title={m.home_cal_colour()}
        subtitle={`${m.coloured_by()} ${metricName}`}
        chevron={false}
        onclick={() => (metricSheet = true)}
      >
        {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
      </ListRow>
    </ListCard>
  </div>

  <SectionHeading text={m.settings_privacy()} />
  <ListCard>
    <ListRow key="security" icon="shield" title={m.settings_security_row()} subtitle={m.settings_security_sub()} href="/settings/security" />
    <ListRow
      key="disguise"
      icon="shield"
      title={m.disguise_row()}
      subtitle={prefs.disguise ? m.settings_disguise_on() : m.off()}
      chevron={false}
      onclick={() => (disguiseSheet = true)}
    >
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
    <ListRow
      key="export"
      icon="download"
      title={m.export_import()}
      subtitle={backupAge != null ? m.settings_backup_age({ days: m.n_days({ n: backupAge }) }) : m.settings_backup_none()}
      href="/settings/export"
    />
    <ListRow key="journal-book" icon="book" title={m.journal_book_row()} subtitle={m.journal_book_row_sub()} href="/settings/journal-book" />
    <ListRow key="trash" icon="trash" title={m.trash_title()} subtitle={m.trash_row_sub()} href="/settings/trash" />
    <ListRow
      key="about"
      icon="info"
      title={m.about()}
      subtitle={m.settings_about_sub()}
      chevron={false}
      onclick={() => (aboutSheet = true)}
    >
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
  </ListCard>
  <p class="muted small" style="text-align:center;margin-top:var(--space-5)">
    <span translate="no">{m.app_name()}</span> · {m.footer_note()}
  </p>

  <Sheet bind:open={scalesSheet} title={m.gender_scales()}>
    <h3>{m.gender_scales()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.scales_note()}</p>
    <!-- The same list the first run draws, built once. This one carries the
         way to a custom scale, because Settings is a place somebody can be
         sent away from and come back to. -->
    <ScaleChecklist ticked={prefs.activeScales} onToggle={toggleScale} addHref="/settings/dimension" />
  </Sheet>

  <Sheet bind:open={metricSheet} title={m.home_cal_colour()}>
    <h3>{m.home_cal_colour()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.metric_note()}</p>
    <!-- Hand-written rather than a ListRow (ticket 18): this is a
         mutually-exclusive pick, and ListRow's `checked` draws
         Check.svelte's box, which that component documents as
         deliberately never a radio's circle - the wrong shape for "one of
         these", not the tickable "any of these" a checkbox says. -->
    <ListCard>
      <!-- The ticked scales, which is what Home's and the calendar's own
           pickers offer. It listed every scale, so this was the one place a
           metric could be set to something no other picker would show and
           `reference.activeMetric` now resolves straight back to mood - a
           choice that looked like it did nothing. A picker offers what the
           app can honour (phase 5 ticket 35). -->
      {#each [{ key: null, name: m.mood() }, ...vocabulary.activeDimensions] as d (d.key ?? 'mood')}
        <button
          type="button"
          class="kit-row"
          onclick={() => {
            selectMetric(d.key);
            metricSheet = false;
          }}
        >
          <span class="kit-row-text"><span class="kit-row-title">{d.name}</span></span>
          {#if vocabulary.activeMetric === (d.key ?? 'mood')}<Icon name="check" size={20} />{/if}
        </button>
      {/each}
    </ListCard>
  </Sheet>

  <Sheet bind:open={disguiseSheet} title={m.disguise_row()}>
    <h3>{m.disguise_row()}</h3>
    <div class="stack-3">
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.disguise_app_title()}</span>
          <span class="kit-row-sub">
            {isAndroid() ? m.disguise_app_sub_android() : m.disguise_app_sub_web()}
          </span>
        </span>
        <Switch
          checked={prefs.disguise}
          label={m.disguise_app_title()}
          onChange={(v) => {
            prefs.disguise = v;
          }}
        />
      </div>
      <div class="disguise-preview" class:is-on={prefs.disguise}>
        <span class="disguise-icon"><Icon name="book" size={22} /></span>
        <span>
          <!-- The disguise's own name, from the module every surface that
               names the app reads (disguise/identity.ts). An expression
               rather than a text node for the reason DecoyNotes gives:
               check-copy counts bare text as untranslated, and this word
               is the same in every language. -->
          <strong>{DECOY_NAME}</strong><br />
          <span class="muted small">{isAndroid() ? m.disguise_preview_android() : m.disguise_preview_web()}</span>
        </span>
      </div>
      <!-- Web only: on Android the launcher alias switches at once, so there
           is nothing to warn about. Here the manifest is the browser's to
           refresh, and a promise the app cannot keep is worse than none. -->
      {#if !isAndroid()}
        <p class="muted small">{m.disguise_installed_note()}</p>
      {/if}
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.lock_on_leave_title()}</span>
          <span class="kit-row-sub">
            {m.lock_on_leave_sub()}{prefs.appLock ? '' : ` · ${m.lock_needs_app_lock()}`}
          </span>
        </span>
        <Switch
          checked={prefs.lockOnLeave}
          label={m.lock_on_leave_title()}
          onChange={(v) => {
            prefs.lockOnLeave = v;
          }}
        />
      </div>
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.quick_exit_title()}</span>
          <span class="kit-row-sub">
            {isAndroid() ? m.quick_exit_sub_android() : m.quick_exit_sub_web()}{prefs.appLock
              ? ''
              : ` · ${m.quick_exit_no_lock()}`}
          </span>
        </span>
        <Switch
          checked={prefs.quickExit}
          label={m.quick_exit_title()}
          onChange={(v) => {
            prefs.quickExit = v;
          }}
        />
      </div>
    </div>
  </Sheet>

  <Sheet bind:open={aboutSheet} title={m.about()}>
    <h3>{m.about()}</h3>
    <div class="stack-3">
      <p class="small">
        <span translate="no">{m.app_name()}</span>
        <span class="muted">· {m.version()} <span translate="no" data-app-version>{__APP_VERSION__}</span></span>
      </p>
      <p class="small">{m.about_license()}</p>
      <p class="small">
        <strong>{m.about_no_network_title()}</strong> {m.about_no_network_body()}
      </p>
    </div>
  </Sheet>
</div>
