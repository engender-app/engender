<script lang="ts">
  /* The surfaces view: one of two screens over the unprompted registry
     (phase 6 ticket 04, generalising ticket 51's consolidated entry). This
     one answers "stop putting things on my home screen" - the live tiles
     (ADR-0039's amendment), the stock notice, and wrapped and on-this-day.
     "Stop buzzing my phone" is the other screen, /settings/notifications,
     over the same list.

     The rows are not written here: $lib/unprompted/registry.ts is what a
     later ticket extends, and this page draws one row per entry with a
     `surface` and nothing else, more/+page.svelte's data-driven shape with a
     Switch at the trailing edge.

     A row carrying a Switch stays a plain .kit-row div, as those four rows
     were on the Tracking card: ListRow renders an <a> or a <button>, and a
     switch inside either would be a control nested in a control - the line
     settings-surfaces.test.ts already holds. */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { SURFACE_ROWS, type UnpromptedRow } from '$lib/unprompted/registry';

  /* Written straight through, the way every switch on these screens is: a
     tick is the change. Turning a kind off also turns its notification off
     (phase 4 features ticket 04's cascading disablement, kept) even though
     that switch now lives on the notifications view - the invariant is that
     nothing fires for a kind that is off, and it holds whichever screen the
     person is standing on. */
  function setKind(row: UnpromptedRow, v: boolean) {
    prefs[row.surface!.prefKey] = v;
    if (!v && row.notify) prefs[row.notify.prefKey] = false;
  }
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.live_tiles_title()} back="/settings" subtitle={m.live_tiles_sub()} />

  <ListCard>
    {#each SURFACE_ROWS as row (row.key)}
      {@const surface = row.surface!}
      <div class="kit-row" data-live-tile={row.key}>
        <span class="kit-row-text">
          <span class="kit-row-title">{row.title()}</span>
          <span class="kit-row-sub">{surface.subtitle()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch checked={prefs[surface.prefKey]} label={row.title()} onChange={(v) => setKind(row, v)} />
        </span>
      </div>
    {/each}
  </ListCard>
</div>
