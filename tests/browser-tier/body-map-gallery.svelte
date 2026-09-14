<script lang="ts">
  /* The body map's figure in the four data states it has to tell apart
     (phase 10 redesign ticket 40).

     The route cannot be driven to these four without seeding four journals,
     and three of the four are about what a *reading set* looks like rather
     than about the screen around it - so what this mounts is
     BodyRegionMap.svelte, the real component against the real tokens, and
     what the fixture supplies is the readings.

     The four are the ones the ticket names, and each exists because a pair
     of them must not look alike:

     - **empty**: nothing logged in the range. Every shape is its outline
       and no fill, which has to be visibly different from `single` below.
     - **single**: one region with one faint reading. This is the pale end of
       the ramp, and the pair `empty`/`single` is the "neither a large number
       nor zero reads as never" check.
     - **mixed**: a region that went both ways in the range. The dashed edge
       has to be legible at the palest fill as well as the deepest, so the
       scene puts a mixed region at level 1 and another at level 4.
     - **saturated**: every region deep on the ramp, which is where a mixed
       edge has the least contrast to work with and where a fill is closest
       to the stripe itself.

     The stage is repeated per palette and theme by the html attributes the
     driver stamps; tests/body-map-gallery.mjs walks the scenes. */
  import BodyRegionMap from '$lib/components/BodyRegionMap.svelte';
  import type { RegionSideReading } from '$lib/data/bodyMap';
  import type { BodyRegion } from '$lib/data/types';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* The regions somebody has: the ten built-ins, named the way labels.ts
     names them, plus one they added. The custom one is the whole point of
     the elsewhere cluster, so it is in every scene. */
  const REGIONS: BodyRegion[] = [
    ['hairline', 'Hairline'],
    ['face_jaw', 'Face and jaw'],
    ['voice_throat', 'Voice and throat'],
    ['shoulders', 'Shoulders'],
    ['chest', 'Chest'],
    ['hips_waist', 'Hips and waist'],
    ['genitals', 'Genitals'],
    ['hands_feet', 'Hands and feet'],
    ['whole_body', 'Whole body'],
    ['body_facial_hair', 'Body and facial hair']
  ].map(([id, name]) => ({ id, name, builtIn: true, hidden: false }));

  const CUSTOM: BodyRegion = { id: 'custom-scars', name: 'Scars', builtIn: false, hidden: false };
  const ALL = [...REGIONS, CUSTOM];

  const reading = (
    region: string,
    side: 'dysphoria' | 'euphoria',
    value: number,
    mixed = false,
    count = mixed ? 4 : 2
  ): RegionSideReading => ({ region, side, value, mixed, count });

  /* Level 1 is 1 to 25, level 4 is 76 to 100 (metricRange's heatLevel over
     the 0-100 scale), so these values pin the ends of the ramp rather than
     landing wherever. */
  const SCENES: { key: string; title: string; readings: RegionSideReading[] }[] = [
    { key: 'empty', title: 'Nothing logged in this range', readings: [] },
    {
      key: 'single',
      title: 'One region, one faint reading',
      readings: [reading('chest', 'dysphoria', 12, false, 1)]
    },
    {
      key: 'mixed',
      title: 'Both ways in the range, at both ends of the ramp',
      readings: [
        reading('chest', 'dysphoria', 88, true),
        reading('voice_throat', 'euphoria', 10, true),
        reading('hips_waist', 'dysphoria', 54),
        reading('hairline', 'euphoria', 30),
        reading('custom-scars', 'dysphoria', 70, true)
      ]
    },
    {
      key: 'saturated',
      title: 'Every region deep on the ramp',
      readings: ALL.map((region, i) =>
        reading(region.id, i % 2 ? 'euphoria' : 'dysphoria', 82 + (i % 5) * 4, i === 4)
      )
    }
  ];

  let selected = $state('chest');
  let role = $derived(roleAt(activeFlag.roles, 0));
</script>

<div class="scenes">
  {#each SCENES as scene (scene.key)}
    <section class="scene" data-scene={scene.key}>
      <h2>{scene.title}</h2>
      <div class="scene-figure" data-scene-figure={scene.key}>
        <BodyRegionMap
          regions={ALL}
          readings={scene.readings}
          {selected}
          {role}
          onSelect={(picked) => (selected = picked)}
        />
      </div>
    </section>
  {/each}
</div>

<style>
  .scenes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    padding: var(--space-4);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    align-items: flex-start;
  }
  .scene {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 360px;
  }
  .scene h2 {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    margin: 0;
  }
  /* The figure's own card on the route, so the shapes are judged against
     the surface they actually sit on rather than against the page. */
  .scene-figure {
    padding: var(--space-4) var(--space-3);
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
  }
</style>
