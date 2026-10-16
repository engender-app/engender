<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import Sheet from './Sheet.svelte';
  import DatePicker from './DatePicker.svelte';

  let {
    open = $bindable(false),
    backdate = $bindable(''),
    onChooseDate
  }: {
    open: boolean;
    backdate: string;
    onChooseDate: () => void;
  } = $props();

  /* The fan mounts this with `open` already true, and a Sheet created open
     skips its own entrance (Svelte transitions are local to the block that
     creates them), so the scrim tint and the sheet landed at full strength in
     one frame over the bottom bar. Mount closed and open on the next effect,
     before the first paint, so the sheet's `{#if}` flips and its rise and
     scrim fade play. A close reports back through `onClose`. */
  let shown = $state(false);
  $effect(() => {
    shown = open;
  });
</script>

<Sheet bind:open={shown} onClose={() => (open = false)} title={m.another_day()}>
  <h3>{m.another_day()}</h3>
  <label class="field-label" for="backdate">{m.another_day()}</label>
  <div class="spread" style="margin-top:var(--space-2)">
    <DatePicker id="backdate" name="backdate" max={dateInputValueFromEpochDay(currentDay())} bind:value={backdate} />
    <button class="btn btn-soft press" data-choose="date" onclick={onChooseDate}>{m.go()}</button>
  </div>
</Sheet>
