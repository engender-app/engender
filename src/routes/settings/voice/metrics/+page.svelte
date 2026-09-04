<script lang="ts">
  /* The metric reference: what each of a benchmark's six figures is
     (phase 8 features ticket 27, ADR-0060).

     Reference data, like `/settings/resources`: the table is compiled in,
     so there is nothing to wait for and nothing that can be empty. What
     the screen owns is the order, the anchors and the flag stripes; each
     section's seven fields are VoiceMetricSection's.

     **Reached only from the figures themselves.** Every number on the
     measured-take view and the compare view links into its own section
     here, and there is no hub row (ADR-0060, and the UX spec's rule 2 is
     untouched by a route nothing navigates to on its own). Back goes to
     the voice screen rather than to /more for the same reason: this is a
     part of that screen, one level down.

     **The anchor is the metric's key**, and `metricHref` builds the link
     from the same key, so a link and the section it lands on cannot drift
     apart. The heading lives here rather than inside the section so the
     `id` sits on the outermost element of a section: a browser scrolling
     to `#pitch` should land on the name, not on the first field under it.

     One reviewed-on date for the whole table, at the foot, the way the
     bundled directory carries `RESOURCES_REVIEWED_ON` and for the same
     reason: a citation whose last check is not stated is a claim. */
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import VoiceMetricSection from '$lib/components/VoiceMetricSection.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { VOICE_METRICS, VOICE_METRICS_REVIEWED_ON } from '$lib/data/voice/metrics';
  import { metricName } from '$lib/data/voice/metricLabels';
  import { roleAttrs } from '$lib/components/kit/role';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Nothing here reacts to anything: the date is a module constant and the
     locale is fixed for the life of the page, so this is a plain const -
     the same shape the resources screen's own review line takes. */
  const reviewedEpochDay = epochDayFromDateInputValue(VOICE_METRICS_REVIEWED_ON);
  const reviewedOn =
    reviewedEpochDay == null
      ? VOICE_METRICS_REVIEWED_ON
      : fmtDay(reviewedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<div class="screen">
  <ScreenHeader title={m.vm_title()} back="/settings/voice" subtitle={m.vm_intro()} />

  <!-- The one fact that belongs to all six figures rather than to any of
       them, which is why it sits above the sections instead of inside one
       (ticket 28, ADR-0061). Stated and not prescribed: the recording flow
       is where a person is told what to do about it, and this screen
       explains (ADR-0060). -->
  <p class="muted small" data-metrics-distance>{m.vm_distance()}</p>

  {#each VOICE_METRICS as metric, i (metric.key)}
    <!-- The anchor a figure's line links to. Six sections, six stripes:
         each figure is its own area of this screen, and the stripe is what
         makes an arrival from a link land somewhere that looks like a
         place rather than in the middle of a document. -->
    <section id={metric.key} class="vm-metric" {...roleAttrs(roleAt(activeFlag.roles, i))}>
      <SectionHeading text={metricName(metric.key)} />
      <VoiceMetricSection {metric} />
    </section>
  {/each}

  <!-- The roadmap's own reviewed-on line, reused rather than reworded: it
       already says "content checked against its sources" and this table is
       the same kind of claim (docs/ui-copy.md, "Does it exist already?"). -->
  <p class="muted small" data-metrics-reviewed>{m.roadmap_reviewed_on({ date: reviewedOn })}</p>
</div>

<style>
  /* The section owns the gap between its heading and its panel; the screen
     owns the gap between sections, which is `.screen`'s own. */
  .vm-metric {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    /* So a link into `#spread` puts the heading below the app's own header
       rather than under it. */
    scroll-margin-top: var(--space-5);
  }
</style>
