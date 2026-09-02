<script lang="ts">
  /* Home's link into on-this-day (phase 4 features ticket 03).

     One card for however many of the three lookbacks qualify today - the
     ticket does not ask for exactly one, and ranking them the way wrapped
     ranks cadences would invent an ordering rule this feature has no use
     for. The good-day check for each lookback is the only thing this card
     needs to know before deciding whether to show itself at all.

     Rendered only when on-this-day is on: Home gates on the preference
     before mounting this, so the query below does not exist while the
     feature is off - the same split wrapped's own card makes.

     Home's second look-back tile since phase 5 ticket 21. It used to be a
     full-width card carrying the same gradient wash as wrapped's, on
     purpose, so the two read as siblings; the tiles say that by sitting in
     one grid instead, which is a thing the eye reads without a wash. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { onThisDayCandidates } from '$lib/data/on-this-day';
  import { touchesMutedEra } from '$lib/data/resurfacingConsent';
  import Tile from './kit/Tile.svelte';

  const candidates = onThisDayCandidates(todayEpochDay());

  /* Invalidated on entry or tag writes (the good-day rule's own two
     dependencies), and on either half of the mute layer (phase 6 ticket
     05): eras and era mutes. */
  let goodDaysQuery = liveList(async (j) => {
    const [eras, mutedEraUuids, goodDays] = await Promise.all([
      j.eras.getEras(),
      j.eraMutes.getMutedEraUuids(),
      Promise.all(candidates.map((c) => j.stats.isGoodDay(c.epochDay)))
    ]);
    return candidates.filter(
      (c, i) => goodDays[i] && !touchesMutedEra(eras, mutedEraUuids, c.epochDay, c.epochDay)
    );
  });
  let qualifying = $derived(goodDaysQuery.rows);

  /* The tile's reading: how far back the furthest qualifying day is.
     `qualifying` keeps onThisDayCandidates' order, which is longest first, so
     the head of it is the one worth putting on the tile - "a year" is a
     better reason to tap than "3". Written from the plural messages the rest
     of the app counts time with rather than a string of its own. */
  let distance = $derived.by(() => {
    const furthest = qualifying[0];
    if (!furthest) return undefined;
    if (furthest.key === 'year') return m.n_years({ n: 1 });
    return m.n_months({ n: furthest.key === 'sixMonths' ? 6 : 1 });
  });
</script>

<!-- No skeleton while the check is on its way, for the same reason
     wrapped's card has none: an offer that flickers into place is worse
     than one that arrives a moment late. -->
{#if !goodDaysQuery.loading && qualifying.length}
  <Tile
    title={m.on_this_day()}
    value={distance}
    note={m.on_this_day_home_sub()}
    href="/on-this-day"
    key="on-this-day"
    data-on-this-day-card=""
  />
{/if}
