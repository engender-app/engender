<script lang="ts">
  /* A procedure recovery card (phase 5 ticket 12).
     Presents a procedure with its active lifecycle phase (Planning, Pre-Op,
     Surgery Day, Recovery, Archived), post-op day or countdown badge,
     and quick progress metrics. */
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { procedurePhase, recoveryDay, type ProcedurePhase } from '$lib/data/recoveryDay';
  import type { Milestone, Procedure } from '$lib/data/types';

  let {
    procedure,
    selected = false,
    today = todayEpochDay(),
    linkedMilestone = null,
    photoCount = 0,
    checklistCount = 0,
    onclick,
    onedit,
    ...rest
  }: {
    procedure: Procedure;
    selected?: boolean;
    today?: number;
    linkedMilestone?: Milestone | null;
    photoCount?: number;
    checklistCount?: number;
    onclick?: () => void;
    onedit?: () => void;
    [key: string]: unknown;
  } = $props();

  let phase = $derived<ProcedurePhase>(procedurePhase(procedure.surgeryEpochDay, today));
  let recDay = $derived(recoveryDay(procedure.surgeryEpochDay, today));

  let phaseLabel = $derived.by(() => {
    switch (phase) {
      case 'planning':
        return m.surgery_phase_planning();
      case 'pre_op':
        return recDay.type === 'upcoming'
          ? m.surgery_countdown_badge({ days: String(recDay.days) })
          : m.surgery_phase_pre_op();
      case 'surgery_day':
        return m.surgery_phase_surgery_day();
      case 'recovery':
        return recDay.type === 'since'
          ? m.surgery_post_op_day({ days: String(recDay.days) })
          : m.surgery_phase_recovery();
      case 'archived':
        return m.surgery_phase_archived();
    }
  });

  let phaseIcon = $derived.by(() => {
    switch (phase) {
      case 'planning':
        return 'clipboard';
      case 'pre_op':
        return 'clock';
      case 'surgery_day':
        return 'flag';
      case 'recovery':
        return 'heart';
      case 'archived':
        return 'archive';
    }
  });

  let dateDetail = $derived.by(() => {
    if (procedure.surgeryEpochDay === null) return m.surgery_date_none();
    const formatted = fmtDay(procedure.surgeryEpochDay, { day: 'numeric', month: 'short', year: 'numeric' });
    if (phase === 'pre_op' && recDay.type === 'upcoming') {
      return `${formatted} · ${m.surgery_day_upcoming({ days: m.n_days({ n: recDay.days }) })}`;
    }
    if (phase === 'recovery' && recDay.type === 'since') {
      return `${formatted} · ${m.surgery_day_since({ days: m.n_days({ n: recDay.days }) })}`;
    }
    if (phase === 'archived' && recDay.type === 'since') {
      return `${formatted} · ${m.surgery_archived_summary({ days: String(recDay.days) })}`;
    }
    if (phase === 'surgery_day') {
      return `${formatted} · ${m.surgery_day_of()}`;
    }
    return formatted;
  });
</script>

<div
  class="kit-row is-split proc-card"
  data-procedure-card={procedure.id}
  data-procedure={procedure.id}
  data-phase={phase}
  class:is-active-card={selected}
  {...rest}
>
  <button
    type="button"
    class="kit-row-main press"
    aria-expanded={selected}
    aria-label={m.surgery_row_aria({ name: procedure.name })}
    {onclick}
  >
    <span class="kit-row-ico proc-phase-icon" data-phase={phase}>
      <Icon name={phaseIcon} size={22} />
    </span>
    <span class="kit-row-text">
      <span class="proc-title-row">
        <span class="kit-row-title">{procedure.name}</span>
        <span class="kit-pill proc-phase-pill" data-phase-pill={phase}>{phaseLabel}</span>
      </span>
      <span class="kit-row-sub">{dateDetail}</span>
      {#if linkedMilestone || photoCount > 0 || procedure.consults.length > 0 || checklistCount > 0}
        <span class="proc-badges">
          {#if linkedMilestone}
            <span class="proc-badge-tag" data-linked-milestone>
              <Icon name="flag" size={13} />
              <span>{m.surgery_milestone_linked_badge()}</span>
            </span>
          {/if}
          {#if procedure.consults.length > 0}
            <span class="proc-badge-tag">
              <Icon name="calendar" size={13} />
              <span>{procedure.consults.length}</span>
            </span>
          {/if}
          {#if photoCount > 0}
            <span class="proc-badge-tag">
              <Icon name="image" size={13} />
              <span>{photoCount}</span>
            </span>
          {/if}
          {#if checklistCount > 0}
            <span class="proc-badge-tag">
              <Icon name="check" size={13} />
              <span>{checklistCount}</span>
            </span>
          {/if}
        </span>
      {/if}
    </span>
  </button>
  {#if onedit}
    <button
      type="button"
      class="kit-row-act press"
      data-edit-procedure={procedure.id}
      aria-label={m.surgery_edit_sheet()}
      onclick={onedit}
    >
      <Icon name="pencil" size={18} />
    </button>
  {/if}
</div>

<style>
  .proc-card {
    min-height: 48px;
  }

  .proc-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
  }

  .proc-phase-pill {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex: 0 0 auto;
  }

  .proc-phase-icon[data-phase='recovery'],
  .proc-phase-icon[data-phase='surgery_day'] {
    color: var(--role-mark, var(--accent));
  }

  .proc-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1-5);
    margin-top: var(--space-1);
  }

  .proc-badge-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--text-xs);
    color: var(--text-2);
    background: var(--surface-2, color-mix(in oklab, var(--text) 6%, transparent));
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .is-active-card {
    background: var(--surface-2, color-mix(in oklab, var(--role, var(--accent)) 8%, transparent));
  }
</style>
