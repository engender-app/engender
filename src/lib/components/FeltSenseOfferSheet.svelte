<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { writer } from '$lib/stores/attempt.svelte';
  import type { OfferCopy } from '$lib/data/offers';
  import MoodPicker from './MoodPicker.svelte';
  import Field from './kit/Field.svelte';
  import Sheet from './Sheet.svelte';

  /* Offering a felt-sense entry on a milestone (phase 5 ticket 24, CONTEXT:
     "Felt-sense entry") - at its own creation and again on each anniversary
     showing (both on transition/milestones) - never required, so the
     open/close state stays with whichever screen is offering it, the same
     shape a delete-confirmation sheet already uses there: `onSkip` is what
     resets it, not a bindable `open` this component owns itself.

     Its words arrive as one `copy` object rather than as a title the screen
     types out (phase 8 features ticket 22). The two showings are two
     entries in the offer registry, and what an offer says lives beside what
     it writes.

     `subject` names what is being asked about. An anniversary offer can
     come up for two milestones on one day, and a sheet that only asks "How
     does it feel now?" leaves the person to remember which row they
     tapped (phase 15 after-release ticket 15). */

  let {
    open,
    copy,
    subject,
    onSave,
    onSkip
  }: {
    open: boolean;
    copy: OfferCopy;
    subject?: string;
    onSave: (input: { mood: number; note: string | null }) => void | Promise<void>;
    onSkip: () => void;
  } = $props();

  let mood = $state<number | null>(null);
  let note = $state('');

  $effect(() => {
    if (open) {
      mood = null;
      note = '';
    }
  });

  /* One write per tap, and a failed one says so here rather than nowhere
     (after-release 06): some callers close the sheet before they write. */
  const saving = writer();
  async function save() {
    if (mood == null) return;
    const input = { mood, note: note.trim() || null };
    await saving.run(() => onSave(input), m.write_failed());
  }
</script>

<Sheet busy={saving.busy} {open} title={copy.title()} onClose={onSkip}>
  <h3>{copy.title()}</h3>
  {#if subject}<p class="muted" data-feeling-offer-subject>{subject}</p>{/if}
  <MoodPicker value={mood} onPick={(v) => (mood = v)} compact />
  <!-- Labelled, as the tryout's own note field is: the placeholder is an
       example and goes the moment someone types. -->
  <div style="margin-top:var(--space-3)">
    <Field label={m.note_label()} id="felt-sense-offer-note">
      {#snippet children(id)}
        <textarea class="input" {id} rows="2" placeholder={m.tryout_feeling_note_placeholder()} bind:value={note}></textarea>
      {/snippet}
    </Field>
  </div>
  <div class="stack-3" style="margin-top:var(--space-3)">
    <button class="btn btn-primary" disabled={mood == null || saving.busy} data-save-feeling-offer onclick={save}>
      <span>{copy.confirm()}</span>
    </button>
    <button class="btn btn-ghost" data-skip-feeling-offer disabled={saving.busy} onclick={onSkip}><span>{copy.decline()}</span></button>
  </div>
</Sheet>
