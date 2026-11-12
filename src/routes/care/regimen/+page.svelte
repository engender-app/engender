<script lang="ts">
  import { page } from '$app/state';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* What you are taking, and since when, on the surface kit (phase 5 UX
     ticket 25).

     The dose log used to sit above the regimen alongside two other links -
     the stock projection and the exposure counters - as a list-group
     indistinguishable from the one holding the episodes. Ticket 09
     (ADR-0084) moved medication records off Settings and onto Care: the
     stock editor is a sheet off Care's own regimen block now, and the
     exposure counters' one useful figure is that block's own dose-total
     line, so this screen keeps only the one link still worth naming
     here. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { hrtAnchor } from '$lib/data/personalEffectWindow';
  import { cycleTrackingVisible, testosteroneActive } from '$lib/data/cycleTracking';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { fmtNumber, fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { regimenIntervalLabel, regimenPeriodLabel, routeLabel } from '$lib/data/vocabulary/doseLabels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DoseRoute, RegimenEpisode, RegimenTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import RegimenEditorSheet, { setEpisodeHidden } from '$lib/components/RegimenEditorSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import BatchedList from '$lib/components/kit/BatchedList.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { hashRowId, scrollToHash } from '$lib/navigation/scroll-region';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Two areas: what is being taken, and the three screens that read the
     dose log from other angles. */
  const SECTION_ROLE = { episodes: 0, elsewhere: 1 };

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.rows);
  /* Put away by mistake or as a duplicate (after-release 07): out of every
     read but this one, which is the way back. Newest first, like the list
     above it. */
  let hiddenQuery = liveList((j) => j.regimen.getHiddenEpisodes());
  let hiddenEpisodes = $derived([...hiddenQuery.rows].reverse());
  /* Newest first, the same order the rows render in - and what
     `deepLinkedEpisodeIndex` below resolves a hash's id against, since
     BatchedList's `focusIndex` names a position in this exact array. */
  let orderedEpisodes = $derived([...episodes].reverse());
  /* A set, not one episode (phase 5 ticket 38): more than one can be
     active at once for different drugs, and every one of them still gets
     the "current" badge below. */
  let activeIds = $derived(new Set(activeEpisodesAt(episodes, Date.now()).map((e) => e.id)));

  const longDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* Where HRT began (functional audit ticket 18, CONTEXT: "HRT start"): the
     date the person set, else the earliest HRT episode. Changes you've
     noticed and hair progress count from it, so it is said and set here,
     beside the episodes it is read from. */
  let hrt = $derived(hrtAnchor(episodes, prefs.hrtStartEpochDay));
  let hrtStartSub = $derived(
    prefs.hrtStartEpochDay !== null
      ? m.regimen_hrt_start_set({ date: longDay(prefs.hrtStartEpochDay) })
      : hrt
        ? m.regimen_hrt_start_from_episode({ date: longDay(hrt.startEpochDay) })
        : m.regimen_hrt_start_none()
  );
  let hrtStartEditor = $state<string | null>(null);
  /* What the sheet opened on. Save stays dead until the date moves off it,
     so opening the sheet and pressing Save cannot turn the date read off an
     episode, or an empty field, into one "set by you". */
  let hrtStartOpenedOn = $state('');

  function openHrtStart() {
    hrtStartOpenedOn = hrt ? dateInputValueFromEpochDay(hrt.startEpochDay) : '';
    hrtStartEditor = hrtStartOpenedOn;
  }

  function saveHrtStart() {
    if (hrtStartEditor === null) return;
    // A cleared field reads as null, the preference's own "not set".
    prefs.hrtStartEpochDay = epochDayFromDateInputValue(hrtStartEditor);
    hrtStartEditor = null;
    toast(m.saved(), { kind: 'record-saved' });
  }

  function clearHrtStart() {
    prefs.hrtStartEpochDay = null;
    hrtStartEditor = null;
    toast(m.saved(), { kind: 'record-saved' });
  }

  /* The clinician summary links an episode across a hash (phase 8 features
     ticket 67) - read once, the same "one visit to one screen" rule
     BatchedList's own `path` follows. */
  let sourceId = $derived(page.url.searchParams.get('episode'));
  let sourceEpisode = $derived(episodes.find((episode) => episode.id === sourceId));
  let deepLinkedEpisodeId = $derived(sourceId ?? hashRowId(page.url.hash));
  let deepLinkedEpisodeIndex = $derived(
    deepLinkedEpisodeId ? orderedEpisodes.findIndex((episode) => episode.id === deepLinkedEpisodeId) : -1
  );

  /* Offered above manual entry when adding a new episode (CONTEXT: "Regimen
     template") - picking one only pre-fills drug/ester/route in the editor
     below, never dose or interval. Editing an existing episode skips this
     and opens the editor directly. */
  let templatePicker = $state(false);
  /* A hash arrived with the navigation (the clinician summary links each
     episode): scroll to it once the rows exist, which the browser's own
     anchor scroll never did - it fires before the liveQuery answers. */
  $effect(() => {
    if (!episodesQuery.loading) scrollToHash();
  });

  /* The editor lives in RegimenEditorSheet, which Care opens too; the
     template picker closes as it opens. */
  let editorSheet: ReturnType<typeof RegimenEditorSheet>;
  function openEditor(episode: RegimenEpisode | null, template: RegimenTemplate | null = null) {
    templatePicker = false;
    editorSheet.open(episode, template);
  }

</script>

<!-- Inside the read gate's two branches rather than after it, so it fades in
     with the answer it states instead of landing a line later. -->
{#snippet hrtStartCard()}
  <div class="regimen-elsewhere">
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
      <ListRow key="hrt-start" data-hrt-start icon="calendar" title={m.regimen_hrt_start_title()} subtitle={hrtStartSub} fadeSwap onclick={openHrtStart} />
    </ListCard>
  </div>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.regimen()} back="/care">
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.regimen_add_aria()} onclick={() => (templatePicker = true)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>
  <SourceRecordHandoff id={sourceId} ready={!episodesQuery.loading && !episodesQuery.failed} found={!!sourceEpisode} onOpen={() => openEditor(sourceEpisode!)} />

  <ReadGate read={episodesQuery} variant="line" count={3}>
    {#snippet rows()}
      <BatchedList
        items={orderedEpisodes}
        key="episodes"
        role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}
        focusIndex={deepLinkedEpisodeIndex >= 0 ? deepLinkedEpisodeIndex : null}
      >
        {#snippet rows(shownEpisodes)}
          {#each shownEpisodes as episode (episode.id)}
            <!-- Wrapped so a hidden episode closes its own height and one
                 shown again opens it, rather than cutting and moving every
                 row under it in one frame. -->
            <div class="rows-divide" transition:collapse>
              <ListRow
                key={episode.id}
                data-episode={episode.id}
                id={episode.id}
                icon="pill"
                title={episode.drug}
                subtitle={(episode.drugClass === 'hrt' ? m.regimen_episode_sub : m.regimen_episode_sub_other)({ dose: fmtNumber(episode.dose), unit: episode.doseUnit, route: routeLabel(episode.route as DoseRoute), interval: regimenIntervalLabel(episode.interval), period: regimenPeriodLabel(episode.startEpochDay, episode.endEpochDay) })}
                chevron={false}
                onclick={() => openEditor(episode)}
              >
                {#snippet trailing()}
                  <!-- Which episodes are running, at the end of the row rather
                       than wedged into the drug's own name. A badge inside a
                       title pushes the name it belongs to onto a second line as
                       soon as the name is long, which every ester is. -->
                  {#if activeIds.has(episode.id)}
                    <span class="regimen-badge" data-active-badge>{m.regimen_active_badge()}</span>
                  {/if}
                {/snippet}
              </ListRow>
            </div>
          {/each}
        {/snippet}
      </BatchedList>
      {@render hrtStartCard()}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="pill"
        key="regimen-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}
        title={m.regimen_empty_title()}
        text={m.regimen_empty_body()}
        action={{ label: m.regimen_empty_action(), primary: true, onclick: () => (templatePicker = true) }}
      />
      {@render hrtStartCard()}
    {/snippet}
  </ReadGate>

  <!-- Keep this regimen-specific offer beside an active testosterone
       episode, subject to the same cycle choice as other offers. -->
  {#if testosteroneActive(episodes, Date.now()) && cycleTrackingVisible(episodes, Date.now(), prefs.cycleTrackingChoice)}
    <div class="regimen-elsewhere">
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.elsewhere)}>
        <ListRow
          key="cycle-events"
          data-cycle-events-link
          icon="calendar"
          title={m.cycle_events()}
          href="/health/cycle-events"
        />
      </ListCard>
    </div>
  {/if}

  <!-- No heading over this one. The catalogue's only wording for the area
       was the name of its first row, which would be the row repeated at
       heading size; a name for it is a copy ticket's to write. The gap and
       the second stripe are what separate it from the regimen above -
       ticket 09 (ADR-0084) took the other two rows this card used to hold:
       stock is a sheet off Care's own regimen block now, and exposure's
       one useful figure is that block's own dose-total line. -->
  <div class="regimen-elsewhere">
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.elsewhere)}>
      <ListRow key="doses" icon="pill" title={m.regimen_doses_link()} subtitle={m.doses_row_sub()} href="/care/doses" />
    </ListCard>
  </div>

  <!-- Last on the screen, so its arrival and its leaving push nothing
       under it. -->
  {#if hiddenEpisodes.length}
    <div class="regimen-hidden" data-hidden-episodes transition:collapse>
      <SectionHeading text={m.regimen_hidden_title()} />
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
        {#each hiddenEpisodes as episode (episode.id)}
          <div class="rows-divide" transition:collapse>
            <ListRow
              static
              key={episode.id}
              data-hidden-episode={episode.id}
              icon="pill"
              title={episode.drug}
              subtitle={`${fmtNumber(episode.dose)} ${episode.doseUnit} · ${regimenPeriodLabel(episode.startEpochDay, episode.endEpochDay)}`}
              action={{
                icon: 'eye',
                label: m.regimen_show_aria({ drug: episode.drug }),
                onclick: () => void setEpisodeHidden(episode, false),
                attrs: { 'data-show-episode': episode.id }
              }}
            />
          </div>
        {/each}
      </ListCard>
    </div>
  {/if}

  <Sheet
    open={templatePicker}
    title={m.regimen_template_sheet_title()}
    onClose={() => (templatePicker = false)}
  >
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
      <ListRow
        key="own"
        data-own
        icon="pencil"
        title={m.regimen_own_title()}
        subtitle={m.regimen_own_sub()}
        onclick={() => openEditor(null, null)}
      />
      {#each vocabulary.regimenTemplates as tp (tp.key)}
        <ListRow key={tp.key} data-template={tp.key} icon="pill" title={tp.name} onclick={() => openEditor(null, tp)} />
      {/each}
    </ListCard>
  </Sheet>

  <RegimenEditorSheet bind:this={editorSheet} />
  <Sheet open={hrtStartEditor !== null} title={m.regimen_hrt_start_title()} onClose={() => (hrtStartEditor = null)}>
    {#if hrtStartEditor !== null}
      <h3>{m.regimen_hrt_start_title()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.regimen_hrt_start_hint()}</p>
      <Field label={m.regimen_hrt_start_date_label()} id="hrt-start-date">
        {#snippet children(id)}
          <DatePicker name="hrt-start-date" bind:value={hrtStartEditor!} {id} />
        {/snippet}
      </Field>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-hrt-start disabled={hrtStartEditor === hrtStartOpenedOn} onclick={saveHrtStart}><span>{m.regimen_hrt_start_save()}</span></button>
        {#if prefs.hrtStartEpochDay !== null}
          <button class="btn btn-ghost" data-clear-hrt-start onclick={clearHrtStart}><span>{m.regimen_hrt_start_clear()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>
</div>

<style>
  .regimen-elsewhere,
  .regimen-hidden {
    margin-top: var(--space-6);
  }

  /* Small enough to sit at the end of a row without pushing the reading
     beside it around. Ink, not the warning treatment (audit U6, rule 4):
     being on a regimen is a status, not a caution, and amber is reserved
     for genuine warnings elsewhere (labs, eras, export). */
  .regimen-badge {
    padding: 2px var(--space-2);
    border-radius: var(--r-block);
    font-size: var(--text-xs);
    white-space: nowrap;
    background: var(--text);
    color: var(--bg);
  }
</style>
