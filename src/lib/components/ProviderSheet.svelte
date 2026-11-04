<script lang="ts">
  /* A provider's own editor (functional-audit ticket 27): the person's own
     notes on somebody they see. Opened from the list at the foot of the
     appointments screen, or from "Someone new" in an appointment's fields -
     the one case that also hands what was just made back to whoever opened
     it, so making somebody and picking them is one step rather than two.
     Its own component since an appointment's own screen opens it too. */
  import { journalTextAutocomplete } from '$lib/platform';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { undoable } from '$lib/stores/deleteUndo';
  import type { Provider, ProviderCompetence } from '$lib/data/types';
  import { PROVIDER_COMPETENCES } from '$lib/data/journal/appointments';
  import Field from './kit/Field.svelte';
  import RecordSheet from './kit/RecordSheet.svelte';
  import { recordEditor } from './kit/recordEditor.svelte';

  let { providers }: { providers: readonly Provider[] } = $props();

  const competenceLabel: Record<ProviderCompetence, () => string> = {
    good: m.provider_competence_good,
    mixed: m.provider_competence_mixed,
    poor: m.provider_competence_poor
  };

  type ProviderDraft = {
    id?: string;
    name: string;
    contact: string;
    competence: ProviderCompetence | null;
    impressions: string;
  };
  let onCreated: ((id: string) => void) | undefined;
  const providerRecord = recordEditor<Provider, ProviderDraft>({
    blank: () => ({ name: '', contact: '', competence: null, impressions: '' }),
    fromRecord: (provider) => ({
      id: provider.id,
      name: provider.name,
      contact: provider.contact ?? '',
      competence: provider.competence,
      impressions: provider.impressions ?? ''
    }),
    async upsert(draft) {
      const id = await journal.appointments.upsertProvider({
        id: draft.id,
        name: draft.name,
        contact: draft.contact,
        competence: draft.competence,
        impressions: draft.impressions
      });
      if (!draft.id) onCreated?.(id);
    },
    remove: (id) => undoable((j) => j.appointments.deleteProvider(id)),
    findById: (id) => providers.find((provider) => provider.id === id)
  });

  /** Opens a provider, or a new one; `created` is handed the new one's id
      once it is saved. */
  export function open(provider: Provider | null, created?: (id: string) => void) {
    onCreated = created;
    providerRecord.openEditor(provider);
  }
</script>

<RecordSheet
  record={providerRecord}
  handle="provider"
  newTitle={m.provider_new_sheet()}
  editTitle={m.provider_edit_sheet()}
  saveLabel={m.appointments_save()}
  deleteLabel={m.appointments_delete()}
  canSave={(draft) => draft.name.trim().length > 0}
  confirm={{
    title: m.provider_delete_sheet(),
    question: () => m.provider_delete_q(),
    hint: () => m.provider_delete_hint(),
    confirmLabel: m.appointments_delete(),
    cancelLabel: m.keep_it()
  }}
>
  {#snippet fields(draft)}
    <p class="muted small">{m.provider_private()}</p>
    <Field label={m.provider_name_label()} id="provider-name">
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="provider-name"
          placeholder={m.provider_name_placeholder()}
          bind:value={draft.name}
        />
      {/snippet}
    </Field>
    <Field label={m.provider_contact_label()} id="provider-contact">
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="provider-contact"
          placeholder={m.provider_contact_placeholder()}
          bind:value={draft.contact}
        />
      {/snippet}
    </Field>
    <!-- Three answers and none, as toggles: tapping the picked one again
         takes the answer back, so "not said" needs no fourth chip. -->
    <Field label={m.provider_competence_label()} legend id="provider-competence">
      {#snippet children(id)}
        <div class="tag-row" role="group" aria-labelledby={id}>
          {#each PROVIDER_COMPETENCES as competence (competence)}
            <button
              class="tag-chip"
              class:is-selected={draft.competence === competence}
              aria-pressed={draft.competence === competence}
              data-competence={competence}
              onclick={() => (draft.competence = draft.competence === competence ? null : competence)}
            >
              {competenceLabel[competence]()}
            </button>
          {/each}
        </div>
      {/snippet}
    </Field>
    <Field label={m.provider_impressions_label()} id="provider-impressions">
      {#snippet children(id)}
        <textarea autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="provider-impressions"
          rows="3"
          placeholder={m.provider_impressions_placeholder()}
          bind:value={draft.impressions}
        ></textarea>
      {/snippet}
    </Field>
  {/snippet}
</RecordSheet>
