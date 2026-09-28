<script lang="ts">
  import { rovingRadio } from '$lib/components/rovingRadio';
  /* Settings, on the surface kit (phase 5 ticket 24), in five open areas
     since ticket 277.

     The rows that carry a Switch or a Segmented instead of a chevron stay
     hand-written in the kit's own row classes (ticket 16: `.kit-row.is-static`
     also drops the row's cursor and its :active wash). */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { setLocale, getLocale } from '$lib/paraglide/runtime';
  import { backupAgeDays } from '$lib/data/backupHealth';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { bootState } from '$lib/stores/boot.svelte';
  import { accessModeHasSecret } from '$lib/data/journal-access-mode';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Mark from '$lib/components/Mark.svelte';
  import DisguisePreview from '$lib/components/DisguisePreview.svelte';
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
  import { changePalette, changeTheme } from '$lib/motion/paletteChange';
  import { paletteRing } from '$lib/motion/paletteRing';

  /* Keyed, not worded, so the swatch names translate with everything else. */
  const PALETTES: [string, () => string][] = [
    ['trans', m.palette_trans], ['nonbinary', m.palette_nonbinary], ['genderfluid', m.palette_genderfluid],
    ['bisexual', m.palette_bisexual], ['lesbian', m.palette_lesbian], ['pansexual', m.palette_pansexual],
    ['rainbow', m.palette_rainbow], ['agender', m.palette_agender],
    ['gaymen', m.palette_gaymen], ['genderqueer', m.palette_genderqueer], ['intersex', m.palette_intersex],
    ['asexual', m.palette_asexual], ['demiboy', m.palette_demiboy], ['demigirl', m.palette_demigirl],
    ['trigender', m.palette_trigender], ['polish', m.palette_polish],
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
  let moodSheet = $state(false);
  let languageSheet = $state(false);
  let a11ySheet = $state(false);
  let tagGroupsSheet = $state(false);

  /* The readings on the rows that open a sheet (ticket 277): what each is
     set to, so the hub says it without the sheet being opened. */
  let moodName = $derived(MOOD_PRESETS.find(([key]) => key === prefs.moodPreset)?.[1]());
  let languageName = $derived(
    prefs.language === 'en' ? 'English' : prefs.language === 'pl' ? 'Polski' : m.theme_system()
  );
  let a11yOn = $derived(
    [
      prefs.a11yTextSizeBoost && m.a11y_text_size_boost(),
      prefs.a11yLegibilityBoost && m.a11y_legibility_boost(),
      prefs.a11yMotionReduce && m.a11y_motion_reduce_override()
    ]
      .filter(Boolean)
      .join(', ')
  );
  let enabledTagGroups = $derived(
    vocabulary.tagGroups
      .filter((g) => g.enabled)
      .map((g) => g.name)
      .join(', ')
  );

  function setLanguage(v: string) {
    prefs.language = v as typeof prefs.language;
    const target = v === 'system' ? ((navigator.language || 'en').startsWith('pl') ? 'pl' : 'en') : (v as 'en' | 'pl');
    if (target !== getLocale()) setLocale(target); // reloads; all state is persisted
  }

  function pickPalette(key: string) {
    if (prefs.palette !== key) changePalette(() => { prefs.palette = key; });
  }

  function pickMoodPreset(key: string) {
    prefs.moodPreset = key;
  }

  let hasAccessSecret = $derived(accessModeHasSecret(bootState.accessMode, isAndroid()));

  const SITE_URL = 'https://engender.dev/';
  let guideUrl = $derived(`${SITE_URL}${getLocale()}/guide/`);

  /* Ticket ux/06: ships disabled - an empty URL is what makes the row below
     render as "coming soon" rather than a live link. Setting this to the
     real Ko-fi URL is the whole follow-up; no markup changes with it. */
  const KOFI_URL = '';

  /* The modes/entry-templates sheets raise from here (audit item 6):
     `?raise=` is what their old standalone-screen addresses' redirects
     hand off (settings/presentations, settings/entry-templates), since
     only a mounted screen can reach ui.svelte.ts - a +page.ts load()
     cannot. Read once and stripped straight back off, so the sheet's own
     open state, not the URL, is what a later close answers to; a plain
     visit to /settings carries no such param and this is a no-op. */
  $effect(() => {
    const raise = page.url.searchParams.get('raise');
    if (raise === 'modes' || raise === 'templates') {
      ui.raisedManager = raise;
      void replaceRoute('/settings');
    }
  });
</script>

<div class="screen">
  <!-- Rule 7's third case, chrome (carpet 25). The title was hidden here
       from ticket 24 until the field existed: a visible "Settings" sitting
       on the page directly above "Appearance" was two headers stacked
       (Alicja, 2026-08-25), which a title on a block of the flag's colour
       is not - it is the shape every deep screen in the app already draws,
       and this screen was the one arriving with no top at all.

       Back to Today, since the phone's gear is in Today's foot (ADR-0076),
       and through smartBack for the rail and for every deep link that
       reaches here. On the 1024px shell the control is dropped by
       components.css: from a fifth row at the rail's foot there is nothing
       for it to point at. -->
  <ScreenHeader title={m.nav_settings()} back="/" chrome />

  <!-- Five named areas, every one open (ticket 277). They were three
       accordions, which hid most of the screen behind a tap and still ran
       to 3735px open at 390. Rows now carry a second line only where it is
       a reading - a value, a count, a state - and anything that is more
       than one control opens as a sheet from a row of its own, so the hub
       is a list of names and what each is set to. -->
  <SectionHeading text={m.settings_appearance()} />
  <!-- On the page rather than in a card, and with no dropdown in front of
       it: a flag is a block of its own (rule 13), the grid is the one setup
       draws (screens.css), and the card's padding left each flag too narrow
       for its name. The frame travels between flags (paletteRing). -->
  <div class="palette-grid" role="radiogroup" use:rovingRadio use:paletteRing aria-label={m.colour_palette()}>
    <span class="palette-selection-ring" aria-hidden="true"></span>
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
  <ListCard>
    <div class="kit-row settings-unit-row" style="cursor:default">
      <span class="kit-row-ico"><Icon name="sun" size={22} /></span>
      <span class="kit-row-text">
        <span class="kit-row-title">{m.theme()}</span>
      </span>
      <span class="kit-row-trail">
        <Segmented
          name={m.theme()}
          key="theme"
          compact
          options={[
            { value: 'system', label: m.theme_system() },
            { value: 'light', label: m.theme_light() },
            { value: 'dark', label: m.theme_dark() },
          ]}
          value={prefs.theme}
          onChange={(v) => {
            if (prefs.theme !== v) changeTheme(() => { prefs.theme = v as typeof prefs.theme; });
          }}
        />
      </span>
    </div>
    <ListRow key="mood-colours" icon="sparkle" title={m.mood_colours()} subtitle={moodName} chevron={false} onclick={() => (moodSheet = true)}>
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
    <ListRow key="language" icon="globe" title={m.language()} subtitle={languageName} chevron={false} onclick={() => (languageSheet = true)}>
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
    <ListRow key="accessibility" icon="eye" title={m.settings_accessibility_pack()} subtitle={a11yOn || m.off()} chevron={false} onclick={() => (a11ySheet = true)}>
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
  </ListCard>

  <SectionHeading text={m.settings_tracking()} />
  <!-- What an entry asks and how it reads back. `data-settings-list` stays on
       this area: the walkthrough waits on it as the screen's own settle. -->
  <div data-settings-list>
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
      <ListRow key="dimension" icon="stats" title={m.custom_dimension()} href="/settings/dimension" />
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
      <ListRow key="tag-groups" icon="tag" title={m.tag_groups()} subtitle={enabledTagGroups || m.off()} chevron={false} onclick={() => (tagGroupsSheet = true)}>
        {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
      </ListRow>
      <div class="kit-row settings-unit-row" style="cursor:default">
        <span class="kit-row-ico"><Icon name="ruler" size={22} /></span>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.settings_measurement_unit_title()}</span>
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
      <!-- ADR-0043: the manual way into cycle tracking, for someone no
           testosterone regimen already surfaces it for. The switch only
           decides whether navigation names cycle tracking; turning it off
           touches no record and no deep link. -->
      <div class="kit-row" data-cycle-tracking-toggle>
        <span class="kit-row-ico"><Icon name="curve" size={22} /></span>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.cycle_tracking_toggle_title()}</span>
          <!-- The one explanatory line the hub keeps: without it an off
               switch next to a cycle area that still shows reads as broken
               (ADR-0043's automatic half). -->
          <span class="kit-row-sub">{m.cycle_tracking_toggle_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.cycleTrackingEnabled}
            label={m.cycle_tracking_toggle_title()}
            onChange={(v) => {
              prefs.cycleTrackingEnabled = v;
            }}
          />
        </span>
      </div>
    </ListCard>
  </div>

  <SectionHeading text={m.settings_reminders()} />
  <!-- The app speaking up, and the words it uses when it does. -->
  <ListCard>
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
    <!-- One screen over the unprompted registry (deepening ticket 09): what
         may show on Today and what may buzz the phone are two questions
         about the same list. `zap` rather than a second bell beside the
         reminders row. -->
    <ListRow key="notifications" icon="zap" title={m.notif_title()} href="/settings/notifications" />
    <ListRow key="journaling-pause" icon="moon" title={m.journaling_pause_title()} href="/settings/journaling-pause" />
    <ListRow key="affirmations" icon="sparkle" title={m.affirmations_row_title()} href="/settings/affirmations" />
  </ListCard>

  <SectionHeading text={m.settings_lists()} />
  <!-- The reference areas (ADR-0084): each is spent on other screens - the
       entry editor's chips, the body map, Look back's reading, the bands
       behind the milestone rail - and created only here. Modes and entry
       templates raise as sheets over this screen through their redirects. -->
  <ListCard>
    <ListRow key="presentations" icon="palette" title={m.presentations_title()} href="/settings/presentations" />
    <ListRow key="entry-templates" icon="grid" title={m.entry_templates_title()} href="/settings/entry-templates" />
    <ListRow key="body-regions" icon="heart" title={m.body_regions_row_title()} href="/settings/body-regions" />
    <ListRow key="words" icon="note" title={m.words_ignored_title()} href="/settings/words" />
    <ListRow key="eras" icon="columns" title={m.eras_title()} href="/settings/eras" />
  </ListCard>

  <SectionHeading text={m.settings_privacy()} />
  <ListCard>
    <ListRow key="security" icon="shield" title={m.settings_security_row()} href="/settings/security" />
    <!-- Beside security (phase 10 redesign ticket 31): the list is the
         no-network claim made concrete, and setup's step promises this row
         is here. -->
    <ListRow key="permissions" icon="key" title={m.settings_permissions_row()} href="/settings/permissions" />
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
    <ListRow key="journal-book" icon="book" title={m.journal_book_row()} href="/settings/journal-book" />
    <ListRow key="trash" icon="trash" title={m.trash_title()} href="/settings/trash" />
  </ListCard>

  <!-- No heading: two rows about the app rather than a setting of it. Ko-fi
       stays its own row, not folded into the About sheet (ticket ux/06). -->
  <ListCard>
    <ListRow key="about" icon="info" title={m.about()} chevron={false} onclick={() => (aboutSheet = true)}>
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
    <ListRow
      key="kofi"
      icon="heart"
      title={m.kofi_row()}
      subtitle={KOFI_URL ? m.kofi_row_sub() : m.kofi_coming_soon()}
      static={!KOFI_URL}
      {...(KOFI_URL ? { href: KOFI_URL, target: '_blank', rel: 'noreferrer' } : {})}
    />
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
      <div class="spread">
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
      <!-- The same block setup's last question draws (ticket 32). -->
      <DisguisePreview on={prefs.disguise} />
      <!-- Where the mode has no secret to challenge with, the switch is
           inert and the suffix says why (UI/UX ticket 09). The destination
           this row's counterpart on the Security screen carries is
           deliberately not repeated here: a link small enough to sit inside
           the sub-line is under the 48px floor, and rebuilding this
           hand-written row as a kit row is a visual change this copy ticket
           does not make. -->
      <div class="spread">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.lock_on_leave_title()}</span>
          <span class="kit-row-sub">
            {m.lock_on_leave_sub()}{hasAccessSecret ? '' : ` · ${m.lock_needs_secret()}`}
          </span>
        </span>
        <Switch
          checked={prefs.lockOnLeave}
          label={m.lock_on_leave_title()}
          disabled={!hasAccessSecret}
          onChange={(v) => {
            prefs.lockOnLeave = v;
          }}
        />
      </div>
      <div class="spread">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.quick_exit_title()}</span>
          <span class="kit-row-sub">
            {isAndroid() ? m.quick_exit_sub_android() : m.quick_exit_sub_web()}{hasAccessSecret
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

  <Sheet bind:open={moodSheet} title={m.mood_colours()}>
    <h3>{m.mood_colours()}</h3>
    <div class="mood-preset-grid" role="radiogroup" use:rovingRadio aria-label={m.mood_colours()}>
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
  </Sheet>

  <Sheet bind:open={languageSheet} title={m.language()}>
    <h3>{m.language()}</h3>
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
  </Sheet>

  <Sheet bind:open={a11ySheet} title={m.settings_accessibility_pack()}>
    <h3>{m.settings_accessibility_pack()}</h3>
    <div class="stack-3">
      <div class="spread">
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
      <div class="spread">
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
      <div class="spread">
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
  </Sheet>

  <Sheet bind:open={tagGroupsSheet} title={m.tag_groups()}>
    <h3>{m.tag_groups()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.tag_groups_sub()}</p>
    <div class="stack-3">
      {#each vocabulary.tagGroups as g (g.key)}
        <div class="spread">
          <span class="kit-row-title">{g.name}</span>
          <Switch checked={g.enabled} label={m.settings_taggroup_switch({ group: g.name })} onChange={(v) => journal.tags.setGroupEnabled(g.key, v)} />
        </div>
      {/each}
      <a class="manage-tags-link" href="/settings/tags">{m.manage_tags()} <Icon name="chevronRight" size={16} /></a>
    </div>
  </Sheet>

  <Sheet bind:open={aboutSheet} title={m.about()}>
    <div class="about-content">
      <header class="about-identity">
        <!-- The icon, in the flag this person picked: the white tile and
             its black edge, because what this row is showing is the app's
             own icon beside its own name and version, and the tile's edge is
             not optional anywhere the drawing has an outside (Alicja,
             2026-09-21: "its supposed to be black always"). Absent under
             disguise, which is Mark's own answer - what is left is the name
             in type, which is what every surface carrying the mark falls
             back to (ADR-0014). -->
        <Mark size={64} crop="tile" />
        <div class="about-identity-copy">
          <h2 translate="no">{m.app_name()}</h2>
          <p class="about-version">
            {m.version()}
            <span translate="no" data-app-version>{__APP_VERSION__}</span>
          </p>
        </div>
      </header>

      <p class="about-license">{m.about_license()}</p>

      <section class="about-privacy">
        <Icon name="shield" size={22} />
        <div class="about-privacy-copy">
        <!-- Platform copy (UI/UX ticket 09): the no-requests claim is
             Android's, bought by holding no internet permission. The web
             app is itself something the browser downloads, so its sentence
             is about what is sent rather than what is fetched. -->
          <h3>{isAndroid() ? m.about_no_network_title() : m.about_no_network_web_title()}</h3>
          <p>{isAndroid() ? m.about_no_network_body() : m.about_no_network_web_body()}</p>
        </div>
      </section>

      <p class="about-attribution">{m.about_attribution()}</p>

      <nav class="about-links">
        <a href={SITE_URL} target="_blank" rel="noreferrer">
          <Icon name="globe" size={20} />
          <span>{m.about_site_link()}</span>
        </a>
        <a href={guideUrl} target="_blank" rel="noreferrer">
          <Icon name="book" size={20} />
          <span>{m.about_guide_link()}</span>
        </a>
      </nav>
    </div>
  </Sheet>
</div>

<style>
  .about-content {
    display: grid;
    gap: var(--space-4);
  }

  .about-identity {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: color-mix(in oklab, var(--accent) 9%, var(--surface));
  }

  .about-identity-copy {
    min-width: 0;
  }

  .about-identity h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  .about-version {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: var(--space-2) 0 0;
    color: var(--text-2);
    font-size: var(--text-sm);
  }

  [data-app-version] {
    padding: 2px var(--space-2);
    border-radius: var(--r-block);
    background: var(--surface-2);
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .about-license,
  .about-attribution {
    margin: 0;
    color: var(--text-2);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .about-privacy {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--surface-2);
    color: var(--accent);
  }

  .about-privacy-copy {
    color: var(--text);
  }

  .about-privacy h3 {
    margin: 0 0 var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: var(--weight-display);
    line-height: 1.35;
  }

  .about-privacy p {
    margin: 0;
    color: var(--text-2);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .about-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .about-links a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: 0;
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-align: center;
    text-decoration: none;
  }

  .about-links a:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  /* The frame that travels between flags: the chosen block's own 3px
     --text frame (screens.css), lifted off the block and moved, so a pick
     reads as the one frame going somewhere rather than one going out and
     another coming in. paletteRing sizes it to the block. */
  .palette-selection-ring {
    position: absolute;
    top: 0;
    left: 0;
    border: 3px solid var(--text);
    border-radius: var(--r-block);
    box-sizing: border-box;
    pointer-events: none;
    opacity: 0;
    z-index: 1;
  }

  .palette-selection-ring:global(.is-placed) {
    opacity: 1;
    transition: transform var(--dur-slow) var(--ease-in-out);
  }

  :global(html[data-palette-transition]) .palette-selection-ring {
    transition: none;
  }

  :global(.palette-grid:has(.palette-selection-ring.is-placed) .palette-swatch.is-active .swatch-preview) {
    outline-color: transparent;
  }
</style>
