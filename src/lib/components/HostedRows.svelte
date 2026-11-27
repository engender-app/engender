<script lang="ts">
  /* Hosted hub rows reuse rowHidden and rowLine (hubRows.ts) to respect
     area visibility and show the same finished or suspended line. Wait
     for the area read before drawing to prevent a hidden row flashing
     into view (ADR-0052).

     Leave lastWrites empty. Active areas use their standing descriptions.
     The hub alone pays for the assembled last-write read. */
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import { untrack, type Snippet } from 'svelte';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { dilationGated } from '$lib/data/taperSchedule';
  import { HUB_ROWS, rowLine, rowHidden, type HubRow, type HubRowKey } from '$lib/data/hubRows';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';

  let {
    host,
    keys,
    card = false,
    ready = true,
    after
  }: {
    /** The screen the rows sit on, for its reserve and its data attribute. */
    host: 'care' | 'surgery';
    /** The hub rows to link to from here: Meds links to cycle events and the surgery list to dilation.
        The same rules apply to them - a hidden area
        takes the row out, an ended one says so. A caller whose own gate is
        shut passes none, and the card is not drawn. */
    keys: readonly HubRowKey[];
    /** Whether these rows are a card of their own. False where they join a
        list the host screen already draws - Settings' tracking card, Stats'
        look-back list - and true where they are the whole of a trailing
        block, which is also what makes the block disappear along with its
        last row. */
    card?: boolean;
    /** The host's own reads, when `keys` waits on them. */
    ready?: boolean;
    /** Static rows drawn under the card's links, inside the same reserve, so
        they arrive with the link rather than after it. The host owns their
        reads and holds `ready` for them. */
    after?: Snippet;
  } = $props();

  const today = $derived(currentDay());
  let estimate = $derived(readReserve(`hosted-${host}`));
  const remember = (px: number) => rememberReserve(`hosted-${host}`, px);

  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  /* Dilation is the one hosted row whose presence is the journal's rather
     than the person's: `dilationGated` hides its area until some procedure
     can carry a dilation journey. Read only for a host that has the row, which is
     fixed for the life of a screen. */
  const drawn = (): HubRow[] =>
    HUB_ROWS.filter((row) => keys.includes(row.key));
  const readsProcedures = untrack(drawn).some((row) => row.key === 'dilation');
  let proceduresQuery = readsProcedures ? liveList((j) => j.procedures.getProcedures()) : null;
  let states = $derived(
    statesQuery.value === undefined || proceduresQuery?.loading
      ? undefined
      : proceduresQuery
        ? dilationGated(statesQuery.value, proceduresQuery.rows)
        : statesQuery.value
  );

  let rows = $derived(
    states === undefined
      ? []
      : drawn()
          /* `cycle-events` reads `rowHidden` as always false, so the gate that decides it
             exists - `cycleTrackingVisible` - is the caller's: Meds passes the key only
             behind it. */
          .filter((row) => !rowHidden(row, states))
          /* No last write and nothing forward: a hosted row is drawn beside
             the very records it would report on (dilation on the surgery
             screen), so its line stays the sentence about what is behind
             it. None of the three is a row `rowForward.ts` answers for
             either, so `{}` is the whole answer rather than a read this
             screen skipped. */
          .map((row) => ({ row, line: rowLine(row, { todayEpochDay: today, lastWrites: {}, states, forward: {} }) }))
  );
</script>

{#snippet hostedRows()}
  {#each rows as { row, line } (row.key)}
    <ListRow
      key={row.key}
      icon={row.icon}
      title={hubRowTitle(row.key)}
      subtitle={hubRowLine(row.key, line, today, Date.now())}
      href={row.href}
      data-hub-host={host}
      data-hub-line={line.kind}
    />
  {/each}
{/snippet}

{#if card}
  <!-- Held rather than drawn when the read lands. The read lands after the
       screen around it, so a card cut in at full height pushed whatever sat
       under it - Care changes' area-finish row, 97px in one frame on every
       cold open - and at full opacity.
       The reserve keeps the card's room from the last visit and fades the
       rows in over it; a card whose height changed travels. -->
  <ReadReserve ready={!statesQuery.loading && !proceduresQuery?.loading && ready} {estimate} onrest={remember} data-hosted-reserve={host}>
    {#if rows.length}
      <ListCard>
        {@render hostedRows()}
        {@render after?.()}
      </ListCard>
    {/if}
  </ReadReserve>
{:else}
  {@render hostedRows()}
{/if}
