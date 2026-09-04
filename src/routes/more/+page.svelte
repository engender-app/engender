<script lang="ts">
  /* The More hub, reading its own data (phase 8 UX ticket 02).

     Twenty-six rows of a title and an icon, in four groups, used to be
     declared inline here as four const arrays, and only `/care` said anything
     about what was behind it. Every row says something now, and this screen
     owns none of the reasoning: `hubRows.ts` holds the rows and what sits
     behind them, `vocabulary/hubLabels.ts` holds the words. What is left here
     is three live reads and a loop.

     Three, not one per row. The readings come out of one assembled call
     (`journal/lastWrite.ts`, measured as `hub-last-writes` before this screen
     was written), beside the area record and the regimen episode list
     ADR-0043's gate needs.

     Nothing gates the screen on them. This is a navigation surface, and a
     skeleton in front of twenty-six links a person can already read would be
     slower than the links. */
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { HUB_GROUP_KEYS, hubSections, type HubSection } from '$lib/data/hubRows';
  import { hubGroupHeading, hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';

  const today = todayEpochDay();

  /* ADR-0043: the cycle row is the one row here that has to be able to not
     exist - read cold, a permanent cycle prompt tells a transfemme reader
     this hub was not drawn for them. It stays written in `hubRows.ts` so its
     shape is held like any other row's, and this one visibility rule - an
     active testosterone regimen or the explicit opt-in - decides whether the
     row is in the card. Hiding the row is all it does: the screen behind it
     and its records are untouched, and its direct URL still answers. */
  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let cycleShown = $derived(cycleTrackingVisible(episodesQuery.rows, Date.now(), prefs.cycleTrackingEnabled));

  let lastWritesQuery = liveQuery((j) => j.lastWrite.getLastWrites(today));
  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());

  /* Both reads or neither, which is a correctness rule and not only a tidier
     transition. Rendering whichever landed first would put a finished row in
     its old group with a reading under it, and then move it into the finished
     set once the area record arrived - a wrong state on screen, not a partial
     one. Held together, the hub goes from titles to titles-and-lines once.

     Until then the written rows already say their line, because a line about
     what is behind a row needs no read at all. */
  let landed = $derived(
    lastWritesQuery.value !== undefined && statesQuery.value !== undefined
      ? { lastWrites: lastWritesQuery.value, states: statesQuery.value }
      : { lastWrites: {}, states: {} }
  );

  let sections = $derived(hubSections({ todayEpochDay: today, ...landed, cycleShown }));

  /* The group's own place in the list rather than its place among whatever
     rendered, so Body keeps one stripe whether or not a finished group sits
     below it and whether or not the cycle row emptied Health. The finished
     set takes the index after the last group: it is set apart by its heading
     and by every row in it stating the day it ended, not by losing its
     colour - the one uncoloured card on this screen is the Settings row
     below, which is the app talking about itself. */
  const roleIndex = (key: HubSection['key']) =>
    key === 'finished' ? HUB_GROUP_KEYS.length : HUB_GROUP_KEYS.indexOf(key);
</script>

<div class="screen">
  <!-- DIRECTION.md 3d: the hub had "More" stacked directly above its first
       group heading, which is two headers saying nearly the same thing, and
       the tab that reaches this screen is already labelled More. The title
       stays in the document for a screen reader and stops being a second
       visible label. -->
  <ScreenHeader title={m.nav_more()} titleHidden />

  {#each sections as section (section.key)}
    <SectionHeading text={hubGroupHeading(section.key)} />
    <ListCard role={roleAt(activeFlag.roles, roleIndex(section.key))}>
      {#each section.rows as row (row.spec.key)}
        <!-- Which section the row was drawn in and which kind of line it
             carries, both on the row rather than on wrappers of their own: a
             finished row is the same row under a different heading, and the
             line itself is the kit's `.kit-row-sub`, a class and so something
             the walkthrough may not grip (ADR-0029). Naming the kind rather
             than the element also lets a flow tell a reading apart from the
             line about what is behind the row, which the element could
             not. -->
        <ListRow
          key={row.spec.key}
          icon={row.spec.icon}
          title={hubRowTitle(row.spec.key)}
          subtitle={hubRowLine(row.spec.key, row.line, today)}
          href={row.spec.href}
          data-hub-section={section.key}
          data-hub-line={row.line.kind}
        />
      {/each}
    </ListCard>
  {/each}

  <!-- No role: this row is the app talking about itself, not one of the
       journal's own areas (the same call Home's backup notice makes).

       No SectionHeading either - it is one row, not a group - but sitting
       flush under the last card with nothing between them read as if it
       belonged to that group (Alicja, on the live build). A plain margin
       gives it the same clearance a heading would, without a heading that
       has nothing to say. -->
  <div>
    <ListCard>
      <ListRow
        key="settings"
        icon="settings"
        title={m.nav_settings()}
        subtitle={m.hub_settings_row_sub()}
        href="/settings"
      />
    </ListCard>
  </div>
</div>
