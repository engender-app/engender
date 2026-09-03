<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { OfferCopy } from '$lib/data/offers';
  import MoodPicker from './MoodPicker.svelte';
  import Sheet from './Sheet.svelte';

  /* Offering a felt-sense entry on a milestone (phase 5 ticket 24, CONTEXT:
     "Felt-sense entry") - at its own creation and again on each anniversary
     showing (MilestoneCard, settings/milestones) - never required, so the
     open/close state stays with whichever screen is offering it, the same
     shape a delete-confirmation sheet already uses there: `onSkip` is what
     resets it, not a bindable `open` this component owns itself.

     Its words arrive as one `copy` object rather than as a title the screen
     types out (phase 8 features ticket 22). The two showings are two
     entries in the offer registry, and what an offer says lives beside what
     it writes. */

  let {
    open,
    copy,
    onSave,
    onSkip
  }: {
    open: boolean;
    copy: OfferCopy;
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

  async function save() {
    if (mood == null) return;
    await onSave({ mood, note: note.trim() || null });
  }
</script>

<Sheet {open} title={copy.title()} onClose={onSkip}>
  <h3>{copy.title()}</h3>
  <MoodPicker value={mood} onPick={(v) => (mood = v)} compact />
  <textarea
    class="input"
    rows="2"
    style="margin-top:var(--space-3)"
    placeholder={m.tryout_feeling_note_placeholder()}
    bind:value={note}
  ></textarea>
  <div class="stack-3" style="margin-top:var(--space-3)">
    <button class="btn btn-primary" disabled={mood == null} data-save-feeling-offer onclick={save}>
      <span>{copy.confirm()}</span>
    </button>
    <button class="btn btn-ghost" data-skip-feeling-offer onclick={onSkip}><span>{copy.decline()}</span></button>
  </div>
</Sheet>
