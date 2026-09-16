<script lang="ts">
  /* The words reading, as a block on the Look back door (phase 10 redesign
     ticket 62). It was a screen of its own behind the Transition tab, and a
     hub row that pointed at it; the row is gone and this is the whole of
     it.

     What it draws is distinctiveness, not frequency. The screen it replaces
     ranked words by raw count, and on a real journal that top is `long`,
     `whole`, `day`, `name`, `call` - words that carry nothing, and that no
     stopword list this app is willing to keep can remove (wordFrequency.ts
     refuses open classes, and its header says why). `distinctiveWords`
     weighs one era's or one mode's words against the journal's own average
     instead, which drops the evenly-spread ones without a list at all.

     One selection at a time, and the baseline is the journal - never
     another era. That is what keeps this on the right side of /compare's
     rule (ADR-0012): no two periods are placed side by side, and nothing
     is ranked against anything but the journal's own text. An era is never
     scored, and two are never drawn together.

     There is no "All" here, and its absence is the reading rather than an
     omission. Weighed against itself the whole journal has no distinctive
     word in it - every rate is the baseline rate - so an unfiltered option
     would draw an empty cloud every time. The picker names one stretch,
     always.

     This block is also the one reading on this door that the rail's span
     does not govern. The span is a pair of dates the finger drew; this
     asks what was distinctive about a stretch the person *named*, which is
     an era or a mode, and a named stretch is what the weighting needs to
     be about something. The two meet where they should: tapping an era
     band on the rail sets the span to that era, and the same era is one
     tap away in this card's own picker.

     The note text is read once, on arrival and on any later write, and
     never again for a change of selection (phase 8 audit ticket 17): the
     analysis hangs off the query alone, and everything below it is
     answered off what that produced. words-surfaces.test.ts holds this
     file to it. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { analyseNotes, distinctiveWords, groupByEra, groupByPresentation, type WordWeight } from '$lib/data/wordFrequency';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { crossfade, resize, spread } from '$lib/motion/reveal';
  import type { Role } from '$lib/theme/roles';
  import Sheet from '$lib/components/Sheet.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import WordCloud from '$lib/components/kit/WordCloud.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';

  /* Two views since phase 11 ticket 07: the card, on the reading's own
     screen, and the tile on the Look back door - the top word as the
     figure, the next two under it, no drawing. The tile opens the screen
     at the door's span through `href` even though this reading is not
     read over the span (see above): the screen it opens is on the door's
     stack and comes back to the door's span. */
  let {
    role,
    view = 'screen',
    href = ''
  }: { role?: Role; view?: 'tile' | 'screen'; href?: string } = $props();

  /** How many words the cloud draws. A render limit, not a narrower fold -
      `distinctiveWords` returns every word that carries weight. Past a
      couple of dozen the last ones are all on the smallest step and the
      block stops being a shape. */
  const CLOUD_LIMIT = 24;

  type Dimension = 'presentation' | 'era';

  let entriesQuery = liveList((j) => j.entries.noteEntries());
  let erasQuery = liveList((j) => j.eras.getEras());
  let ignoredQuery = liveQuery((j) => j.wordIgnore.getIgnoredWords());
  let ignoredWords = $derived(ignoredQuery.value ?? new Set<string>());

  /* Eras arrive oldest first (eras.ts orders by start day), and the card
     opens on the last of them rather than the first. Look back opens on now
     and works backwards - the rail's own default span is the last thirty
     days - so the stretch somebody is in is the one to answer with. It also
     keeps the card from opening empty on a journal whose earliest era
     predates its earliest note, which is the demo persona's own shape and
     is not unusual: an era named "before I knew" is exactly the stretch
     nobody was writing in. */
  let eraOptions = $derived(erasQuery.rows.map((e) => ({ value: e.id, label: e.name })));
  let modeOptions = $derived(vocabulary.visiblePresentations.map((p) => ({ value: p.id, label: p.name })));

  /* Era first where there is one: this is the door that leads with the
     person's own history, and a named stretch of it is the reading this
     card is for. A journal with no era falls back to modes, and one with
     neither has nothing to weigh and says so. */
  let dimensions = $derived<Dimension[]>([
    ...(eraOptions.length > 0 ? (['era'] as const) : []),
    ...(modeOptions.length > 0 ? (['presentation'] as const) : [])
  ]);
  let dimension = $state<Dimension>('era');
  let selectedId = $state<string | null>(null);
  let options = $derived(dimension === 'era' ? eraOptions : modeOptions);
  let opensOn = $derived(dimension === 'era' ? eraOptions[eraOptions.length - 1] : modeOptions[0]);

  /* One settling effect for both, because they settle together: an era
     deleted or a mode hidden mid-session leaves the picker pointing at
     nothing, which is the stale-reference rule /compare's era side already
     takes, and the dimension it was on can empty out from under it too.

     Gated on the eras read, and that gate is the whole of whether the card
     opens on an era or on a mode: modes are reference data and answer
     synchronously, eras are a query, so for the first frames of a journal
     that has both, `dimensions` is modes alone. Settling against that would
     move the card off eras before the eras arrived, and then leave it there
     - the correction only ever runs when what is on screen has stopped
     existing. */
  $effect(() => {
    if (erasQuery.loading || dimensions.length === 0) return;
    if (!dimensions.includes(dimension)) dimension = dimensions[0];
    else if (!options.some((o) => o.value === selectedId)) selectedId = opensOn?.value ?? null;
  });

  let analysed = $derived(analyseNotes(entriesQuery.rows));
  let grouped = $derived(
    dimension === 'presentation' ? groupByPresentation(analysed) : groupByEra(analysed, erasQuery.rows)
  );
  let selectedEntries = $derived(selectedId ? (grouped.get(selectedId) ?? []) : []);
  let weighted = $derived(distinctiveWords(selectedEntries, analysed, ignoredWords).slice(0, CLOUD_LIMIT));
  let hasPolish = $derived(selectedEntries.some((e) => e.language === 'pl'));

  /* What the cloud is drawing, as one string. The keyed block below reads
     it, so a change of dimension and a change of value are one swap rather
     than two. */
  let selection = $derived(`${dimension}:${selectedId ?? ''}`);

  /** What the picker is naming, for the sheet's own line: a count means
      nothing without the stretch it was counted over, which is the rule
      every figure in this app keeps (docs/ui-copy.md). Joined with a middot
      rather than interpolated into a sentence, because a Polish name
      injected into one needs a case the English never asks for. */
  let selectionLabel = $derived(options.find((o) => o.value === selectedId)?.label ?? '');

  let picked = $state<WordWeight | null>(null);
</script>

{#if view === 'tile'}
  {#if !entriesQuery.loading && !erasQuery.loading && weighted.length}
    <ReadingTile
      key="words"
      name={m.words_reading_title()}
      {href}
      headline={weighted[0].word}
      note={weighted.slice(1, 3).map((w) => w.word).join(', ')}
    />
  {/if}
{:else}
<ChartCard heading={m.words_reading_title()} kind="words" {role}>
  {#if dimensions.length === 0}
    <ChartEmpty>{m.words_reading_needs_stretch()}</ChartEmpty>
  {:else}
    {#if dimensions.length > 1}
      <Segmented
        key="words-dimension"
        name={m.words_group_by_label()}
        compact
        options={[
          { value: 'era', label: m.words_mode_era() },
          { value: 'presentation', label: m.words_mode_presentation() }
        ]}
        value={dimension}
        onChange={(v) => {
          dimension = v as Dimension;
          selectedId = null;
        }}
      />
    {/if}

    <div class="kit-filter">
      <label class="kit-filter-label" for="words-value-filter">
        {dimension === 'era' ? m.eras_title() : m.presentation_label()}
      </label>
      <ChartPicker
        key="words-{dimension}"
        id="words-value-filter"
        labelledBy="words-value-filter"
        value={selectedId ?? ''}
        {options}
        onPick={(v) => (selectedId = v)}
      />
    </div>

    {#if hasPolish}
      <Notice icon="info" key="words-pl-caveat" text={m.words_pl_caveat()} />
    {/if}

    <ReadGate read={entriesQuery} variant="block" count={1}>
      {#snippet rows()}
        <!-- One slot, one object across every change of selection: the
             cloud that is leaving fades off its own footprint while the one
             arriving opens from the middle it is built around, and the slot
             travels between the two heights rather than snapping.

             Both transitions are `|global`, and that is not decoration. A
             local transition plays only when its own block is created or
             destroyed, and what is destroyed here is the `{#key}` around
             it - a parent - so a local `out:` never runs at all. Measured
             before it was written: the outgoing cloud was gone in the frame
             after the tap, which is a yank by the only definition that
             matters. -->
        <div class="words-slot" use:resize>
          {#key selection}
            {#if weighted.length === 0}
              <div in:spread|global out:crossfade|global>
                <ChartEmpty>{m.words_reading_empty()}</ChartEmpty>
              </div>
            {:else}
              <div in:spread|global out:crossfade|global>
                <WordCloud words={weighted} onPick={(word) => (picked = word)} />
              </div>
            {/if}
          {/key}
        </div>
        {#if weighted.length > 0}
          <p class="words-note">{m.words_reading_note()}</p>
        {/if}
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.words_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>

    <!-- The manager, reachable without picking a word first (redesign
         ticket 05: the whole-app audit found the only way here was through
         a word's own sheet, three taps deep). The sheet below keeps its own
         link too - "put this back" belongs beside the word it names - this
         one is "go look at the list", which does not need a word picked to
         want. -->
    <a class="words-manage-link" href="/settings/words">{m.words_ignored_title()}</a>
  {/if}
</ChartCard>

<Sheet open={picked !== null} title={picked?.word ?? ''} onClose={() => (picked = null)}>
  {#if picked}
    <h3>{picked.word}</h3>
    <p class="words-sheet-count" data-word-sheet-count>
      {selectionLabel} &middot; {m.words_times({ n: picked.count })}
    </p>
    <button
      class="btn btn-ghost"
      data-ignore-word={picked.word}
      onclick={() => {
        journal.wordIgnore.setWordIgnored(picked!.word, true);
        picked = null;
      }}
    >
      <span>{m.words_ignore_action()}</span>
    </button>
    <a class="words-sheet-link" href="/settings/words">{m.words_ignored_title()}</a>
  {/if}
</Sheet>
{/if}

<style>
  /* The slot the cloud swaps inside. `position: relative` is what the
     outgoing cloud's absolute footprint is measured against (motion/reveal's
     crossfade). */
  .words-slot {
    position: relative;
  }

  /* What the sizes are measured against, said once under the drawing where
     a chart card keeps that sentence. */
  .words-note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .words-sheet-count {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .words-sheet-link {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  /* The same face as the sheet's own link above: a text action at the
     screen's secondary weight, not the accent-coloured "All values" style
     stats/+page.svelte's card actions took, since this is a way to another
     screen rather than the chart's own control. */
  .words-manage-link {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
