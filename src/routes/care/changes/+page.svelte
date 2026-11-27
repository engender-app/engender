<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  /* NoticedAxis shows recorded dates before any group opens. Keep
     personal effects and side effects in the axis and their own
     sections in the log. Literature bands stay with the individual
     change they describe. A recorded date never implies a band.

     A category opens its own height and moves the rows below it.
     Reduced motion applies the open state immediately. The cycle
     block keeps its own availability gate. */
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import {
    effectTier,
    effectWindowShape,
    hrtAnchor,
    literatureWindow,
    literatureWindowDays,
    type LiteratureSourceKey
  } from '$lib/data/personalEffectWindow';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { offeredEffectTypes } from '$lib/data/effectPicker';
  import { RETIRED_PERSONAL_EFFECT_KEYS } from '$lib/data/vocabulary/retiredEffects';
  import { fmtDay } from '$lib/data/dates';
  import {
    crossesCalendarYear,
    todayEpochDay,
    epochDayFromDateInputValue,
    epochDayFromDateInputValueOrToday,
    dateInputValueFromEpochDay
  } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { writer } from '$lib/stores/attempt.svelte';
  import { severityName } from '$lib/data/vocabulary/labels';
  import type { PersonalEffectCatalogEntry, SideEffect } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { collapse, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  import Switch from '$lib/components/Switch.svelte';
  import EffectsTimeline from '$lib/components/EffectsTimeline.svelte';
  import NoticedAxis from '$lib/components/NoticedAxis.svelte';
  import type { NoticedChange, NoticedChangeKind } from '$lib/data/noticedAxis';
  import {
    EFFECT_DIRECTIONS,
    effectDirectionLabel,
    type EffectDirectionGroup
  } from '$lib/data/effectDirections';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  const SEVERITIES = [1, 2, 3, 4, 5];

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.rows);
  /* The anchor is HRT's own start, not whichever episode is active right
     now and not the first episode of any drug: the HRT start the person set, else the earliest HRT
     episode. Its drug decides which bands may be drawn at all,
     so the whole anchor is held rather than only its start day. */
  let anchor = $derived(hrtAnchor(episodes, prefs.hrtStartEpochDay));
  let anchorEpochDay = $derived(anchor?.startEpochDay ?? null);

  let markersQuery = liveList((j) => j.personalEffects.getMarkers());
  let markers = $derived(markersQuery.rows);
  const markerFor = (effect: string) => markers.find((marker) => marker.effect === effect) ?? null;

  const today = $derived(currentDay());

  /* The catalogue a hidden effect or a disabled category has already
     removed - what the timeline and
     the "mark a change" list offer. A retired built-in is left
     out too unless it is already marked, which keeps its row and its mark.
     The fuller list lives only in the manage sheet below. */
  let visibleEffects = $derived(
    offeredEffectTypes(vocabulary.visiblePersonalEffectTypes, new Set(markers.map((marker) => marker.effect)))
  );

  /* Whether an effect has a band at all is decided once, here, and read by
     both the chart and the editor sheet's caption - asking
     literatureWindowDays in one place and the predicate behind it in the
     other would be two decisions free to drift apart. Null before there is
     any anchor to ask about. */
  let bands = $derived(
    anchor == null ? null : new Map(visibleEffects.map((e) => [e.key, literatureWindowDays(e.key, anchor)] as const))
  );

  const directionOf = (e: PersonalEffectCatalogEntry): EffectDirectionGroup => e.direction ?? 'other';

  /* Category, then direction, is the coarse control; collapsed by default so a new journal's screen stays no
     longer than the eight-row screen this replaces - the acceptance
     criterion this file exists to keep. Keyed by direction and category
     together, since the same category groups separately under each
     direction. */
  let expandedGroups = $state(new Set<string>());
  const groupKey = (direction: EffectDirectionGroup, categoryKey: string | null) => `${direction}::${categoryKey ?? 'none'}`;
  function toggleGroup(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedGroups = next;
  }

  /* What the literature says sits behind one disclosure, closed on every visit, so the person's own markers are what
     the screen shows first. The same state opens the timelines' bands, the
     explanation above the groups and the sentence in the editor sheet: one
     question, asked once, wherever it is asked. */
  let literatureOpen = $state(false);
  let hasBands = $derived(visibleEffects.some((effect) => bands?.get(effect.key) != null));

  function timelineRowsFor(effects: PersonalEffectCatalogEntry[]) {
    return effects.map((e) => ({
      key: e.key,
      label: e.name,
      onset: bands?.get(e.key)?.onset ?? null,
      completion: bands?.get(e.key)?.completion ?? null,
      markerDay: markerFor(e.key)?.firstNoticedEpochDay ?? null
    }));
  }

  /* One whole-sentence message per window shape (no completion window, open-ended, or
     bounded) rather than concatenating parts - each is a full sentence in its own right, so
     nothing here has to guess how any other language would order the pieces.

     Null where the band is withheld, and nothing is said in its place: the sentence would
     be a timing claim about a hormone this person is not on, or about an effect the
     literature has no window for at all. */
  function windowCaption(key: string): string | null {
    if (bands?.get(key) == null) return null;
    const window = literatureWindow(key)!;
    const onsetMin = String(window.onsetMonths.min);
    const onsetMax = String(window.onsetMonths.max);
    /* Read inside the two branches that have one: a completion window is
       null on the no-completion shape, and pulling its min out above the
       switch would put the string "undefined" in a variable the sentence
       happens not to use. */
    switch (effectWindowShape(key)) {
      case 'no-completion':
        return m.effect_window_no_completion({ onsetMin, onsetMax });
      case 'open-completion':
        return m.effect_window_open_completion({ onsetMin, onsetMax, compMin: String(window.completionMonths!.min) });
      case 'bounded':
        return m.effect_window_bounded({
          onsetMin,
          onsetMax,
          compMin: String(window.completionMonths!.min),
          compMax: String(window.completionMonths!.max)
        });
      case 'none':
        /* Unreachable behind the band gate above - a key with no window
           has no band either - and typed rather than dropped so a fourth
           shape cannot be added without this screen being told. */
        return null;
    }
  }

  /* Every band names where its figures came from and when they were last
     read against it. One source today, so one sentence; a second source
     gets its own case here and its own string. */
  function sourceLine(source: LiteratureSourceKey, reviewedOn: string): string {
    const day = epochDayFromDateInputValue(reviewedOn);
    const date = day === null ? reviewedOn : fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
    switch (source) {
      case 'soc8-appendix-c-table-1':
        return m.effects_literature_source({ date });
    }
  }

  /* The sources of the bands this screen can draw, once each. */
  let bandSources = $derived([
    ...new Map(
      visibleEffects.flatMap((effect) => {
        const window = bands?.get(effect.key) ? literatureWindow(effect.key) : undefined;
        return window ? [[`${window.source}@${window.reviewedOn}`, sourceLine(window.source, window.reviewedOn)] as const] : [];
      })
    ).values()
  ]);

  /** A community-listed effect has no published timing band. */
  function sourceCaption(e: PersonalEffectCatalogEntry): string | null {
    const tier = effectTier(e);
    if (tier === 2) return m.effect_source_community();
    return null;
  }

  /* The side effects half of the merged screen: the same list,
     the same editor sheet and the same cycle block that used to live on
     /health/side-effects, moved here whole. */
  let effectsQuery = liveList((j) => j.sideEffects.getSideEffects());

  /* Latched: a reserve must not put its placeholder back over the body. */
  let bodyRevealed = $state(false);
  $effect.pre(() => {
    if (bodyRevealed || episodesQuery.loading || markersQuery.loading || effectsQuery.loading) return;
    bodyRevealed = true;
  });
  const bodyEstimate = readReserve('care-changes');
  const rememberBody = (px: number) => rememberReserve('care-changes', px);
  let effects = $derived(effectsQuery.rows);

  /* `resolved` is the resolved day as a date input value, empty while the
     side effect is ongoing. */
  type SideEffectDraft = { id?: string; date: string; name: string; severity: string; resolved: string };

  const record = recordEditor<SideEffect, SideEffectDraft>({
    blank: () => ({ date: dateInputValueFromEpochDay(todayEpochDay()), name: '', severity: '', resolved: '' }),
    fromRecord: (effect) => ({
      id: effect.id,
      date: dateInputValueFromEpochDay(effect.epochDay),
      name: effect.name,
      severity: effect.severity === null ? '' : String(effect.severity),
      resolved: effect.resolvedEpochDay === null ? '' : dateInputValueFromEpochDay(effect.resolvedEpochDay)
    }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name || !resolvedAfterStart(draft)) return false;
      await journal.sideEffects.upsertSideEffect({
        id: draft.id,
        name,
        severity: draft.severity === '' ? null : Number(draft.severity),
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        resolvedEpochDay: epochDayFromDateInputValue(draft.resolved)
      });
    },
    remove: (id) => undoable((j) => j.sideEffects.deleteSideEffect(id)),
    findById: (id) => effects.find((effect) => effect.id === id)
  });

  /* Marking it resolved starts the end day on today, or on the start day
     when that is later, so the sheet never opens on a day it would refuse. */
  function setResolved(draft: SideEffectDraft, resolved: boolean) {
    if (!resolved) {
      draft.resolved = '';
      return;
    }
    if (draft.resolved !== '') return;
    const start = epochDayFromDateInputValueOrToday(draft.date);
    draft.resolved = dateInputValueFromEpochDay(Math.max(start, todayEpochDay()));
  }

  function resolvedAfterStart(draft: SideEffectDraft): boolean {
    const end = epochDayFromDateInputValue(draft.resolved);
    return end === null || end >= epochDayFromDateInputValueOrToday(draft.date);
  }

  const longDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** When it began and, once resolved, when it ended. */
  function sideEffectSpan(effect: SideEffect): string {
    if (effect.resolvedEpochDay === null) return m.side_effect_since({ date: longDay(effect.epochDay) });
    if (effect.resolvedEpochDay === effect.epochDay) return longDay(effect.epochDay);
    /* The year once when both ends share it, so a span fits on one line. */
    const from = crossesCalendarYear(effect.epochDay, effect.resolvedEpochDay)
      ? longDay(effect.epochDay)
      : fmtDay(effect.epochDay, { day: 'numeric', month: 'long' });
    return m.range_from_to({ from, to: longDay(effect.resolvedEpochDay) });
  }

  /* Second entry point into the appointment prep list: a one-tap add, seeded from what is
     already on screen, rather than a detour through that list's own editor. One add per
     tap, and a failed one says so (UI 17); a later tap is a second add on purpose. */
  const prepWrite = writer();
  async function addToAppointmentPrep(name: string) {
    if (!(await prepWrite.run(() => journal.checklists.addToStandaloneChecklist(m.appointment_prep_from_effect_item({ name })), m.write_failed()))) return;
    toast(m.appointment_prep_added_toast());
  }

  /* What the axis at the top of the screen draws: the changes that carry a
     marker, joined to their catalogue entry, and every side
     effect logged - the two kinds `NoticedChange.kind` tells
     apart. Personal effects are only the visible ones, the same catalogue
     the groups below and the chart inside them read, so hiding an effect or
     turning its category off takes it off the axis too. A marker for an
     effect that is no longer visible keeps its record and stops being
     drawn, which is what "hiding keeps everything already marked against
     it" already promises in the manage sheet. Side effects carry no such
     rule - there is no picker to hide them from - so every one logged is on
     the line. */
  let noticedChanges = $derived<NoticedChange[]>([
    ...visibleEffects.flatMap((effect) => {
      const marker = markerFor(effect.key);
      if (!marker) return [];
      return [
        {
          key: effect.key,
          kind: 'personal-effect' as const,
          label: effect.name,
          direction: directionOf(effect),
          firstNoticedEpochDay: marker.firstNoticedEpochDay
        }
      ];
    }),
    ...effects.map((effect) => ({
      key: effect.id,
      kind: 'side-effect' as const,
      label: effect.name,
      direction: 'other' as const,
      firstNoticedEpochDay: effect.epochDay,
      severity: severityName(effect.severity) ?? null
    }))
  ]);

  let editor = $state<{ effect: PersonalEffectCatalogEntry; date: string } | null>(null);

  function openEditor(effect: PersonalEffectCatalogEntry) {
    const existing = markerFor(effect.key);
    editor = { effect, date: dateInputValueFromEpochDay(existing?.firstNoticedEpochDay ?? today) };
  }

  /* A mark on the axis opens the same sheet its row in the list below
     opens, which is the whole of how editing is reachable from the
     drawing - the axis draws no marker the catalogue does not still carry,
     so a personal effect's key always finds one. A side effect's key is its
     own record id instead of a catalogue key, which is what `kind` is for:
     the two namespaces happen never to collide, but the kind is what this
     trusts to pick the sheet, not the shape of the key. */
  function openMark(key: string, kind: NoticedChangeKind) {
    if (kind === 'personal-effect') {
      const effect = visibleEffects.find((e) => e.key === key);
      if (effect) openEditor(effect);
    } else {
      const effect = effects.find((e) => e.id === key);
      if (effect) record.openEditor(effect);
    }
  }

  async function saveMarker() {
    if (!editor) return;
    const epochDay = epochDayFromDateInputValueOrToday(editor.date);
    await journal.personalEffects.upsertMarker({ effect: editor.effect.key, firstNoticedEpochDay: epochDay });
    editor = null;
  }

  async function clearMarker() {
    if (!editor) return;
    const key = editor.effect.key;
    editor = null;
    await journal.personalEffects.clearMarker(key);
  }

  let manageOpen = $state(false);
  /* A retired built-in has no hide toggle to offer: nothing
     brings it back, so a row for it here would be a switch that does
     nothing. */
  let managedEffects = $derived(vocabulary.personalEffectTypes.filter((e) => !RETIRED_PERSONAL_EFFECT_KEYS.has(e.key)));
  let newEffectName = $state('');
  let newEffectCategory = $state('');

  /* One type per tap (UI 17): a custom type can only be hidden, never
     deleted, so a double tap used to leave a duplicate for good. A failed
     add keeps the name and says so. */
  const effectTypeWrite = writer();
  async function addEffectType() {
    const name = newEffectName.trim();
    if (!name) return;
    if (!(await effectTypeWrite.run(() => journal.personalEffects.addCustomEffectType(name, newEffectCategory || null), m.write_failed()))) return;
    newEffectName = '';
    newEffectCategory = '';
  }
</script>

{#snippet groupBody(groupEffects: typeof visibleEffects)}
                    {#if anchorEpochDay !== null}
                      <EffectsTimeline
                        rows={timelineRowsFor(groupEffects)}
                        {anchorEpochDay}
                        todayEpochDay={today}
                        literature={literatureOpen}
                      />
                    {/if}
                    {#each groupEffects as e (e.key)}
                      {@const marker = markerFor(e.key)}
                      <ListRow
                        key={e.key}
                        title={e.name}
                        subtitle={marker
                          ? m.effect_first_noticed({
                              date: fmtDay(marker.firstNoticedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                            })
                          : m.effect_not_marked()}
                        chevron={false}
                        onclick={() => openEditor(e)}
                      />
                    {/each}
{/snippet}

<div class="screen">
  <!-- The intro stays in the body rather than becoming the header's
       subtitle. At 420 characters it is by some way the longest of these
       screens' intros, and in the header it is seven lines of lead before
       a single change is named. A subtitle is a line; this is a paragraph,
       and it belongs where a paragraph goes. The subtitle carries the
       shorter claim instead: what both halves of this screen
       are, and the "no grading and no advice" line the side effects screen
       used to open on, rather than losing it in the merge. -->
  <ScreenHeader title={m.effects_timeline()} back="/care">
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.side_effect_add()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
      <button class="icon-btn press" data-manage-effects aria-label={m.effect_manage_types()} onclick={() => (manageOpen = true)}>
        <Icon name="settings" size={20} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- Held at last visit's height until every read the body draws from has
       answered, then faded in. It swapped from a
       skeleton inside a resize wrapper: cut in at full opacity, and the
       effects gate inside it could still be answering, its rows one wrapper
       too deep for the screen's spacing. -->
  <ReadReserve ready={bodyRevealed} estimate={bodyEstimate} onrest={rememberBody} data-changes-body>
    <!-- What is true now, before the records: every
         change already marked, at the month it was noticed, on one line. -->
    <NoticedAxis
      changes={noticedChanges}
      {anchorEpochDay}
      todayEpochDay={today}
      onOpen={openMark}
    />

    <!-- Under the axis rather than over it, and no longer instead of it.
         This notice used to replace the whole screen, so a journal with no
         regimen in it saw nothing it had marked - and a person
         can notice a change before they are on anything, or restore a
         journal and not have typed a regimen back in yet. It reads as what
         a regimen would buy the line above it: months counted from a start
         day instead of calendar months. -->
    {#if anchorEpochDay == null}
      <Notice
        icon="sprout"
        key="effects-no-regimen"
        role={roleAt(activeFlag.roles, 0)}
        title={m.effects_no_regimen_title()}
        text={m.effects_no_regimen_body()}
        action={{ label: m.effects_no_regimen_action(), primary: true, href: '/care/regimen' }}
      />
    {/if}

    <!-- What the literature says, closed until asked for: no band is drawn and no timing
         sentence is shown before this opens, so what the person marked comes first. It
         replaces always-visible limitation line and its "About shaded bands" disclosure;
         the limitation now arrives with the bands it qualifies. Offered only while a band
         could be drawn at all. -->
    {#if hasBands}
      <div class="literature" data-bands-context transition:disclose>
        <button
          type="button"
          class="literature-toggle"
          aria-expanded={literatureOpen}
          data-literature-toggle
          onclick={() => (literatureOpen = !literatureOpen)}
        >
          <span>{m.effects_literature_disclosure()}</span>
          <span class="literature-chev">
            <Icon name="chevronDown" size={18} />
          </span>
        </button>
        {#if literatureOpen}
          <div class="disclosed" data-literature-body transition:disclose>
            <p class="muted small" style="margin-bottom:var(--space-2)">{m.effects_bands_limitation()}</p>
            <p class="muted small" style="margin-bottom:var(--space-2)">{m.effects_intro()}</p>
            <p class="muted small" style="margin-bottom:var(--space-2)">{m.effect_variability_notice()}</p>
            {#each bandSources as line (line)}
              <p class="muted small" data-literature-source style="margin-bottom:var(--space-2)">{line}</p>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#each EFFECT_DIRECTIONS as direction (direction)}
      {@const directionEffects = visibleEffects.filter((e) => directionOf(e) === direction)}
      {#if directionEffects.length}
        <SectionHeading text={effectDirectionLabel(direction)} />
        {#each vocabulary.effectCategories as cat, i (cat.key)}
          {@const groupEffects = directionEffects.filter((e) => e.categoryKey === cat.key)}
          {#if groupEffects.length}
            {@const key = groupKey(direction, cat.key)}
            {@const expanded = expandedGroups.has(key)}
            <div class="effect-group" data-effect-group={key}>
              <ListCard role={roleAt(activeFlag.roles, i)}>
                <ListRow onclick={() => toggleGroup(key)} aria-expanded={expanded} chevron={false} title={cat.name}>
                  {#snippet trailing()}
                    {m.effect_group_count({ count: groupEffects.length })}
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={20} />
                  {/snippet}
                </ListRow>
                {#if expanded}
                  <div class="effect-group-body" transition:disclose>
                    {@render groupBody(groupEffects)}
                  </div>
                {/if}
              </ListCard>
            </div>
          {/if}
        {/each}
        {@const uncategorized = directionEffects.filter((e) => e.categoryKey === null)}
        {#if uncategorized.length}
          {@const key = groupKey(direction, null)}
          {@const expanded = expandedGroups.has(key)}
          <div class="effect-group" data-effect-group={key}>
            <ListCard role={roleAt(activeFlag.roles, 0)}>
              <ListRow
                onclick={() => toggleGroup(key)}
                aria-expanded={expanded}
                chevron={false}
                title={m.effect_type_category_none()}
              >
                {#snippet trailing()}
                  {m.effect_group_count({ count: uncategorized.length })}
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={20} />
                {/snippet}
              </ListRow>
              {#if expanded}
                <div class="effect-group-body" transition:disclose>
                  {@render groupBody(uncategorized)}
                </div>
              {/if}
            </ListCard>
          </div>
        {/if}
      {/if}
    {/each}

    <!-- The other change hanging off this screen: a side effect
         and a change you were hoping for are both something you noticed
         after starting a regimen, and having them as two screens made the
         reader classify their own symptom before they could write it down.
         Its own heading, list, editor sheet and empty state - moved here
         whole from /health/side-effects, whose route was removed. -->
    <!-- The wrapper names nothing but the crop: a sign-off render needs one
         stable box around the heading and the list, the way `data-noticed-axis`
         already gives the axis one. -->
    <div data-side-effects-section>
      <SectionHeading text={m.side_effects()} />
      <ReadGate read={effectsQuery} variant="line" count={3}>
        {#snippet rows()}
          <ListCard role={roleAt(activeFlag.roles, 1)}>
            {#each [...effects].reverse() as effect (effect.id)}
              {@const severity = severityName(effect.severity)}
              {@const day = sideEffectSpan(effect)}
              <div class="rows-divide" transition:collapse>
                <ListRow
                  key={effect.id}
                  data-side-effect={effect.id}
                  icon="sprout"
                  title={effect.name}
                  subtitle={severity ? `${day} · ${severity}` : day}
                  chevron={false}
                  onclick={() => record.openEditor(effect)}
                />
              </div>
            {/each}
            <!-- The way to add one, at the end of the list it adds to: it was a button over
                 the timeline, named for a side effect. -->
            <div class="rows-divide">
              <ListRow
                key="add-own-change"
                data-add-own-change
                icon="plus"
                title={m.side_effect_add()}
                chevron={false}
                onclick={() => record.openEditor(null)}
              />
            </div>
          </ListCard>
        {/snippet}
        {#snippet empty()}
          <Notice
            icon="sprout"
            key="side-effects-empty"
            role={roleAt(activeFlag.roles, 1)}
            title={m.empty_log_title()}
            action={{ label: m.side_effect_add(), primary: true, onclick: () => record.openEditor(null) }}
          />
        {/snippet}
      </ReadGate>
    </div>
  </ReadReserve>

  <Sheet open={editor !== null} title={editor ? editor.effect.name : ''} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.effect.name}</h3>
      {@const caption = windowCaption(editor.effect.key)}
      {@const window = literatureWindow(editor.effect.key)}
      {@const source = sourceCaption(editor.effect)}
      {#if source}
        <p class="muted small" style="margin-bottom:var(--space-3)">{source}</p>
      {/if}
      <Field label={m.effect_first_noticed_label()} id="effect-date">
        {#snippet children(id)}
          <DatePicker name="effect-date" bind:value={editor!.date} {id} />
        {/snippet}
      </Field>
      <!-- The person's own date first, then the literature's timing for the
           same change behind the screen's one disclosure. -->
      {#if caption && window}
        <div class="literature" data-sheet-literature>
          <button
            type="button"
            class="literature-toggle"
            aria-expanded={literatureOpen}
            data-literature-toggle
            onclick={() => (literatureOpen = !literatureOpen)}
          >
            <span>{m.effects_literature_disclosure()}</span>
            <span class="literature-chev">
              <Icon name="chevronDown" size={18} />
            </span>
          </button>
          {#if literatureOpen}
            <div class="disclosed" data-literature-body transition:disclose>
              <p class="muted small" style="margin-bottom:var(--space-2)">{caption}</p>
              <p class="muted small" data-literature-source style="margin-bottom:var(--space-2)">
                {sourceLine(window.source, window.reviewedOn)}
              </p>
            </div>
          {/if}
        </div>
      {/if}
      <div class="stack-3">
        <button class="btn btn-primary" data-save-effect onclick={saveMarker}><span>{m.save()}</span></button>
        {#if markerFor(editor.effect.key)}
          <button class="btn btn-ghost" data-clear-effect onclick={clearMarker}><span>{m.effect_clear()}</span></button>
          <p class="muted small">{m.effect_clear_hint()}</p>
        {/if}
      </div>
    {/if}
  </Sheet>

  <RecordSheet
    {record}
    handle="side-effect"
    newTitle={m.side_effect_new_sheet()}
    editTitle={m.side_effect_edit_sheet()}
    saveLabel={m.save()}
    deleteLabel={m.delete()}
    canSave={resolvedAfterStart}
    confirm={{
      title: m.side_effect_delete_sheet(),
      question: (effect) => m.side_effect_delete_q({ name: effect.name }),
      hint: () => m.delete_undo_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.what_is_it_label()} id="side-effect-name">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()} class="input" {id} name="side-effect-name" placeholder={m.side_effect_name_placeholder()} bind:value={editor.name} />
        {/snippet}
      </Field>
      <Field label={m.side_effect_severity_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.side_effect_severity_label()}
            options={SEVERITIES.map((v) => ({ value: String(v), label: severityName(v) ?? String(v) }))}
            value={editor.severity}
            onChange={(v) => (editor.severity = v)}
          />
        {/snippet}
      </Field>
      <Field label={m.status_label()} legend>
        {#snippet children()}
          <div data-side-effect-status>
            <Segmented
              name={m.status_label()}
              options={[
                { value: 'ongoing', label: m.side_effect_ongoing() },
                { value: 'resolved', label: m.side_effect_resolved() }
              ]}
              value={editor.resolved === '' ? 'ongoing' : 'resolved'}
              onChange={(v) => setResolved(editor, v === 'resolved')}
            />
          </div>
        {/snippet}
      </Field>
      <Field label={m.started_label()} id="side-effect-date">
        {#snippet children(id)}
          <DatePicker name="side-effect-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      {#if editor.resolved !== ''}
        <div class="disclosed" transition:disclose>
          <Field label={m.side_effect_resolved_label()} id="side-effect-resolved">
            {#snippet children(id)}
              <DatePicker name="side-effect-resolved" bind:value={editor.resolved} {id} />
            {/snippet}
          </Field>
        </div>
      {/if}
    {/snippet}
    {#snippet extraActions(editor)}
      <button class="btn btn-soft" data-add-to-appointment-prep disabled={prepWrite.busy} onclick={() => addToAppointmentPrep(editor.name)}>
        <span>{m.appointment_prep_add_button()}</span>
      </button>
    {/snippet}
  </RecordSheet>

  <!-- One row shape, called from both branches below - it was written out
       twice (per-category, then again for the uncategorized group) before
       a code review named the duplication. `effectiveHidden` is passed in
       rather than recomputed here because the two branches derive it
       differently: a categorized effect also answers to its category's
       own Switch, an uncategorized one only ever answers to its own.
       Declared outside the Sheet below - a snippet declared as a direct
       child of a component is treated as an implicit prop for it. -->
  {#snippet managedEffectRow(e: PersonalEffectCatalogEntry, effectiveHidden: boolean)}
    <div class="rows-divide managed-tag" class:is-hidden={effectiveHidden}>
      <span class="managed-label">
        {e.name}{#if !e.builtIn}<span class="muted small"> · {m.custom_suffix()}</span>{/if}
      </span>
      {#if effectiveHidden}<span class="muted small">{m.tags_hidden()}</span>{/if}
      <button
        class="icon-btn"
        data-effect-type-hide={e.key}
        aria-label={e.hidden ? m.show_named_aria({ name: e.name }) : m.hide_named_aria({ name: e.name })}
        onclick={() => journal.personalEffects.setEffectTypeHidden(e.key, !e.hidden)}
      >
        <Icon name={e.hidden ? 'eye' : 'eyeOff'} size={16} />
      </button>
    </div>
  {/snippet}

  <!-- Saying you are done with this area. -->
  <AreaFinish group="effects" />

  <Sheet busy={effectTypeWrite.busy} open={manageOpen} title={m.effect_manage_types()} onClose={() => (manageOpen = false)}>
    <h3>{m.effects_categories_heading()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.effects_categories_intro()}</p>
    <div class="taggroup-toggles">
      {#each vocabulary.effectCategories as cat (cat.key)}
        <div class="spread taggroup-row">
          <span>{cat.name}</span>
          <Switch
            checked={cat.enabled}
            label={m.effect_category_switch({ category: cat.name })}
            onChange={(v) => journal.effectCategories.setCategoryEnabled(cat.key, v)}
          />
        </div>
      {/each}
    </div>

    <h3>{m.effect_manage_types()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.effect_manage_types_intro()}</p>
    <!-- Grouped the same way the timeline above groups them (by category), rather than one
         flat list of every effect the catalogue has - the two disagreeing about how these
         effects are organised was its own kind of confusing. A category's own Switch,
         above, already keeps every effect under it out of the timeline and the "mark a
         change" picker (visiblePersonalEffectTypes); shown here as effectively hidden too,
         rather than only in the two screens this one does not do the toggling for, so what
         a row says matches what the category switch already decided for it. Its own eye
         toggle stays live regardless - hiding it individually is a choice that should still
         stick once the category comes back on. -->
    {#each vocabulary.effectCategories as cat (cat.key)}
      {@const catEffects = managedEffects.filter((e) => e.categoryKey === cat.key)}
      {#if catEffects.length}
        <p class="field-label" style="margin:var(--space-3) 0 var(--space-2)">{cat.name}</p>
        <div class="managed-tags">
          {#each catEffects as e (e.key)}
            {@render managedEffectRow(e, e.hidden || !cat.enabled)}
          {/each}
        </div>
      {/if}
    {/each}
    {@const uncategorized = managedEffects.filter((e) => e.categoryKey === null)}
    {#if uncategorized.length}
      <p class="field-label" style="margin:var(--space-3) 0 var(--space-2)">{m.effect_type_category_none()}</p>
      <div class="managed-tags">
        {#each uncategorized as e (e.key)}
          {@render managedEffectRow(e, e.hidden)}
        {/each}
      </div>
    {/if}

    <Field label={m.name_label()} id="new-effect-type">
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="new-effect-type"
          bind:value={newEffectName}
        />
      {/snippet}
    </Field>
    <Field label={m.effect_type_category_label()} id="new-effect-type-category">
      {#snippet children(id)}
        <select class="input" {id} bind:value={newEffectCategory}>
          <option value="">{m.effect_type_category_none()}</option>
          {#each vocabulary.effectCategories as cat, i (cat.key)}
            <option value={cat.key}>{cat.name}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-add-effect-type disabled={effectTypeWrite.busy} onclick={addEffectType}><span>{m.effect_type_add()}</span></button>
  </Sheet>
</div>

<style>
  .effect-group {
    margin-bottom: var(--space-3);
  }

  /* The body is inside the card, under the header row, so it takes the
     card's own inset rather than the row's - a timeline is a drawing and
     wants the width, and the rows under it bring their own padding. */
  .effect-group-body {
    padding: var(--space-3) var(--space-3) 0;
  }

  .literature {
    margin-bottom: var(--space-3);
  }

  .literature-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 48px;
    padding: var(--space-2) 0;
    margin: 0;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }

  .literature-chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    transition: transform var(--dur-med) var(--ease-out);
  }

  .literature-toggle[aria-expanded='true'] .literature-chev {
    transform: rotate(180deg);
  }
</style>
