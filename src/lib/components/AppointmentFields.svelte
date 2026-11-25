<script lang="ts">
  /* An appointment's own facts as fields: what it is for and the kinds this
     journal has used, who it is with, where, what it cost, its day and
     time, and a wait's referred-on day. Shared by the new-appointment sheet
     on the list and the appointment's own screen (prh12, the screen per
     appointment), so the two ask the same way and cannot drift.

     The kind is a free text field with no list of its own. What sits under
     it is the kinds this journal has already used, as chips, because a
     suggestion the person wrote themselves is the only kind the app is
     entitled to make (ADR-0066). On an empty journal there are no chips.

     The "who" is the person's own record of somebody they see
     (functional-audit ticket 27): picked from chips, or made in the
     provider's sheet through "Someone new", which the screen holding these
     fields opens (`onNewProvider`). */
  import { journalTextAutocomplete } from '$lib/platform';
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { collapse, resize } from '$lib/motion/reveal';
  import { fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { flip } from 'svelte/animate';
  import type { CostDraft } from './costDraft';
  import CostField from './CostField.svelte';
  import DatePicker from './DatePicker.svelte';
  import TimePicker from './TimePicker.svelte';
  import Icon from './Icon.svelte';
  import Field from './kit/Field.svelte';

  let {
    kind = $bindable(),
    providerId = $bindable(),
    place = $bindable(),
    note = $bindable(''),
    cost = $bindable(),
    date = $bindable(),
    time = $bindable(),
    referred = $bindable(),
    withNote = false,
    began = false,
    onNewProvider
  }: {
    kind: string;
    providerId: string | null;
    place: string;
    /** Only drawn with `withNote`: the appointment's own screen keeps the
        note in a section of its own with its own save. */
    note?: string;
    cost: CostDraft;
    /** A date input's value, empty for a wait. */
    date: string;
    /** `HH:MM` or empty (ticket 27). */
    time: string;
    referred: string;
    withNote?: boolean;
    /** True for an appointment that began as a wait and has updates: it
        keeps its referred-on field once given a day. */
    began?: boolean;
    /** "Someone new": the holder opens the provider's sheet and picks what
        is saved there. */
    onNewProvider: () => void;
  } = $props();

  let kindsQuery = liveList((j) => j.appointments.getKinds());
  let providersQuery = liveList((j) => j.appointments.getProviders());

  /* The Who chips with "Someone new" as the last of them, one keyed list,
     so a provider made from here fades in where it lands while the chips
     after it travel aside rather than jumping a chip's width. */
  let whoChips = $derived([
    ...providersQuery.rows.map((provider) => ({ key: provider.id, provider })),
    { key: 'new', provider: null }
  ]);
  const chipTravel = (_distance?: number) => (isReducedMotion() ? 0 : motionDuration('--dur-fast'));
  const chipIn = (_node: Element) => (isReducedMotion() ? { duration: 0 } : fadeOnly(motionDuration('--dur-fast')));
</script>

<Field label={m.appointments_kind_label()} id="appointment-kind">
  {#snippet children(id)}
    <input autocomplete={journalTextAutocomplete()}
      class="input"
      {id}
      name="appointment-kind"
      placeholder={m.appointments_kind_placeholder()}
      bind:value={kind}
    />
  {/snippet}
</Field>
{#if kindsQuery.rows.length}
  <!-- The person's own previous kinds, and nothing else ever (ADR-0066). A
       chip fills the field rather than toggling a value, so what is stored
       is still whatever is in the input. Pulled up under the field it
       belongs to. -->
  <div class="ap-kinds">
    <div class="tag-row" role="group" aria-label={m.appointments_kind_label()}>
      {#each kindsQuery.rows as suggestion (suggestion)}
        <button
          class="tag-chip"
          class:is-selected={kind === suggestion}
          aria-pressed={kind === suggestion}
          data-kind={suggestion}
          onclick={() => (kind = suggestion)}
        >
          {suggestion}
        </button>
      {/each}
    </div>
  </div>
{/if}
<!-- Who it is with (ticket 27): one picked at a time, a second tap on it
     unpicking, the way the kind chips above fill rather than lock. -->
<Field label={m.appointments_who_label()} legend id="appointment-who">
  {#snippet children(id)}
    <div class="tag-row ap-who" role="group" aria-labelledby={id} use:resize>
      {#each whoChips as chip (chip.key)}
        <button
          class="tag-chip"
          class:is-selected={!!chip.provider && providerId === chip.provider.id}
          aria-pressed={chip.provider ? providerId === chip.provider.id : undefined}
          data-who={chip.provider?.id}
          data-who-new={chip.provider ? undefined : ''}
          onclick={() => {
            if (!chip.provider) return onNewProvider();
            const picked = chip.provider.id;
            providerId = providerId === picked ? null : picked;
          }}
          animate:flip={{ duration: chipTravel }}
          in:chipIn
        >
          {#if chip.provider}
            {chip.provider.name}
          {:else}
            <Icon name="plus" size={16} />
            {m.appointments_who_new()}
          {/if}
        </button>
      {/each}
    </div>
  {/snippet}
</Field>
<Field label={m.appointments_place_label()} id="appointment-place">
  {#snippet children(id)}
    <input autocomplete={journalTextAutocomplete()}
      class="input"
      {id}
      name="appointment-place"
      bind:value={place}
    />
  {/snippet}
</Field>
{#if withNote}
  <Field label={m.note_label()} id="appointment-note">
    {#snippet children(id)}
      <textarea autocomplete={journalTextAutocomplete()}
        class="input"
        {id}
        name="appointment-note"
        rows="3"
        bind:value={note}
      ></textarea>
    {/snippet}
  </Field>
{/if}
<CostField id="appointment-cost" bind:draft={cost} />
<!-- Day and its time in one box of their own (flow-root), so the time
     arriving and the referred-on field leaving below it on the same tick (a
     day set on a wait) do not read each other's margins mid-travel:
     measured, the wait block's leave otherwise kept 16px under it and the
     buttons stepped up 16px the frame it was removed. -->
<div class="ap-when">
  <Field label={m.appointments_day_label()} id="appointment-date">
    {#snippet children(id, describedBy)}
      <DatePicker name="appointment-date" bind:value={date} {id} {describedBy} />
    {/snippet}
  </Field>
  <!-- The time only goes with a day (ticket 27): clearing the day makes a
       wait, and a wait has no time to keep, so the field closes its height
       rather than standing there unsaved. -->
  {#if date}
    <div transition:collapse>
      <Field label={m.time_label()} id="appointment-time">
        {#snippet children(id)}
          <TimePicker name="appointment-time" bind:value={time} {id} />
        {/snippet}
      </Field>
    </div>
  {/if}
</div>
<!-- A wait's own field, only on a wait: an appointment with no day, or one
     that began as a wait. An ordinary booking has none of it, and clearing
     its day opens it by moving rather than appearing. -->
{#if !date || referred || began}
  <div transition:collapse>
    <Field label={m.appointments_referred_label()} id="appointment-referred">
      {#snippet children(id)}
        <DatePicker name="appointment-referred" bind:value={referred} {id} />
      {/snippet}
    </Field>
  </div>
{/if}

<style>
  /* The chips answer the field above them, so they sit against it rather
     than at the gap between two fields, and keep a field's gap below them:
     a sheet's fieldset spaced its children, a screen's does not, and Who
     sat 4px under the last chip there. */
  .ap-kinds {
    margin-top: calc(var(--space-2) * -1);
    margin-bottom: var(--space-4);
  }

  /* The "Someone new" chip carries its plus inline with its words. */
  .ap-who [data-who-new] {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .ap-when {
    display: flow-root;
  }

  .ap-when > :global(* + *) {
    margin-top: var(--space-4);
  }
</style>
