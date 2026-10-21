<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { prefs, setPreferenceDurably } from '$lib/data/prefs/store.svelte';
  import { writer } from '$lib/stores/attempt.svelte';
  import { isAndroid } from '$lib/platform';
  import Icon from './Icon.svelte';
  import ListRow from './kit/ListRow.svelte';
  import Sheet from './Sheet.svelte';
  import Switch from './Switch.svelte';
  import DisguisePreview from './DisguisePreview.svelte';

  let disguiseSheet = $state(false);
  const disguiseWrite = writer();
  let disguiseAnswer = $state<boolean | null>(null);

  async function setDisguise(on: boolean) {
    if (disguiseWrite.busy) return;
    disguiseAnswer = on;
    await disguiseWrite.run(async () => {
      await setPreferenceDurably('disguise', on);
      if (prefs.disguise !== on) throw new Error('The disguise preference was not saved');
    }, m.write_failed());
    disguiseAnswer = null;
  }
</script>

<ListRow
  key="disguise"
  icon="eyeOff"
  title={m.disguise_row()}
  subtitle={prefs.disguise ? m.settings_disguise_on() : m.settings_row_off()}
  chevron={false}
  onclick={() => (disguiseSheet = true)}
>
  {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
</ListRow>

<Sheet busy={disguiseWrite.busy} bind:open={disguiseSheet} title={m.disguise_row()}>
  <h3>{m.disguise_row()}</h3>
  <div class="stack-3">
    <div class="spread">
      <span class="kit-row-text">
        <span class="kit-row-title">{m.disguise_app_title()}</span>
        <span class="kit-row-sub">
          {isAndroid() ? m.disguise_app_sub_android() : m.disguise_app_sub_web()}
        </span>
      </span>
      <Switch
        checked={disguiseAnswer ?? prefs.disguise}
        label={m.disguise_app_title()}
        onChange={(v) => void setDisguise(v)}
      />
    </div>
    <DisguisePreview on={disguiseAnswer ?? prefs.disguise} />
  </div>
</Sheet>
