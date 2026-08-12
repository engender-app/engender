<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { todayEpochDay, epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import RiveSlot from '$lib/components/RiveSlot.svelte';
  import Switch from '$lib/components/Switch.svelte';

  const STEPS = 6;
  let step = $state(0);
  let name = $state('');
  let preset = $state('p-btw');
  let milestoneTemplate = $state<string | null>(null);
  let milestoneDate = $state('');
  let appLock = $state(false);

  async function finish() {
    prefs.name = name.trim();
    prefs.activePreset = preset;
    prefs.onboarded = true;
    if (milestoneTemplate) {
      const tpl = vocabulary.milestoneTemplates.find((t) => t.key === milestoneTemplate)!;
      const epochDay = epochDayFromDateInputValue(milestoneDate) ?? todayEpochDay() - 1;
      // Awaited before leaving: Home reads milestones off the mirror, which
      // refreshes from the write, and navigating first would race it.
      await journal.milestones.upsertMilestone({ name: tpl.name, epochDay, templateKey: tpl.key });
    }
    /* The toggle above is a choice to set a PIN, not a PIN: nothing turns
       app lock on until one has been typed twice on the setup screen
       (ticket 17), which then brings the new user Home itself. */
    goto(appLock ? '/settings/lock?setup=1&next=/' : '/');
  }
</script>

<div class="screen">
  <PrideAurora />
  <div class="onboarding">
    <div class="onboarding-progress" aria-label={m.ob_step_of({ step: String(step + 1), total: String(STEPS) })}>
      {#each Array.from({ length: STEPS }) as _, i (i)}<span class="ob-dot" class:is-done={i <= step}></span>{/each}
    </div>
    <div class="onboarding-body">
      {#if step === 0}
        <RiveSlot label={m.rive_welcome()} height={160} />
        <h1 class="ob-title">{m.ob_welcome_title()}</h1>
        <p class="ob-text">{m.ob_welcome_body()}</p>
        <div class="ob-actions">
          <button class="btn btn-primary" data-next onclick={() => step++}><span>{m.ob_start_setup()}</span></button>
        </div>
      {:else if step === 1}
        <h1 class="ob-title">{m.ob_name_title()}</h1>
        <p class="ob-text">{m.ob_name_body()}</p>
        <div class="field">
          <input class="input" id="ob-name" name="ob-name" placeholder={m.ob_name_placeholder()} autocomplete="off" bind:value={name} />
        </div>
        <div class="ob-actions">
          <button class="btn btn-primary" data-next onclick={() => step++}><span>{m.continue()}</span></button>
          <button
            class="btn btn-ghost"
            onclick={() => {
              name = '';
              step++;
            }}><span>{m.skip()}</span></button
          >
        </div>
      {:else if step === 2}
        <h1 class="ob-title">{m.ob_track_title()}</h1>
        <p class="ob-text">{m.ob_track_body()}</p>
        <div class="list-group">
          {#each vocabulary.presets as p (p.id)}
            <button class="list-row" data-preset={p.id} onclick={() => (preset = p.id)}>
              <span class="row-text">
                <span class="row-title">{p.name}</span>
                <span class="row-subtitle">{m.scales_count({ count: String(p.dims.length) })}</span>
              </span>
              {#if preset === p.id}<Icon name="check" size={20} />{/if}
            </button>
          {/each}
        </div>
        <div class="ob-actions">
          <button class="btn btn-primary" data-next onclick={() => step++}><span>{m.continue()}</span></button>
        </div>
      {:else if step === 3}
        <h1 class="ob-title">{m.ob_milestone_title()}</h1>
        <p class="ob-text">{m.ob_milestone_body()}</p>
        <div class="tag-row" style="margin-bottom:var(--space-4)">
          {#each vocabulary.milestoneTemplates.slice(0, 4) as tp (tp.key)}
            <button
              class="tag-chip"
              class:is-selected={milestoneTemplate === tp.key}
              data-tpl={tp.key}
              onclick={() => (milestoneTemplate = milestoneTemplate === tp.key ? null : tp.key)}
            >
              {#if milestoneTemplate === tp.key}<Icon name="check" size={14} />{/if}{tp.name}
            </button>
          {/each}
        </div>
        {#if milestoneTemplate}
          <div class="field">
            <label class="field-label" for="ob-mdate">{m.ob_when()}</label>
            <input class="input" type="date" id="ob-mdate" name="ob-mdate" bind:value={milestoneDate} />
          </div>
        {/if}
        <div class="ob-actions">
          <button class="btn btn-primary" data-next onclick={() => step++}><span>{m.continue()}</span></button>
          <button
            class="btn btn-ghost"
            onclick={() => {
              milestoneTemplate = null;
              step++;
            }}><span>{m.not_now()}</span></button
          >
        </div>
      {:else if step === 4}
        <h1 class="ob-title">{m.ob_lock_title()}</h1>
        <p class="ob-text">{m.ob_lock_body()}</p>
        <div class="card spread">
          <span class="row-text">
            <span class="row-title">{m.app_lock()}</span><span class="row-subtitle">{m.ob_pin_sub()}</span>
          </span>
          <Switch checked={appLock} label={m.app_lock()} onChange={(v) => (appLock = v)} />
        </div>
        <div class="ob-actions">
          <button class="btn btn-primary" data-next onclick={() => step++}><span>{m.continue()}</span></button>
        </div>
      {:else}
        <RiveSlot label={m.rive_journey_start()} height={140} />
        <h1 class="ob-title">{name ? m.ob_done_title_named({ name }) : m.ob_done_title()}</h1>
        <p class="ob-text">{m.ob_done_body()}</p>
        <div class="ob-actions">
          <button class="btn btn-primary" data-finish onclick={finish}><span>{m.start_journey()}</span></button>
        </div>
      {/if}
    </div>
  </div>
</div>
