<script lang="ts">
  /* The paper somebody keeps (phase 8 features ticket 52, ADR-0065).

     A row is the paper icon, the title and the date, and never the page
     itself. That is ADR-0065's decision and it is about the room the phone
     is held in rather than about the schema: a grid of thumbnails of
     scanned diagnoses would be the most glanceable screen in the app.
     Disguise is branding only and a per-document hide flag is out
     (ADR-0063), so layout is what carries it - the page image lives one
     deliberate tap away, on the document's own screen.

     Importing is two steps and the order matters: the file is chosen first,
     and the sheet that asks for a title and a date only opens once there is
     something to file. Backing out of the picker leaves no half-filled
     sheet behind. The title is required because a document has no other
     handle - search matches it and nothing else - and there is no honest
     default: a scan is called `scan_0142.jpg` and "Document 3" is worse
     than asking. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import type { DocumentFile } from '$lib/data/documents/accept';
  import type { JournalDocument } from '$lib/data/types';
  import { documentTargetKindLabel } from '$lib/data/vocabulary/documentTargetLabels';
  import { pickDocument } from '$lib/stores/documentPicking';
  import { toast } from '$lib/stores/toasts.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let documentsQuery = liveList((j) => j.documents.getDocuments());

  /* The bytes waiting for a title. Held here rather than in the draft
     because they are not a field somebody edits, and because a sheet closed
     without them saved would otherwise look like a document with no file. */
  let picked = $state<DocumentFile | null>(null);
  let title = $state('');
  let day = $state(dateInputValueFromEpochDay(todayEpochDay()));
  let saving = $state(false);

  async function startImport() {
    const content = await pickDocument();
    // Backing out of the picker, and a refused file, both leave nothing
    // open (picker.ts's own "backing out is an ordinary outcome"; a
    // refusal already raised its own toast in documentPicking.ts).
    if (!content) return;
    title = '';
    day = dateInputValueFromEpochDay(todayEpochDay());
    picked = content;
  }

  async function saveImport() {
    if (!picked || title.trim() === '' || saving) return;
    saving = true;
    try {
      await journal.documents.addDocument(
        { epochDay: epochDayFromDateInputValueOrToday(day), title },
        picked
      );
      picked = null;
    } catch (error) {
      /* A full disk or an unwritable store. The sheet stays open with the
         bytes and the typed title still in it, so the person can try again
         without picking the file a second time - and the toast says what
         happened rather than leaving a button that did nothing. */
      console.error('a document could not be filed', error);
      toast(m.document_save_failed());
    } finally {
      saving = false;
    }
  }

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* ADR-0065: "a row is a paper icon, the title, the date and the link."
     Generic per-kind wording rather than the target's own name - resolving
     that would mean this list fetching all four kinds' full lists just to
     label one line each, where the target's own name is already one tap
     away on the document's own screen. */
  const linkLabel = (document: { targetKind: JournalDocument['targetKind'] }): string | false =>
    document.targetKind !== null && documentTargetKindLabel(document.targetKind);
</script>

<div class="screen">
  <ScreenHeader title={m.documents_title()} back="/more" subtitle={m.documents_intro()}>
    {#snippet actions()}
      <button
        class="icon-btn press"
        data-add
        aria-label={m.document_add_aria()}
        onclick={startImport}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={documentsQuery} count={3}>
    {#snippet rows(documents)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each documents as document (document.id)}
            <ListRow
              key={document.id}
              icon="documents"
              title={document.title}
              subtitle={[dayLabel(document.epochDay), linkLabel(document)]}
              href={`/media/documents/${document.id}`}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="documents"
          key="documents-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.documents_empty_title()}
          text={m.documents_empty_body()}
          action={{ label: m.documents_empty_action(), primary: true, onclick: startImport }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <Sheet open={picked !== null} title={m.document_new_sheet()} onClose={() => (picked = null)}>
    <h3>{m.document_new_sheet()}</h3>
    <!-- No `hint` on either field: Field.svelte concatenates label and
         hint with no space between them, so both labels carry their own
         meaning instead. The date's says which day it means, which is the
         whole reason it is editable. -->
    <Field label={m.document_title_label()} id="document-title">
      {#snippet children(id)}
        <input class="input" {id} name="document-title" placeholder={m.document_title_placeholder()} bind:value={title} />
      {/snippet}
    </Field>
    <Field label={m.document_day_label()} id="document-day">
      {#snippet children(id)}
        <DatePicker name="document-day" bind:value={day} {id} />
      {/snippet}
    </Field>
    <div class="stack-3">
      <button class="btn btn-primary press" data-save-document disabled={title.trim() === ''} onclick={saveImport}>
        <span>{m.document_save()}</span>
      </button>
    </div>
  </Sheet>
</div>
