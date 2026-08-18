<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { RESOURCES_REVIEWED_ON, resourcesFor, type ResourceRegion } from '$lib/resources/directory';
  import { resourceDescription, resourceHours } from '$lib/resources/labels';

  const GROUPS: { region: ResourceRegion; title: () => string }[] = [
    { region: 'pl', title: () => m.resources_group_pl() },
    { region: 'int', title: () => m.resources_group_int() }
  ];

  /* A tel: URI takes no spaces, but the number on screen keeps them: one is
     for the dialler and one is for a person reading it off to someone. */
  const dial = (phone: string) => `tel:${phone.replaceAll(' ', '')}`;

  /* The host alone, which is what a person recognizes and what fits a phone
     column. The full address is still where the link goes. */
  const shownUrl = (url: string) => new URL(url).host.replace(/^www\./, '');

  const reviewedOn = $derived(() => {
    const epochDay = epochDayFromDateInputValue(RESOURCES_REVIEWED_ON);
    return epochDay == null
      ? RESOURCES_REVIEWED_ON
      : fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  });
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.resources_title()}</h1>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.resources_intro()}</p>

  {#each GROUPS as group (group.region)}
    <SectionTitle text={group.title()} />
    <div class="list-group">
      {#each resourcesFor(group.region) as resource (resource.key)}
        <div class="list-row resource-row">
          <span class="row-text">
            <span class="row-title">{resource.name}</span>
            <span class="row-subtitle">{resourceDescription(resource.key)}</span>
            <span class="resource-links">
              {#if resource.phone}
                <a class="resource-link" href={dial(resource.phone)} aria-label={m.resources_call({ name: resource.name })}>
                  <Icon name="bell" size={16} />
                  <span>{resource.phone}</span>
                </a>
                {#if resourceHours(resource.key)}
                  <span class="resource-hours">{resourceHours(resource.key)}</span>
                {/if}
              {/if}
              {#if resource.url}
                <a
                  class="resource-link"
                  href={resource.url}
                  rel="noreferrer"
                  aria-label={m.resources_open({ name: resource.name })}
                >
                  <Icon name="globe" size={16} />
                  <span>{shownUrl(resource.url)}</span>
                </a>
              {/if}
            </span>
          </span>
        </div>
      {/each}
    </div>
  {/each}

  <p class="muted small" style="margin-top:var(--space-4)">{m.resources_reviewed({ date: reviewedOn() })}</p>
  <p class="muted small" style="margin-top:var(--space-2)">{m.resources_leaving()}</p>
</div>

<style>
  /* The row holds four stacked things rather than the usual title and
     subtitle, so it grows instead of centring in 56px. */
  .resource-row {
    align-items: flex-start;
    cursor: default;
    padding-top: var(--space-3);
    padding-bottom: var(--space-3);
  }
  .resource-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin-top: var(--space-2);
  }
  .resource-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    /* 44px of target on a phone, which the 16px icon and the label alone
       would not reach. */
    min-height: 44px;
    color: var(--accent);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .resource-link:hover { text-decoration: underline; }
  .resource-hours {
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>
