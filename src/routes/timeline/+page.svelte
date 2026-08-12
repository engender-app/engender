<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { reference } from '$lib/data/live/reference.svelte';
  import { todayEpochDay, calendarDuration } from '$lib/data/epochDay';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import type { Milestone } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  type Item =
    | { kind: 'milestone'; m: Milestone; status: string; future: boolean }
    | { kind: 'gap'; label: string; id: string }
    | { kind: 'today'; id: string };

  /* Milestones are mirrored (ADR-0004), so this screen needs no loading
     state: they arrive with boot, bounded at tens of rows and already in
     date order from the journal. */
  let items = $derived.by(() => {
    const ms = reference.milestones;
    const today = todayEpochDay();
    const out: Item[] = [];
    let prevDay: number | null = null;
    let todayInserted = false;
    for (const mi of ms) {
      if (!todayInserted && prevDay != null && prevDay <= today && mi.epochDay > today) {
        out.push({ kind: 'today', id: 'today' });
        todayInserted = true;
      }
      if (prevDay != null && mi.epochDay - prevDay > 420) {
        const label = fmtDuration(calendarDuration(prevDay, mi.epochDay));
        out.push({ kind: 'gap', label, id: 'gap-' + mi.id });
      }
      const s = milestoneStatus(mi, today);
      const status =
        s.type === 'countdown'
          ? m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) })
          : s.type === 'today'
            ? m.ms_status_today()
            : m.ms_status_years_ago({ years: m.n_years({ n: s.years ?? 0 }) });
      out.push({ kind: 'milestone', m: mi, status, future: mi.epochDay > today });
      prevDay = mi.epochDay;
    }
    return out;
  });
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.timeline()}</h1>
    <div class="header-action">
      <a class="icon-btn" href="/settings/milestones" aria-label={m.tl_add_aria()}><Icon name="plus" size={22} /></a>
    </div>
  </header>

  {#if reference.milestones.length}
    <p class="muted small" style="margin-bottom:var(--space-5)">{m.tl_intro()}</p>
    <div class="timeline">
      {#each items as item (item.kind === 'milestone' ? item.m.id : item.id)}
        {#if item.kind === 'today'}
          <div class="tl-item tl-today">
            <span class="tl-dot is-today"></span>
            <div class="tl-body"><span class="tl-name muted small">{m.tl_you_are_here()}</span></div>
          </div>
        {:else if item.kind === 'gap'}
          <div class="tl-gap" aria-label={m.tl_gap_aria({ duration: item.label })}>
            <span class="tl-gap-line"></span><span class="tl-gap-label">{m.tl_gap_label({ duration: item.label })}</span><span class="tl-gap-line"></span>
          </div>
        {:else}
          <div class="tl-item" class:is-future={item.future}>
            <span class="tl-dot"></span>
            <div class="tl-body card">
              <div class="spread">
                <span class="tl-name">{item.m.name}</span>
                {#if item.future}<span class="tl-count">{item.status}</span>{/if}
              </div>
              <span class="tl-date muted small">
                {fmtDay(item.m.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}{item.future ? '' : ' · ' + item.status}
              </span>
              {#if item.m.photo}
                <div style="margin-top:var(--space-3)"><PhotoThumb photo={item.m.photo} size={88} /></div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <EmptyState
      riveLabel={m.rive_empty_timeline()}
      title={m.tl_empty_title()}
      text={m.tl_empty_body()}
    >
      {#snippet action()}
        <a class="btn btn-primary" href="/settings/milestones"><span>{m.tl_empty_action()}</span></a>
      {/snippet}
    </EmptyState>
  {/if}
</div>
