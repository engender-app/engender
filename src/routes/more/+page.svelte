<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  /* ADR-0036: these are the 22 feature surfaces that used to live under
     Settings' Care section, now grouped here instead of in one 27-row list.
     Every row keeps its existing icon/title/subtitle/href from that section -
     no restyle, no copy change; those are tickets 11-13 and copy 01/03. */
  type HubRow = { key: string; icon: string; title: () => string; subtitle: () => string; href: string };

  const BODY_ROWS: HubRow[] = [
    { key: 'photos', icon: 'image', title: () => m.progress_photos(), subtitle: () => m.progress_photos_sub(), href: '/settings/photos' },
    { key: 'measurements', icon: 'ruler', title: () => m.body_measurements(), subtitle: () => m.body_measurements_sub(), href: '/settings/measurements' },
    { key: 'sizes', icon: 'package', title: () => m.size_log(), subtitle: () => m.size_log_sub(), href: '/settings/sizes' },
    { key: 'hair-progress', icon: 'comb', title: () => m.hair_progress(), subtitle: () => m.hair_progress_sub(), href: '/settings/hair-progress' },
    { key: 'hair-removal', icon: 'shuffle', title: () => m.hair_removal(), subtitle: () => m.hair_removal_sub(), href: '/settings/hair-removal' },
  ];

  const HEALTH_ROWS: HubRow[] = [
    { key: 'labs', icon: 'flask', title: () => m.lab_results(), subtitle: () => m.lab_results_sub(), href: '/settings/labs' },
    { key: 'regimen', icon: 'timeline', title: () => m.regimen(), subtitle: () => m.regimen_row_sub(), href: '/settings/regimen' },
    { key: 'hormone-curve', icon: 'curve', title: () => m.curve_title(), subtitle: () => m.curve_sub(), href: '/settings/hormone-curve' },
    /* Ticket 09: doses was reachable only from inside regimen and
       hormone-curve, both settings screens - this row gives it an inbound
       link from outside the settings subtree, alongside the two it comes
       from. */
    { key: 'doses', icon: 'clock', title: () => m.doses(), subtitle: () => m.doses_row_sub(), href: '/doses' },
    { key: 'cycle-events', icon: 'calendar', title: () => m.cycle_events(), subtitle: () => m.cycle_events_sub(), href: '/settings/cycle-events' },
    { key: 'side-effects', icon: 'zap', title: () => m.side_effects(), subtitle: () => m.side_effects_sub(), href: '/settings/side-effects' },
    { key: 'surgery', icon: 'flag', title: () => m.surgery_journey_title(), subtitle: () => m.surgery_journey_sub(), href: '/settings/surgery' },
    { key: 'appointment-prep', icon: 'check', title: () => m.appointment_prep_title(), subtitle: () => m.appointment_prep_row_sub(), href: '/settings/appointment-prep' },
    { key: 'clinician-summary', icon: 'share', title: () => m.clinician_summary_row(), subtitle: () => m.clinician_summary_row_sub(), href: '/settings/clinician-summary' },
  ];

  const TRANSITION_ROWS: HubRow[] = [
    { key: 'milestones', icon: 'flag', title: () => m.milestones(), subtitle: () => m.settings_milestones_sub({ count: vocabulary.milestones.length }), href: '/settings/milestones' },
    { key: 'roadmap', icon: 'globe', title: () => m.roadmap_title(), subtitle: () => m.roadmap_row_sub(), href: '/settings/roadmap' },
    { key: 'letters', icon: 'book', title: () => m.letters_title(), subtitle: () => m.letters_row_sub(), href: '/settings/letters' },
    { key: 'tryouts', icon: 'tag', title: () => m.tryout_title(), subtitle: () => m.tryout_row_sub(), href: '/settings/tryouts' },
  ];

  const PRACTICE_ROWS: HubRow[] = [
    /* Home's permanent doubt card, moved here (spec 08, closed by phase 5
       ticket 21). On Home it was unconditional and always visible, asking
       "feeling like you're not trans enough?" every single day whether or
       not that was where the person was - a permanent prompt about doubt is
       not neutral, because it keeps offering a frame to someone who may not
       be in it. As a row it is one tap from the tab bar and silent until
       asked for. The screen behind it is unchanged; ticket 16 is what
       changes what it does (ADR-0037), independently of this move.

       The subtitle is the counterevidence wording rather than the old
       card's "write it down", which ADR-0037 is in the process of making
       untrue. */
    { key: 'doubt', icon: 'heart', title: () => m.doubt_title(), subtitle: () => m.doubt_counterevidence_sub(), href: '/doubt' },
    { key: 'voice', icon: 'mic', title: () => m.recordings_label(), subtitle: () => m.voice_compare_sub(), href: '/settings/voice' },
    { key: 'wear', icon: 'clock', title: () => m.wear_log(), subtitle: () => m.wear_log_sub(), href: '/settings/wear' },
    { key: 'effects', icon: 'sparkle', title: () => m.effects_timeline(), subtitle: () => m.effects_timeline_sub(), href: '/settings/effects' },
    { key: 'resources', icon: 'globe', title: () => m.resources_title(), subtitle: () => m.resources_row_sub(), href: '/settings/resources' },
  ];

  const GROUPS: { title: () => string; rows: HubRow[] }[] = [
    { title: () => m.hub_group_body(), rows: BODY_ROWS },
    { title: () => m.hub_group_health(), rows: HEALTH_ROWS },
    { title: () => m.hub_group_transition(), rows: TRANSITION_ROWS },
    { title: () => m.hub_group_practice(), rows: PRACTICE_ROWS },
  ];
</script>

<div class="screen">
  <!-- DIRECTION.md 3d: the hub had "More" stacked directly above its first
       group heading, which is two headers saying nearly the same thing, and
       the tab that reaches this screen is already labelled More. The title
       stays in the document for a screen reader and stops being a second
       visible label. -->
  <ScreenHeader title={m.nav_more()} titleHidden />

  {#each GROUPS as group (group.title())}
    <SectionTitle text={group.title()} />
    <div class="list-group">
      {#each group.rows as row (row.key)}
        <a class="list-row" href={row.href} data-hub-row={row.key}>
          <span class="row-icon"><Icon name={row.icon} size={22} /></span>
          <span class="row-text">
            <span class="row-title">{row.title()}</span>
            <span class="row-subtitle">{row.subtitle()}</span>
          </span>
          <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
        </a>
      {/each}
    </div>
  {/each}

  <div class="list-group">
    <a class="list-row" href="/settings" data-hub-row="settings">
      <span class="row-icon"><Icon name="settings" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.nav_settings()}</span>
        <span class="row-subtitle">{m.hub_settings_row_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
  </div>
</div>
