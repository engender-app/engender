/* The feature manifest against the code (functional audit ticket 54).
   src/lib/features.ts types every key by its own registry, so a key the code
   lost fails the typecheck there. This file covers the key spaces no type
   reaches (tables, routes, string prefixes), that each key has exactly one
   owner, and that a feature's rows, groups and tiles agree with what the
   same feature claims elsewhere. */
import { describe, expect, it } from 'vitest';
import { AREA_GROUPS } from '../src/lib/data/areaGroups';
import { HUB_ROWS } from '../src/lib/data/hubRows';
import { ARCHIVE_SECTIONS } from '../src/lib/data/journal/archiveSections';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles';
import { FEATURE_NAMES, FEATURES, type Feature } from '../src/lib/features';
import { UNPROMPTED_KINDS } from '../src/lib/unprompted/registry';
import { messageKeys, pageRoutes, schemaObjects, sectionTables } from './doc-blocks';

const sorted = (items: Iterable<string>) => [...items].sort();

/** Every key a space's features claim, in claim order, duplicates kept. */
function claims(space: keyof Feature): string[] {
  return FEATURE_NAMES.flatMap((name) => FEATURES[name][space] as readonly string[]);
}

/** Keys two features both claim, with the features that claim them. */
function claimedTwice(space: keyof Feature): string[] {
  const owners = new Map<string, string[]>();
  for (const name of FEATURE_NAMES) {
    for (const key of FEATURES[name][space] as readonly string[]) owners.set(key, [...(owners.get(key) ?? []), name]);
  }
  return [...owners].filter(([, names]) => names.length > 1).map(([key, names]) => `${key}: ${names.join(', ')}`);
}

describe('the feature manifest', () => {
  it.each(['sections', 'tables', 'journal', 'hubRows', 'areaGroups', 'unprompted', 'tiles', 'routes', 'messages'] as const)(
    'gives every %s key one owner',
    (space) => {
      expect(claimedTwice(space)).toEqual([]);
    }
  );

  it('claims exactly the archive sections the registry holds', () => {
    expect(sorted(claims('sections'))).toEqual(sorted(ARCHIVE_SECTIONS.map((s) => s.name)));
  });

  it('claims exactly the tables and views the migrated schema holds', async () => {
    expect(sorted(claims('tables'))).toEqual(await schemaObjects());
  });

  it('claims exactly the routes that render a page', () => {
    expect(sorted(claims('routes'))).toEqual(pageRoutes());
  });

  it('claims exactly the hub rows, area groups, unprompted kinds and tile kinds the code holds', () => {
    expect(sorted(claims('hubRows'))).toEqual(sorted(HUB_ROWS.map((row) => row.key)));
    expect(sorted(claims('areaGroups'))).toEqual(sorted(Object.keys(AREA_GROUPS)));
    expect(sorted(claims('unprompted'))).toEqual(sorted(UNPROMPTED_KINDS));
    expect(sorted(claims('tiles'))).toEqual(sorted(LIVE_TILE_ORDER));
  });

  it('names string prefixes that still start a message key', () => {
    const keys = messageKeys();
    const unused = claims('messages').filter((prefix) => !keys.some((key) => key === prefix || key.startsWith(`${prefix}_`)));
    expect(unused).toEqual([]);
  });

  /* The cross-checks below are what make an entry a checklist rather than
     a guess: a feature that claims a hub row also claims the sections and
     route behind it, and the same for groups and tiles. */
  it("keeps each section's tables with the section's own feature, except the photo table entries and milestones share", () => {
    const owner = new Map(FEATURE_NAMES.flatMap((name) => FEATURES[name].tables.map((table) => [table as string, name])));
    const strays = ARCHIVE_SECTIONS.flatMap((section) => {
      const feature = FEATURE_NAMES.find((name) => (FEATURES[name].sections as readonly string[]).includes(section.name))!;
      return sectionTables(section)
        .filter((table) => owner.get(table) !== feature && table !== 'photo')
        .map((table) => `${section.name} (${feature}) writes ${table} (${owner.get(table) ?? 'nobody'})`);
    });
    expect(strays).toEqual([]);
  });

  it("puts each hub row's route and sections in the row's own feature", () => {
    const strays = FEATURE_NAMES.flatMap((name) => {
      const feature: Feature = FEATURES[name];
      return HUB_ROWS.filter((row) => feature.hubRows.includes(row.key)).flatMap((row) => [
        ...(feature.routes.includes(row.href as Feature['routes'][number]) ? [] : [`${row.key}: route ${row.href} is not ${name}'s`]),
        ...row.areas.filter((area) => !feature.sections.includes(area)).map((area) => `${row.key}: section ${area} is not ${name}'s`)
      ]);
    });
    expect(strays).toEqual([]);
  });

  it("puts each area group's sections in the group's own feature", () => {
    const strays = FEATURE_NAMES.flatMap((name) => {
      const feature: Feature = FEATURES[name];
      return feature.areaGroups.flatMap((group) =>
        (AREA_GROUPS[group] as readonly Feature['sections'][number][])
          .filter((area) => !feature.sections.includes(area))
          .map((area) => `${group}: section ${area} is not ${name}'s`)
      );
    });
    expect(strays).toEqual([]);
  });

  it("lists each tile kind among its feature's unprompted kinds", () => {
    const strays = FEATURE_NAMES.flatMap((name) => {
      const feature: Feature = FEATURES[name];
      return feature.tiles.filter((tile) => !feature.unprompted.includes(tile)).map((tile) => `${name}: ${tile}`);
    });
    expect(strays).toEqual([]);
  });
});
