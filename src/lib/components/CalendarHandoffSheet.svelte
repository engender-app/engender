<script lang="ts">
  /* The share sheet ticket 03's calendar builder was missing (phase 10
     redesign ticket 18, ADR-0067). One sheet, opened from the three surfaces
     that carry a dated thing worth a mark: the appointment editor, the
     surgery editor and a sealed letter's row.

     A disclosure surface (the ticket's own words), so the copy leads with
     what a shared calendar exposes rather than with the control: whatever
     lands there is readable by whoever else sees that calendar, and the
     title is the one thing the app hands over, so the person decides it
     rather than the app. The default text is prefilled, never blank, so
     what would be shared is visible before anything is typed.

     Declining is every dismissal but Share - the backdrop, Escape, the drag
     - and writes nothing, the same as every other sheet in this app that
     holds no record of its own. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { nameSlug } from '$lib/data/fold';
  import { buildCalendarEvent, type CalendarEventKind } from '$lib/data/calendarFile';
  import { calendarEventDefaultTitle } from '$lib/data/vocabulary/calendarEventLabel';
  import { deliverBlob } from '$lib/data/archive/deliver';
  import { toast } from '$lib/stores/toasts.svelte';
  import Sheet from './Sheet.svelte';
  import Field from './kit/Field.svelte';

  let {
    open,
    kind,
    epochDay,
    onClose
  }: {
    open: boolean;
    kind: CalendarEventKind;
    /** The day the record already carries - a surgery date, an appointment,
        a letter's unlock day. Read fresh each time the sheet opens. */
    epochDay: number;
    onClose: () => void;
  } = $props();

  let title = $state('');
  // Only an appointment may carry a time (calendarFile.ts) - the record
  // itself never stores one, so this is where a person types it in.
  let time = $state('');

  $effect(() => {
    if (open) {
      title = calendarEventDefaultTitle(kind);
      time = '';
    }
  });

  const dayLabel = $derived(fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' }));

  async function share() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const ics = buildCalendarEvent(
      kind === 'appointment'
        ? { kind, epochDay, title: trimmed, time: time || undefined, nowEpochMs: Date.now() }
        : { kind, epochDay, title: trimmed, nowEpochMs: Date.now() }
    );
    try {
      const delivery = await deliverBlob(
        `${nameSlug(trimmed) || 'event'}.ics`,
        new Blob([ics], { type: 'text/calendar' })
      );
      if (delivery === 'cancelled') {
        toast(m.exp_cancelled());
        return;
      }
      toast(delivery === 'shared' ? m.pj_shared() : m.pj_downloaded());
      onClose();
    } catch (error) {
      console.error('a calendar file could not be shared', error);
      toast(m.pj_failed());
    }
  }
</script>

<Sheet {open} title={m.calendar_handoff_button()} {onClose}>
  <h3>{m.calendar_handoff_button()}</h3>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.calendar_handoff_disclosure()}</p>

  <Field label={m.calendar_handoff_title_label()} id="calendar-handoff-title">
    {#snippet children(id)}
      <input class="input" {id} name="calendar-handoff-title" bind:value={title} />
    {/snippet}
  </Field>

  {#if kind === 'appointment'}
    <Field label={m.calendar_handoff_time_label()} id="calendar-handoff-time">
      {#snippet children(id)}
        <input class="input" type="time" {id} name="calendar-handoff-time" bind:value={time} />
      {/snippet}
    </Field>
  {/if}

  <p class="muted small" style="margin-bottom:var(--space-4)" data-calendar-handoff-day>{dayLabel}</p>

  <button
    class="btn btn-primary btn-block"
    data-share-to-calendar
    disabled={title.trim().length === 0}
    onclick={share}
  >
    <span>{m.calendar_handoff_share()}</span>
  </button>
</Sheet>
