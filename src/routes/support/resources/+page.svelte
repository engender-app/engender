<script lang="ts">
  /* The bundled directory, on the surface kit.

     Reference data, not the journal's: the list is compiled in, so there is
     nothing to wait for and nothing that can be empty. What changes here is
     the container - a grey letterspaced label above a `.list-group` becomes
     the kit's heading above a list card, and each region takes its own
     stripe of the flag so the two groups read as two areas rather than as
     one long column.

     The rows stay presentational and keep growing to fit four stacked
     things. They are written out rather than `<ListRow static>`
     because the row and its text each carry a class of this screen's own -
     scoped styles that a component boundary would not reach - and because
     the third thing in the text is a pair of links, not a subtitle. */
  import Segmented from '$lib/components/Segmented.svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { RESOURCES_REVIEWED_ON, resourcesFor, type ResourceRegion } from '$lib/resources/directory';
  import { crossfade, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly } from '$lib/motion/tokens';
  import { resourceDescription, resourceHours } from '$lib/resources/labels';

  const GROUPS: { region: ResourceRegion; title: () => string }[] = [
    { region: 'pl', title: m.resources_group_pl },
    { region: 'int', title: m.resources_group_int }
  ];

  /* One country at a time. The switch used to jump down one long page, so each country's
     name was written twice - on the switch and again as the heading it jumped to - and the
     list ran as one column of identical cards. Within a country, the ways to talk to
     someone come first and the things to read after, each in its own shape: a helpline is a
     number to call and when it is answered, a site is a link. */
  let region = $state<ResourceRegion>('pl');
  let talk = $derived(resourcesFor(region).filter((resource) => resource.kind !== 'info'));
  let read = $derived(resourcesFor(region).filter((resource) => resource.kind === 'info'));
  const panelIn = (_node: Element) => fadeOnly(crossfadeDuration());

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
  <ScreenHeader title={m.resources_title()} back="/more" />

  <Segmented
    name={m.resources_jump_label()}
    options={GROUPS.map((group) => ({ value: group.region, label: group.title() }))}
    value={region}
    onChange={(value) => (region = value as ResourceRegion)}
    key="resource-groups"
  />

  <!-- One slot the two countries travel through: `resize` on the box,
       `crossfade` on the list leaving it (the wear screen's pairing). -->
  <div use:resize>
    {#key region}
      <div class="resource-panel" data-resource-region={region} in:panelIn out:crossfade>
        {#if talk.length}
          <SectionHeading text={m.resources_talk()} />
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each talk as resource (resource.key)}
              <div class="kit-row is-static resource-row" data-resource={resource.key}>
                <span class="kit-row-text resource-text">
                  <span class="kit-row-title">{resource.name}</span>
                  <span class="kit-row-sub">{resourceDescription(resource.key)}</span>
                  {#if resource.phone && resourceHours(resource.key)}
                    <span class="resource-hours">{resourceHours(resource.key)}</span>
                  {/if}
                  {#if resource.phone}
                    <!-- The number is the one thing to press, at full width.
                         No icon: icons.ts has no phone glyph, and a number
                         reads as a number. -->
                    <a class="btn btn-soft resource-call" href={dial(resource.phone)} aria-label={m.resources_call({ name: resource.name, phone: resource.phone })}>
                      {resource.phone}
                    </a>
                  {/if}
                  {#if resource.url}
                    <!-- target="_blank" is load-bearing: without it the app
                         itself would navigate to the third party. -->
                    <a class="resource-site" href={resource.url} target="_blank" rel="noreferrer"
                      aria-label={m.resources_open({ name: resource.name, domain: shownUrl(resource.url) })}>
                      <span>{shownUrl(resource.url)}</span>
                      <Icon name="external" size={16} />
                    </a>
                  {/if}
                </span>
              </div>
            {/each}
          </ListCard>
        {/if}

        {#if read.length}
          <SectionHeading text={m.resources_read()} />
          <ListCard role={roleAt(activeFlag.roles, 1)}>
            {#each read as resource (resource.key)}
              <ListRow
                key={`resource-${resource.key}`}
                data-resource={resource.key}
                title={resource.name}
                subtitle={resourceDescription(resource.key)}
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                aria-label={resource.url ? m.resources_open({ name: resource.name, domain: shownUrl(resource.url) }) : undefined}
                chevron={false}
                trailing={external}
              />
            {/each}
          </ListCard>
        {/if}
      </div>
    {/key}
  </div>

  {#snippet external()}<Icon name="external" size={20} />{/snippet}

  <p class="muted small">{m.resources_reviewed({ date: reviewedOn })}</p>
  <p class="muted small">{m.resources_leaving()}</p>
</div>

<style>
  .resource-row {
    align-items: flex-start;
    padding-top: var(--space-4);
    padding-bottom: var(--space-4);
  }

  /* Name, what it is, when it is answered, then the ways in: each its own
     band, so the name never reads as the first line of its description. */
  .resource-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .resource-hours {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .resource-call {
    margin-top: var(--space-2);
    width: 100%;
    font-variant-numeric: tabular-nums;
  }

  /* The site, quieter than the number: a link with its own target height,
     not a second button competing with the call. */
  .resource-site {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    min-height: var(--touch-target);
    color: var(--role-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }

  .resource-site:hover { text-decoration: underline; }
</style>
