<script lang="ts">
  /* The rows one screen hosts on the More hub's behalf (phase 9 carpet
     ticket 16).

     Seven rows left the hub for the screen that owns them, and what they
     took with them is two rules the hub had been applying for them.

     Hiding an area takes it out of the navigation - ADR-0052's own
     consequence, and CONTEXT.md's "Hidden" says it in those words. Drawn as
     a literal `<ListRow>` on each host, a hidden side-effects area would
     have gone from the hub and stayed on the changes screen, which is
     hiding that hides nothing. And an area the person has declared finished
     says so under its title, in the same words `area_finish_done_title`
     uses on the screen where they said it.

     Both are `hubRows.ts`'s, unchanged: `rowHidden` over the area record,
     and `rowLine` for the line. So this component is the one place either
     rule is applied off the hub, rather than the fifth copy of it.

     One read, and the row is not drawn until it lands. A hidden row that
     appears for a frame and then goes is the one failure mode worth a wait
     here, and there is nothing to wait for behind it - the titles are the
     screen's, not the journal's.

     `lastWrites` is deliberately empty. `rowLine` consults it only after
     finished and suspended have been ruled out, so what a hosted row shows
     is the day an area ended, or otherwise the standing line about what is
     behind it (`hubLabels.ts`) - never a reading. A reading would cost every
     host screen the assembled last-write call, which is the hub's own
     measured read (`hub-last-writes`), for a date the screen one tap away
     opens on. */
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { rowLine, rowsHostedBy, rowHidden, type HubRowHostKey } from '$lib/data/hubRows';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';

  let {
    host,
    card = false
  }: {
    /** Which screen's rows to draw, from `HUB_ROW_HOSTS`. */
    host: HubRowHostKey;
    /** Whether these rows are a card of their own. False where they join a
        list the host screen already draws - Settings' tracking card, Stats'
        look-back list - and true where they are the whole of a trailing
        block, which is also what makes the block disappear along with its
        last row. */
    card?: boolean;
  } = $props();

  const today = todayEpochDay();

  let statesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  let states = $derived(statesQuery.value);

  let rows = $derived(
    states === undefined
      ? []
      : rowsHostedBy(host)
          .filter((row) => !rowHidden(row, states))
          .map((row) => ({ row, line: rowLine(row, { todayEpochDay: today, lastWrites: {}, states }) }))
  );
</script>

{#snippet hostedRows()}
  {#each rows as { row, line } (row.key)}
    <ListRow
      key={row.key}
      icon={row.icon}
      title={hubRowTitle(row.key)}
      subtitle={hubRowLine(row.key, line, today)}
      href={row.href}
      data-hub-host={host}
      data-hub-line={line.kind}
    />
  {/each}
{/snippet}

{#if card}
  {#if rows.length}
    <ListCard>{@render hostedRows()}</ListCard>
  {/if}
{:else}
  {@render hostedRows()}
{/if}
