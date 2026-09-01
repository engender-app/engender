<script lang="ts">
  /* The More hub, on the surface kit (phase 5 ticket 24).

     What it used to be: a hand-rolled `.list-group`/`.list-row` stack, the
     "old world" kit.css's own header comment names - one rounded card with
     a shadow, repeated four times, each row carrying a subtitle whether or
     not the title needed one. The kit's ListCard/ListRow/SectionHeading
     (ticket 20) are the replacement; this ticket is the one that spends
     them here.

     DIRECTION.md 3b: subtitles are earned, not standard. These 22 rows
     carry titles alone now - the subtitle text stays in the catalogue
     (nothing deleted, in case a later ticket earns it back) but nothing
     reads it here except the trailing Settings row, where "Settings" alone
     does not say what is behind it.

     Every row's icon/title/href/group membership is unchanged, per this
     ticket's own scope line: a redesign changes the container, not what
     each row says. */
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';

  type HubRow = { key: string; icon: string; title: () => string; subtitle: () => string; href: string };

  const BODY_ROWS: HubRow[] = [
    { key: 'photos', icon: 'image', title: () => m.progress_photos(), subtitle: () => m.progress_photos_sub(), href: '/settings/photos' },
    { key: 'measurements', icon: 'ruler', title: () => m.body_measurements(), subtitle: () => m.body_measurements_sub(), href: '/settings/measurements' },
    { key: 'sizes', icon: 'package', title: () => m.size_log(), subtitle: () => m.size_log_sub(), href: '/settings/sizes' },
    { key: 'hair-progress', icon: 'comb', title: () => m.hair_progress(), subtitle: () => m.hair_progress_sub(), href: '/settings/hair-progress' },
    { key: 'hair-removal', icon: 'shuffle', title: () => m.hair_removal(), subtitle: () => m.hair_removal_sub(), href: '/settings/hair-removal' },
  ];

  const HEALTH_ROWS: HubRow[] = [
    /* Deepening ticket 07. This group was nine rows long and read as an
       inventory rather than as somewhere to go, and two whole surfaces -
       the stock projection and the exposure counters - were not in it at
       all, reachable only from a link buried inside /settings/regimen.

       The four medication surfaces (labs, regimen, hormone-curve, doses)
       are behind this row now, together with those two. A grouping screen
       that only links on would have been a heading, so /care is not one: it
       opens on the regimen, the last dose, the next one the schedule
       expects, the last lab draw and the run-out day, each a live read of
       the module that owns it and each a way through to it. That is what
       earns the tap the four rows used to save. */
    { key: 'care', icon: 'timeline', title: () => m.care_title(), subtitle: () => m.care_rail_heading(), href: '/care' },
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
    { key: 'presentations', icon: 'palette', title: () => m.presentations_title(), subtitle: () => m.presentations_row_sub(), href: '/settings/presentations' },
    { key: 'eras', icon: 'columns', title: () => m.eras_title(), subtitle: () => m.eras_row_sub(), href: '/settings/eras' },
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
    { key: 'doubt', icon: 'heart', title: () => m.safe_space_title(), subtitle: () => m.safe_space_hub_sub(), href: '/doubt' },
    { key: 'voice', icon: 'mic', title: () => m.recordings_label(), subtitle: () => m.voice_compare_sub(), href: '/settings/voice' },
    /* Its own row rather than a way in from the recordings screen (phase 5
       deepening ticket 15): a benchmark is a different record from a voice
       memo, and the screen next door is the memo compare surface, which this
       milestone's ticket 16 owns. Until then the hub is where a benchmark
       starts, and the Home nudge - which only fires once one exists - is the
       reminder rather than the entrance. */
    { key: 'voice-benchmark', icon: 'mic', title: () => m.vb_title(), subtitle: () => m.vb_hub_sub(), href: '/settings/voice/record' },
    { key: 'wear', icon: 'clock', title: () => m.wear_log(), subtitle: () => m.wear_log_sub(), href: '/settings/wear' },
    { key: 'effects', icon: 'sparkle', title: () => m.effects_timeline(), subtitle: () => m.effects_timeline_sub(), href: '/settings/effects' },
    { key: 'resources', icon: 'globe', title: () => m.resources_title(), subtitle: () => m.resources_row_sub(), href: '/settings/resources' },
  ];

  const GROUPS: { title: () => string; rows: () => HubRow[] }[] = [
    { title: () => m.hub_group_body(), rows: () => BODY_ROWS },
    { title: () => m.hub_group_health(), rows: () => healthRows },
    { title: () => m.hub_group_transition(), rows: () => TRANSITION_ROWS },
    { title: () => m.hub_group_practice(), rows: () => PRACTICE_ROWS },
  ];

  /* ADR-0043: the cycle row is the one row here that has to be able to not
     exist - read cold, a permanent cycle prompt tells a transfemme reader
     this hub was not drawn for them. It stays written in HEALTH_ROWS above
     so its shape is held like any other row's, and one filter - fed by the
     one visibility rule in cycleTracking.ts, an active testosterone
     regimen or the explicit opt-in - takes it out of the card otherwise.
     Hiding the row is all it does: the screen behind it and its records
     are untouched, and its direct URL still answers. */
  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let cycleShown = $derived(cycleTrackingVisible(episodesQuery.rows, Date.now(), prefs.cycleTrackingEnabled));
  let healthRows = $derived(cycleShown ? HEALTH_ROWS : HEALTH_ROWS.filter((row) => row.key !== 'cycle-events'));
</script>

<div class="screen">
  <!-- DIRECTION.md 3d: the hub had "More" stacked directly above its first
       group heading, which is two headers saying nearly the same thing, and
       the tab that reaches this screen is already labelled More. The title
       stays in the document for a screen reader and stops being a second
       visible label. -->
  <ScreenHeader title={m.nav_more()} titleHidden />

  {#each GROUPS as group, i (group.title())}
    <SectionHeading text={group.title()} />
    <ListCard role={roleAt(activeFlag.roles, i)}>
      {#each group.rows() as row (row.key)}
        <ListRow key={row.key} icon={row.icon} title={row.title()} href={row.href} />
      {/each}
    </ListCard>
  {/each}

  <!-- No role: this row is the app talking about itself, not one of the
       journal's own areas (the same call Home's backup notice makes).

       No SectionHeading either - it is one row, not a group - but sitting
       flush under Practice with nothing between them read as if it
       belonged to that group (Alicja, on the live build). A plain margin
       gives it the same clearance a heading would, without a heading that
       has nothing to say. -->
  <div>
    <ListCard>
      <ListRow
        key="settings"
        icon="settings"
        title={m.nav_settings()}
        subtitle={m.hub_settings_row_sub()}
        href="/settings"
      />
    </ListCard>
  </div>
</div>
