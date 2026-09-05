<script lang="ts">
  /* Word frequency over note text, grouped by presentation and by era
     (phase 8 features ticket 14, ADR-0048, ADR-0049). Mostly a reading
     surface over existing text - wordFrequency.ts itself stores nothing -
     plus one write of its own (phase 8 features ticket 48): a word can be
     told to stop counting, which is wordIgnore.ts's own small area and
     archive section, not this module's.

     The grouping control is two things, the same split /body-map's own
     presentation filter already makes: a Segmented switch for which
     dimension groups the notes, then a ChartPicker naming which value of
     it - "All", or one named presentation or era. There is no "no
     presentation" or "no era" option in the picker, the same absence
     body-map's own comment explains: an entry or a day with none already
     reads back inside "All" like every other entry, so it needs no filter
     of its own to reach. Switching dimension resets the picked value
     rather than carrying a presentation id into the era list or the
     reverse. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { analyseNotes, countWords, groupByEra, groupByPresentation } from '$lib/data/wordFrequency';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /** How many words the list shows - a render limit, not a narrower fold:
      wordFrequency() itself returns every word, unranked by anything but
      its own count (frequency only, no interpretation). */
  const WORD_LIMIT = 40;

  type Dimension = 'presentation' | 'era';
  let dimension = $state<Dimension>('presentation');
  /** null is "All", the unfiltered baseline - never "no presentation" or
      "no era", which body-map's own filter also declines to offer. */
  let selectedId = $state<string | null>(null);

  let entriesQuery = liveList((j) => j.entries.noteEntries());
  let erasQuery = liveList((j) => j.eras.getEras());
  let ignoredQuery = liveQuery((j) => j.wordIgnore.getIgnoredWords());
  let ignoredWords = $derived(ignoredQuery.value ?? new Set<string>());
  let ignoredWordsSorted = $derived([...ignoredWords].sort());

  // A picked presentation or era hidden or deleted mid-session falls back
  // to "All" rather than pointing at nothing, the same stale-reference
  // rule /compare's own era side takes.
  $effect(() => {
    if (
      dimension === 'presentation' &&
      selectedId &&
      !vocabulary.visiblePresentations.some((p) => p.id === selectedId)
    )
      selectedId = null;
  });
  $effect(() => {
    if (dimension === 'era' && selectedId && !erasQuery.loading && !erasQuery.rows.some((e) => e.id === selectedId))
      selectedId = null;
  });

  /* Every note read once, on arrival and on any later write, and never
     again for a filter (phase 8 audit ticket 17). `$derived` is what makes
     that true: this one depends on the query alone, so the three below
     re-run on a tap of the Segmented or the picker and this one does not.
     Everything downstream - the partition, the counting, the Polish caveat
     - is answered off what it produced rather than off the note text. */
  let analysed = $derived(analyseNotes(entriesQuery.rows));

  // The partition itself is wordFrequency.ts's own tested fold - grouped
  // by every presentation or era, `null` the bucket for one carrying none.
  // "All" is never that bucket (there is no "no presentation"/"no era"
  // filter option, see above): it is the unfiltered list, read straight
  // off the analysed notes rather than out of the grouping.
  let grouped = $derived(
    dimension === 'presentation' ? groupByPresentation(analysed) : groupByEra(analysed, erasQuery.rows)
  );
  let filteredEntries = $derived(selectedId ? (grouped.get(selectedId) ?? []) : analysed);

  let frequencies = $derived(countWords(filteredEntries, ignoredWords).slice(0, WORD_LIMIT));
  let hasPolish = $derived(filteredEntries.some((e) => e.language === 'pl'));
</script>

<div class="screen">
  <ScreenHeader title={m.words_title()} subtitle={m.words_sub()} back="/more" screen="words" />

  <Segmented
    key="words-dimension"
    name={m.words_group_by_label()}
    compact
    options={[
      { value: 'presentation', label: m.words_mode_presentation() },
      { value: 'era', label: m.words_mode_era() }
    ]}
    value={dimension}
    onChange={(v) => {
      dimension = v as Dimension;
      selectedId = null;
    }}
  />

  {#if dimension === 'presentation' && vocabulary.visiblePresentations.length > 0}
    <div class="kit-filter">
      <label class="kit-filter-label" for="words-value-filter">{m.presentation_label()}</label>
      <ChartPicker
        key="words-presentation"
        id="words-value-filter"
        labelledBy="words-value-filter"
        value={selectedId ?? 'all'}
        options={[
          { value: 'all', label: m.body_map_mode_filter_all() },
          ...vocabulary.visiblePresentations.map((p) => ({ value: p.id, label: p.name }))
        ]}
        onPick={(v) => (selectedId = v === 'all' ? null : v)}
      />
    </div>
  {:else if dimension === 'era' && erasQuery.rows.length > 0}
    <div class="kit-filter">
      <label class="kit-filter-label" for="words-value-filter">{m.eras_title()}</label>
      <ChartPicker
        key="words-era"
        id="words-value-filter"
        labelledBy="words-value-filter"
        value={selectedId ?? 'all'}
        options={[
          { value: 'all', label: m.body_map_mode_filter_all() },
          ...erasQuery.rows.map((e) => ({ value: e.id, label: e.name }))
        ]}
        onPick={(v) => (selectedId = v === 'all' ? null : v)}
      />
    </div>
  {/if}

  {#if hasPolish}
    <Notice icon="info" key="words-pl-caveat" text={m.words_pl_caveat()} />
  {/if}

  <ReadGate read={entriesQuery} variant="line" count={4}>
    {#snippet rows()}
      {#if frequencies.length === 0}
        <Notice icon="note" key="words-group-empty" text={m.words_group_empty()} />
      {:else}
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each frequencies as [word, count] (word)}
            <ListRow
              static
              title={word}
              data-word-row={word}
              action={{
                icon: 'eyeOff',
                label: m.words_ignore_aria({ word }),
                onclick: () => journal.wordIgnore.setWordIgnored(word, true),
                attrs: { 'data-ignore-word': word }
              }}
            >
              {#snippet trailing()}{count}{/snippet}
            </ListRow>
          {/each}
        </ListCard>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice icon="note" key="words-empty" text={m.words_empty()} />
    {/snippet}
  </ReadGate>

  {#if ignoredWordsSorted.length > 0}
    <div class="screen-part">
      <h2 class="editor-heading">{m.words_ignored_title()}</h2>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each ignoredWordsSorted as word (word)}
          <ListRow
            static
            title={word}
            data-ignored-word-row={word}
            action={{
              icon: 'eye',
              label: m.words_unignore_aria({ word }),
              onclick: () => journal.wordIgnore.setWordIgnored(word, false),
              attrs: { 'data-unignore-word': word }
            }}
          />
        {/each}
      </ListCard>
    </div>
  {/if}
</div>
