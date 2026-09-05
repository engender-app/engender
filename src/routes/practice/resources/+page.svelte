<script lang="ts">
  /* The bundled directory, on the surface kit (phase 5 UX ticket 25).

     Reference data, not the journal's: the list is compiled in, so there is
     nothing to wait for and nothing that can be empty. What changes here is
     the container - a grey letterspaced label above a `.list-group` becomes
     the kit's heading above a list card, and each region takes its own
     stripe of the flag so the two groups read as two areas rather than as
     one long column.

     The rows stay presentational and keep growing to fit four stacked
     things. They are written out rather than `<ListRow static>` (ticket 40)
     because the row and its text each carry a class of this screen's own -
     scoped styles that a component boundary would not reach - and because
     the third thing in the text is a pair of links, not a subtitle. */
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
        <!-- Hand-rolled rather than ListRow (ticket 16): a third band of
             contact pills under the description, which title/subtitle have
             no room for - ListRow's text slot is exactly those two. -->
        <div class="kit-row is-static resource-row" data-resource={resource.key}>
          <span class="kit-row-text resource-text">
            <span class="kit-row-title">{resource.name}</span>
            <span class="kit-row-sub resource-desc">{resourceDescription(resource.key)}</span>
            <span class="resource-links">
              {#if resource.phone}
                <!-- No icon: icons.ts has no phone glyph, and the nearest
                     ones already mean something else across the app (a bell
                     is a reminder). A number reads as a number. -->
                <!-- The number and when it is answered travel together, so
                     the hours cannot end up on a line between the two ways
                     in. No icon on it either: icons.ts has no phone glyph
                     and the nearest ones already mean something else across
                     the app - a bell is a reminder. A number reads as a
                     number. -->
                <span class="resource-way">
                  <a class="resource-link" href={dial(resource.phone)} aria-label={m.resources_call({ name: resource.name })}>
                    {resource.phone}
                  </a>
                  {#if resourceHours(resource.key)}
                    <span class="resource-hours">{resourceHours(resource.key)}</span>
                  {/if}
                </span>
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

  <p class="muted small">{m.resources_reviewed({ date: reviewedOn })}</p>
  <p class="muted small">{m.resources_leaving()}</p>
</div>

<style>
  /* The row holds a name, what the service is, and the ways to reach it,
     so it grows instead of centring in one touch target. */
  .resource-row {
    align-items: flex-start;
    padding-top: var(--space-4);
    padding-bottom: var(--space-4);
  }

  /* Three bands, each with its own separation. The name and the description
     were a line apart with nothing between them, so the name read as the
     first line of its own description (Alicja, 2026-08-26). */
  .resource-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .resource-desc {
    margin-bottom: var(--space-2);
  }

  /* Always a row of its own under the description, never trailing the end of
     it. Wrapping inside a text column put the ways to reach a service beside
     a short description and under a long one, so no two rows in the list
     agreed on where to look for a phone number. */
  .resource-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  /* Each way in is a control rather than a run of coloured words: same pill,
     same order every time - the number first, then the site. A 16px glyph
     and a label do not reach a touch target on their own, so the pill
     carries the height. */
  .resource-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-4);
    border-radius: var(--radius-pill);
    border: 1px solid var(--outline);
    background: var(--surface-2);
    color: var(--role-ink);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .resource-link:hover { border-color: var(--outline-strong); }

  /* The number and its opening hours are one way in, so they wrap as one.
     Loose in the row, the hours landed between the phone and the site and
     split the two apart. */
  .resource-way {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  /* Beside the pill rather than inside it: when a helpline is answered is a
     fact about the number, not a second thing to press. */
  .resource-hours {
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>
