<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, dateInputValueFromEpochDay } from '$lib/data/epochDay';
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
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.new_entry_when()}</p>
  <label class="field-label" for="backdate">{m.another_day()}</label>
  <div class="spread" style="margin-top:var(--space-2)">
    <DatePicker id="backdate" name="backdate" max={dateInputValueFromEpochDay(todayEpochDay())} bind:value={backdate} />
    <button class="btn btn-soft press" data-choose="date" onclick={onChooseDate}>{m.go()}</button>
  </div>
</Sheet>
