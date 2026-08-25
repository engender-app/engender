<script lang="ts">
  /* The bundled directory, on the surface kit (phase 5 UX ticket 25).

     Reference data, not the journal's: the list is compiled in, so there is
     nothing to wait for and nothing that can be empty. What changes here is
     the container - a grey letterspaced label above a `.list-group` becomes
     the kit's heading above a list card, and each region takes its own
     stripe of the flag so the two groups read as two areas rather than as
     one long column.

     The rows stay presentational and keep growing to fit four stacked
     things, which is why they are `.kit-row.is-static` rather than
     ListRows: a resource is not a destination, it is a name with two ways
     to reach it, and the two are separate links inside the row. */
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { RESOURCES_REVIEWED_ON, resourcesFor, type ResourceRegion } from '$lib/resources/directory';
  import { resourceDescription, resourceHours } from '$lib/resources/labels';

  const GROUPS: { region: ResourceRegion; title: () => string }[] = [
    { region: 'pl', title: m.resources_group_pl },
    { region: 'int', title: m.resources_group_int }
  ];

  /* A tel: URI takes no spaces, but the number on screen keeps them: one is
     for the dialler and one is for a person reading it off to someone. */
  const dial = (phone: string) => `tel:${phone.replaceAll(' ', '')}`;

  /* The host alone, which is what a person recognizes and what fits a phone
     column. The full address is still where the link goes. */
  const shownUrl = (url: string) => new URL(url).host.replace(/^www\./, '');

  /* Nothing here reacts to anything: the date is a module constant and the
     locale is fixed for the life of the page, so this is a plain const. */
  const reviewedEpochDay = epochDayFromDateInputValue(RESOURCES_REVIEWED_ON);
  const reviewedOn =
    reviewedEpochDay == null
      ? RESOURCES_REVIEWED_ON
      : fmtDay(reviewedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<div class="screen">
  <ScreenHeader title={m.resources_title()} back="/more" subtitle={m.resources_intro()} />

  {#each GROUPS as group, i (group.region)}
    <SectionHeading text={group.title()} />
    <ListCard role={roleAt(activeFlag.roles, i)}>
      {#each resourcesFor(group.region) as resource (resource.key)}
        <div class="kit-row is-static resource-row" data-resource={resource.key}>
          <span class="kit-row-text">
            <span class="kit-row-title">{resource.name}</span>
            <span class="kit-row-sub">{resourceDescription(resource.key)}</span>
            <span class="resource-links">
              {#if resource.phone}
                <!-- No icon: icons.ts has no phone glyph, and the nearest
                     ones already mean something else across the app (a bell
                     is a reminder). A number reads as a number. -->
                <a class="resource-link" href={dial(resource.phone)} aria-label={m.resources_call({ name: resource.name })}>
                  {resource.phone}
                </a>
                {#if resourceHours(resource.key)}
                  <span class="resource-hours">{resourceHours(resource.key)}</span>
                {/if}
              {/if}
              {#if resource.url}
                <!-- target="_blank" is load-bearing, not habit. Without it
                     the anchor navigates this tab to the third party, which
                     is the app itself making the request the screen promises
                     it will not, and on the web it would drop the person out
                     of the app with no way back. -->
                <a
                  class="resource-link"
                  href={resource.url}
                  target="_blank"
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
    </ListCard>
  {/each}

  <p class="muted small" style="margin-top:var(--space-4)">{m.resources_reviewed({ date: reviewedOn })}</p>
  <p class="muted small" style="margin-top:var(--space-2)">{m.resources_leaving()}</p>
</div>

<style>
  /* The row holds four stacked things rather than the usual title and
     subtitle, so it grows instead of centring in one touch target. */
  .resource-row {
    align-items: flex-start;
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
    min-height: var(--touch-target);
    color: var(--role-ink);
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
