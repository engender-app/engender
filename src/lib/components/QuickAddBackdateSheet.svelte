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
</script>

<Sheet bind:open title={m.another_day()}>
  <h3>{m.another_day()}</h3>
  <label class="field-label" for="backdate">{m.another_day()}</label>
  <div class="spread" style="margin-top:var(--space-2)">
    <DatePicker id="backdate" name="backdate" max={dateInputValueFromEpochDay(currentDay())} bind:value={backdate} />
    <button class="btn btn-soft press" data-choose="date" onclick={onChooseDate}>{m.go()}</button>
  </div>
</Sheet>
