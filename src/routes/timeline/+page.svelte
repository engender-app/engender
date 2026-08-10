<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db, todayEpochDay } from '$lib/data/db.svelte';
  import { milestoneStatus } from '$lib/data/repositories/milestones';
  import { fmtDay } from '$lib/data/dates';
  import type { Milestone } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  type Item =
    | { kind: 'milestone'; m: Milestone; status: string; future: boolean }
    | { kind: 'gap'; label: string; id: string }
    | { kind: 'today'; id: string };

  let items = $derived.by(() => {
    const ms = [...db.milestones].sort((a, b) => a.epochDay - b.epochDay);
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
        const years = (mi.epochDay - prevDay) / 365.25;
        const label = years >= 1.5 ? `${Math.round(years)} years` : `${Math.round((mi.epochDay - prevDay) / 30)} months`;
        out.push({ kind: 'gap', label, id: 'gap-' + mi.id });
      }
      const s = milestoneStatus(mi);
      const status =
        s.type === 'countdown'
          ? `in ${s.days} day${s.days === 1 ? '' : 's'}`
          : s.type === 'today'
            ? 'today'
            : `${s.years} year${s.years === 1 ? '' : 's'} ago`;
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
      <a class="icon-btn" href="/settings/milestones" aria-label="Add milestone"><Icon name="plus" size={22} /></a>
    </div>
  </header>

  {#if db.milestones.length}
    <p class="muted small" style="margin-bottom:var(--space-5)">Your journey so far — and what’s ahead.</p>
    <div class="timeline">
      {#each items as item (item.kind === 'milestone' ? item.m.id : item.id)}
        {#if item.kind === 'today'}
          <div class="tl-item tl-today">
            <span class="tl-dot is-today"></span>
            <div class="tl-body"><span class="tl-name muted small">today — you are here</span></div>
          </div>
        {:else if item.kind === 'gap'}
          <div class="tl-gap" aria-label="{item.label} without milestones, compressed">
            <span class="tl-gap-line"></span><span class="tl-gap-label">{item.label} compressed</span><span class="tl-gap-line"></span>
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
      riveLabel="Empty timeline: a winding path"
      title="No milestones yet"
      text="Add the days that matter and watch your journey take shape."
    >
      {#snippet action()}
        <a class="btn btn-primary" href="/settings/milestones"><span>Add a milestone</span></a>
      {/snippet}
    </EmptyState>
  {/if}
</div>
