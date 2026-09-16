<script lang="ts">
  /* The Transition door, reading its own data (phase 8 UX ticket 02; phase 10
     redesign ticket 15).

     Twenty-six rows of a title and an icon, in four groups, used to be
     declared inline here as four const arrays, and only `/care` said anything
     about what was behind it. Every row says something now, and this screen
     owns none of the reasoning: `hubRows.ts` holds the rows and what sits
     behind them, `vocabulary/hubLabels.ts` holds the words. What is left here
     is four live reads and two loops.

     Three of the reads are the door's own, and each comes out of one
     assembled call (`journal/lastWrite.ts`, measured as `hub-last-writes`
     before this screen was written; `rowForwardReads.ts`, phase 11
     all-four-doors ticket 02) beside the area record. The fourth is the
     search (ticket 15) and it asks nothing until somebody types.

     It was three reads until phase 9 carpet ticket 16: the third was the regimen
     episode list, read only to answer ADR-0043's gate for the cycle row. That
     row is drawn on /health/side-effects now, which was already asking the
     same question for the cycle block it draws, so the gate and the read that
     feeds it are in one place instead of two.

     Nothing gates the screen on the door's own three reads. This is a
     navigation surface, and a skeleton in front of twenty links a person can
     already read would be slower than the links.

     **The search (ticket 15).** Twenty-seven rows is a list somebody has to
     be able to cut through, so the field holds a search box and nothing else
     (DIRECTION.md rule 7). What it reaches is both halves of what is behind
     this door:

       the areas   `hubRowsMatching`, in memory, over the titles this screen
                   already drew. No wait for a keystroke: the rows are already
                   here and filtering them is a substring test over
                   twenty-odd short strings.
       the records `j.textSearch.search`, the same registry and the same read
                   the search screen's "elsewhere in the journal" half uses,
                   waited out after the last keystroke because it is SQL over
                   eighteen areas.

     One flat list of matched areas rather than the grouped index with
     non-matches removed: a query is a question about the whole door, and
     keeping five headings over three surviving rows would be the screen
     answering with its own structure (the same call `searchHitRows.ts` made
     about grouping hits by area, and Apple's own settings search, in the
     Mobbin pass). An empty box shows the grouped index, which is the door at
     rest. */
  import { m } from '$lib/paraglide/messages';
  import { navigating } from '$app/state';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { searchHitRows } from '$lib/components/searchHitRows';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { hubRowsMatching, hubSectionRoleIndex, hubSections } from '$lib/data/hubRows';
  import { readRowForward } from '$lib/data/rowForwardReads';
  import type { RowForwardMap } from '$lib/data/rowForward';
  import { hubGroupHeading, hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import { collapse, disclose } from '$lib/motion/reveal';

  const today = todayEpochDay();

  let lastWritesQuery = liveQuery((j) => j.lastWrite.getLastWrites(today));
  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  /* The forward half (phase 11 all-four-doors ticket 02): what is running
     and what is next, which is what nine of this door's rows were getting
     wrong by reporting a gap over a screen full of dated plans. One
     assembled call, `rowForwardReads.ts`, the shape the last-write read next
     to it already has. */
  let forwardQuery = liveQuery((j) => readRowForward(j, today));

  /* All three reads or none, which is a correctness rule and not only a
     tidier transition. Rendering whichever landed first would put a finished
     row in its old group with a reading under it, and then move it into the
     finished set once the area record arrived - a wrong state on screen, not
     a partial one. The forward read joins them for the same reason and a
     sharper one: a row that said "Nothing logged for 1 year 4 months" and
     then replaced it with "Name-change hearing in 16 days" would have
     printed the wrong thing first, which is the exact complaint this ticket
     answers. Held together, the hub goes from titles to titles-and-lines
     once.

     Until then the written rows already say their line, because a line about
     what is behind a row needs no read at all. */
  let landed = $derived(
    lastWritesQuery.value !== undefined && statesQuery.value !== undefined && forwardQuery.value !== undefined
      ? { lastWrites: lastWritesQuery.value, states: statesQuery.value, forward: forwardQuery.value }
      : { lastWrites: {}, states: {}, forward: {} as RowForwardMap }
  );

  let reading = $derived({ todayEpochDay: today, ...landed });

  /* One second hand, and only while something is actually counting up. The
     wear row is the single line on this door that reads a clock rather than
     a day ("Binding now, 9h 1m"), so the interval starts when a session is
     running and stops when it is not - a navigation screen has no business
     waking once a second to redraw twenty-two static rows. */
  let running = $derived(reading.forward.wear?.kind === 'running');
  let nowMs = $state(Date.now());
  $effect(() => {
    if (!running) return;
    nowMs = Date.now();
    const id = setInterval(() => (nowMs = Date.now()), 1000);
    return () => clearInterval(id);
  });
  let sections = $derived(hubSections(reading));

  /** One page of record hits, and what "show more" asks for again. Twenty
      rather than the search screen's thirty: this is a door, and a query that
      answers with a screenful of records is a query better finished on the
      search screen. */
  const PAGE = 20;
  /** How long the record read waits after the last keystroke (the search
      screen's own interval, phase 8 audit ticket 15): long enough that typing
      at speed never fires a run per key, short enough that a pause reads as
      instant. The area half is not waited out at all - it is a filter over
      rows already on the screen, and making it lag behind the box would be
      the screen feeling slower than it is. */
  const SEARCH_DEBOUNCE_MS = 250;

  let query = $state('');
  let debouncedQuery = $state('');
  let pages = $state(1);
  /** The box itself, so clearing it can put the cursor back in it. */
  let box = $state<HTMLInputElement | undefined>(undefined);

  let typed = $derived(query.trim());
  let searching = $derived(typed.length > 0);

  /* Clearing the box is the one case that is not waited out: an empty query
     drops the pending timer and lands at once, so clearing clears the
     results without the wait (the search screen's own rule). */
  $effect(() => {
    if (!typed) {
      debouncedQuery = '';
      return;
    }
    const timer = setTimeout(() => {
      debouncedQuery = typed;
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  /* Back to the first page whenever the question changes, or a two-word query
     would read a hundred rows to draw its first screen. */
  $effect(() => {
    debouncedQuery;
    pages = 1;
  });

  /** The areas whose name contains what is in the box, flat: all
      twenty-seven, the seven drawn on a screen of their own included. Hidden
      areas are absent and a finished one still states the day it ended,
      because the assembling is `hubRows.ts`'s rather than this screen's. */
  let matches = $derived(searching ? hubRowsMatching(reading, typed, hubRowTitle) : []);

  /* Everything the journal holds that is not an entry, in one scan across the
     registry (`textSearch.ts`) - the read the search screen's second half
     makes, with no date range, because a door has no filters. Reads the
     debounced query and the page count before its first await, which is the
     reactivity contract a liveQuery closure is written against
     (journal.svelte.ts), so a run lands once per pause rather than once per
     key.

     `today` because a sealed letter is not searchable and the seal is a
     comparison against today, which no read below the journal seam makes for
     itself (ADR-0001). */
  const NOTHING_FOUND = { hits: [], total: 0 };
  let records = liveQuery((j) => {
    const asked = debouncedQuery;
    const limit = PAGE * pages;
    if (!asked) return Promise.resolve(NOTHING_FOUND);
    return j.textSearch.search({ query: asked, today, startEpochDay: null, endEpochDay: null, limit });
  });

  let found = $derived(records.value ?? NOTHING_FOUND);
  let hitRows = $derived(searchHitRows(found.hits, debouncedQuery));
  let hitsRemaining = $derived(Math.max(0, found.total - found.hits.length));
  /* One count over both halves. Stating the areas alone while five letters
     sat underneath it would be the screen describing part of what it found. */
  let resultCount = $derived(matches.length + found.total);
  /* Whether both halves have answered the question currently in the box. The
     areas answer on the keystroke and the records 250ms later, so anything
     that would otherwise describe a half-answer waits on this: the notice
     that says nothing was found, and the count, which is read out loud and
     would otherwise announce "0 results" and then "4 results" for one
     query. */
  let settled = $derived(!records.loading && debouncedQuery === typed);
  let foundNothing = $derived(settled && matches.length === 0 && hitRows.length === 0);

  /* One area of colour per list, in reading order: the areas take role 0, the
     only index guaranteed to be a colour on all eight palettes, and the
     records take role 1 (the search screen's own split). */
  let matchesRole = $derived(roleAt(activeFlag.roles, 0));
  let recordsRole = $derived(roleAt(activeFlag.roles, 1));

  /* A Svelte out-transition also runs when the page unmounts the block during
     navigation, and this module cannot see a SvelteKit navigation (reveal.ts
     says why), so the screen says so: leaving the door should not collapse
     the list on the way out. */
  let leaving = $derived(navigating.to !== null);
</script>

<div class="screen">
  <!-- DIRECTION.md 3d: the hub had "More" stacked directly above its first
       group heading, which is two headers saying nearly the same thing. The
       title stays in the document for a screen reader and stops being a
       second visible label - and since ticket 08 the tab and this title no
       longer even say the same word: the tab now names the whole subject
       (Transition, or More disguised) and the title names the five groups
       actually behind it.

       So what the field holds is the search box, and nothing else (rule 7).
       It is a block of the page's own colour on the flag's, which is what
       makes 16px legal there: the type in it is page ink on the page's
       ground, not small text on a stripe (rule 3, and the measured pairs in
       DIRECTION.md's "Contrast"). Under disguise the field falls to
       --surface-2 and the box is unremarkable on it. -->
  <ScreenHeader title={m.hub_screen_title()} titleHidden>
    {#snippet field()}
      <div class="search-box">
        <Icon name="search" size={20} />
        <!-- Android's own keyboard hints, since this is where the app is
             mostly typed into: a search key rather than a return key, and
             none of the corrections a phone applies to prose - an area's
             name is not a sentence, and autocapitalising it would fight the
             match on the first letter. -->
        <input
          class="search-input"
          bind:this={box}
          id="hub-q"
          name="hub-q"
          type="search"
          placeholder={m.hub_search_placeholder()}
          aria-label={m.hub_search_placeholder()}
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          enterkeyhint="search"
          data-hub-search
          bind:value={query}
        />
        <!-- The cross is ours because Chromium's is 16px and Firefox draws
             none at all, and because clearing the box is how somebody gets
             the whole door back - a 48px target for that, not a browser
             detail. It arrives and leaves along the row it is in, which is
             `collapse`'s own case (reveal.ts): it grows its width from
             nothing and takes the box's gap with it.

             Clearing puts the cursor back in the box rather than letting
             focus fall to the document: the button unmounts the moment the
             query goes, and on a phone that closes the keyboard somebody
             was about to type the next word into (Amazon's and Best Buy's
             search fields both keep it, in the Mobbin pass). -->
        {#if searching}
          <button
            class="field-search-clear press"
            data-hub-search-clear
            aria-label={m.hub_search_clear()}
            transition:collapse={{ skip: leaving }}
            onclick={() => {
              query = '';
              box?.focus();
            }}
          >
            <Icon name="x" size={20} />
          </button>
        {/if}
      </div>
    {/snippet}
  </ScreenHeader>

  <!-- The one thing that is announced rather than seen: the list changes
       under a box somebody is typing into, and a screen reader is told how
       many things are in it. In the document at rest and empty, because a
       live region has to be there before its content changes for the change
       to be announced; empty it takes no room, and while a query is being
       answered it holds its line rather than letting the list jump (the two
       rules beside it in screens.css). -->
  <!-- The line inside opens and closes its own height (redesign ticket 25):
       it used to reserve its line the moment typing began and drop it the
       moment the box was cleared, and both moved the list under the finger
       in one frame (Alicja, on the flipbooks: "the '0 results' simply
       disappears and yanks the whole content underneath"). The region stays
       the <p>, empty until both halves have answered, so the count is still
       announced once. -->
  <p class="hub-count" data-hub-count aria-live="polite">
    {#if searching && settled}
      <span class="hub-count-line" transition:disclose={{ skip: leaving }}>{m.results_count({ count: resultCount })}</span>
    {/if}
  </p>

  {#if searching}
    <!-- The whole block, not each list in it: what swaps is the door's index
         for the door's answer, and both give their height back through
         `collapse`, which is the kit's own case for a block handing back the
         space it held - --dur-slow rather than --dur-med, because the index
         is the tallest thing on the screen and the faster curve reads as a
         yank (reveal.ts records that finding). Measured: the two heights
         interpolate against each other with no frame where the page is
         missing both. -->
    <div class="screen-part" data-hub-results transition:collapse={{ skip: leaving }}>
      {#if matches.length}
        <ListCard role={matchesRole}>
          {#each matches as row (row.spec.key)}
            <!-- Which section the row was drawn in and which kind of line it
                 carries, both on the row rather than on wrappers of their own:
                 a finished row is the same row under a different heading, and
                 the line itself is the kit's `.kit-row-sub`, a class and so
                 something the walkthrough may not grip (ADR-0029). Naming the
                 kind rather than the element also lets a flow tell a reading
                 apart from the line about what is behind the row, which the
                 element could not.

                 A searched row keeps `data-hub-section`, which here says
                 where the row is drawn - one of the hub's sections, or the
                 screen that hosts it - since in this list there is no
                 heading above it to say so. -->
            <!-- The wrapper is the row's own height, and giving it back is
                 how a row leaves (rule 10): the rows under it close up with
                 it instead of jumping. `.rows-divide` is the kit's opt-in for
                 the hairline `.kit-row` draws for itself, so the line between
                 rows still comes from one place. -->
            <div class="rows-divide" transition:disclose={{ skip: leaving }}>
              <ListRow
                key={row.spec.key}
                icon={row.spec.icon}
                title={hubRowTitle(row.spec.key)}
                subtitle={hubRowLine(row.spec.key, row.line, today, nowMs)}
                href={row.spec.href}
                data-hub-section={row.where}
                data-hub-line={row.line.kind}
              />
            </div>
          {/each}
        </ListCard>
      {/if}

      {#if hitRows.length}
        <!-- The records, under the areas and named once, in the words the
             search screen already uses for the same read - and named only
             when there are areas above them to be elsewhere from. On a
             screen of nothing but record hits the heading would be the
             largest thing on it, naming the only list there is, which is
             the call the search screen makes about its own two halves. -->
        {#if matches.length}
          <SectionHeading text={m.search_elsewhere_heading()} />
        {/if}
        <ListCard role={recordsRole}>
          {#each hitRows as row (row.key)}
            <div class="rows-divide" transition:disclose={{ skip: leaving }}>
              <ListRow
                key={row.key}
                icon={row.icon}
                title={row.excerpt}
                subtitle={row.label}
                href={row.href}
                data-search-hit={row.area}
              >
                {#snippet trailing()}
                  {#if row.date}<span class="search-hit-date">{row.date}</span>{/if}
                {/snippet}
              </ListRow>
            </div>
          {/each}
        </ListCard>
        {#if hitsRemaining > 0}
          <button class="btn btn-soft" data-hub-hits-more onclick={() => (pages += 1)}>
            <span>{m.list_more({ count: Math.min(PAGE, hitsRemaining) })}</span>
          </button>
        {/if}
      {/if}

      {#if foundNothing}
        <Notice
          icon="search"
          key="hub-search-none"
          title={m.no_results()}
          text={m.no_results_body({ query: typed })}
        />
      {/if}
    </div>
  {:else}
    <div class="screen-part" data-hub-index transition:collapse={{ skip: leaving }}>
      {#each sections as section (section.key)}
        <SectionHeading text={hubGroupHeading(section.key)} />
        <ListCard role={roleAt(activeFlag.roles, hubSectionRoleIndex(section.key))}>
          {#each section.rows as row (row.spec.key)}
            <ListRow
              key={row.spec.key}
              icon={row.spec.icon}
              title={hubRowTitle(row.spec.key)}
              subtitle={hubRowLine(row.spec.key, row.line, today, nowMs)}
              href={row.spec.href}
              data-hub-section={section.key}
              data-hub-line={row.line.kind}
            />
          {/each}
        </ListCard>
      {/each}
    </div>
  {/if}
</div>
