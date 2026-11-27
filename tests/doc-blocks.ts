/* Reads the key spaces off the code, and renders the generated blocks in and from them.

   Shared by features.test.ts, which holds the manifest to the same readers, and
   doc-blocks.test.ts, which compares each block with what is in the doc and rewrites it
   under `npm run docs:blocks`.

   A block sits between two comment lines:

   <!-- generated:NAME (npm run docs:blocks writes this block from code; do not edit it
   here) -->... <!-- /generated:NAME -->

   Only the lines between the markers belong to the generator. The prose around them stays
   hand-written. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_GROUPS } from '../src/lib/data/areaGroups';
import { HUB_GROUP_KEYS, HUB_ROWS } from '../src/lib/data/hubRows';
import { ARCHIVE_SECTIONS, DROPPED_ARCHIVE_SECTION_NAMES } from '../src/lib/data/journal/archiveSections';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles';
import { BOOT_KEYS, DEVICE_LOCAL_KEYS, PORTABLE_KEYS, PREFERENCE_DEFAULTS } from '../src/lib/data/prefs/catalogue';
import { migratedDb } from '../src/lib/data/sqlite/test-support/migrated-db';
import { featureOfKind, featureOfRoute, featureOfSection } from '../src/lib/features';
import { UNPROMPTED_ROWS } from '../src/lib/unprompted/registry';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every route that renders a page: a directory under src/routes holding a
    `+page.svelte`, written the way SvelteKit's RouteId writes it. */
export function pageRoutes(root = ROOT): string[] {
  const routes: string[] = [];
  const walk = (dir: string, id: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${id}/${entry.name}`);
      else if (entry.name === '+page.svelte') routes.push(id || '/');
    }
  };
  walk(join(root, 'src', 'routes'), '');
  return routes.sort();
}

/** Every table and view the migrated schema holds, leaving out SQLite's own
    bookkeeping (`sqlite_sequence`). */
export async function schemaObjects(): Promise<string[]> {
  const db = await migratedDb();
  const rows = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name")
    .all() as { name: string }[];
  db.raw.close();
  return rows.map((row) => row.name);
}

/** The tables an archive section empties on Replace, which are the tables
    it writes, read off its own `discard` statements. */
export function sectionTables(section: (typeof ARCHIVE_SECTIONS)[number]): string[] {
  const tables = section.discard.flatMap((sql) => [...sql.matchAll(/^(?:DELETE FROM|INSERT INTO) (\w+)/g)].map((m) => m[1]));
  return [...new Set(tables)];
}

/** The source of `src/lib/data/sqlite/tableNames.ts`: the migrated
    schema's tables and views as a literal list, so the feature manifest can
    type its table names the way it types every other key. */
export function renderTableNames(names: readonly string[]): string {
  return [
    '/* Generated from the migrated schema by `npm run features:tables`; edit a',
    '   migration, not this file. tests/node/tooling/features.test.ts fails while it differs',
    "   from the schema, and src/lib/features.ts types each feature's tables",
    '   against it (functional audit ticket 54). */',
    'export const TABLE_NAMES = [',
    ...names.map((name, i) => `  '${name}'${i < names.length - 1 ? ',' : ''}`),
    '] as const;',
    '',
    'export type TableName = (typeof TABLE_NAMES)[number];',
    ''
  ].join('\n');
}

/** Every message key in the English catalogue. */
export function messageKeys(root = ROOT): string[] {
  const catalogue = JSON.parse(readFileSync(join(root, 'messages', 'en.json'), 'utf8')) as Record<string, unknown>;
  return Object.keys(catalogue).filter((key) => !key.startsWith('$'));
}

function englishLabel(key: string): string {
  const catalogue = JSON.parse(readFileSync(join(ROOT, 'messages', 'en.json'), 'utf8')) as Record<string, string>;
  return catalogue[key] ?? key;
}

const code = (text: string) => `\`${text}\``;
const list = (items: readonly string[]) => (items.length ? items.map(code).join(', ') : '-');
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

/** Every page route and the feature that owns it. */
function renderRoutes(): string {
  const routes = pageRoutes();
  const hubHref = new Map(HUB_ROWS.map((row) => [row.href, row.key]));
  return [
    `${routes.length} routes render a page (a \`+page.svelte\` under \`src/routes\`). The feature is the one \`src/lib/features.ts\` names for the route.`,
    '',
    table(
      ['Route', 'Feature', 'Hub row'],
      routes.map((route) => [code(route), featureOfRoute(route) ?? '**none**', hubHref.has(route) ? code(hubHref.get(route)!) : '-'])
    )
  ].join('\n');
}

/** The More hub's rows, group by group. */
function renderHubRows(): string {
  const groupLabel = (key: string) => `${englishLabel(`hub_group_${key}`)} (${code(key)})`;
  return [
    `\`hubRows.ts\` declares ${HUB_ROWS.length} rows: all drawn on the hub in ${HUB_GROUP_KEYS.length} groups.`,
    '',
    table(
      ['Where', 'Row', 'Route', 'Archive sections behind it', 'Second line'],
      [
        ...HUB_GROUP_KEYS.flatMap((group) =>
          HUB_ROWS.filter((row) => row.home === group).map((row) => [groupLabel(group), code(row.key), code(row.href), list(row.areas), row.line])
        )
      ]
    )
  ].join('\n');
}

/** Every archive section, in wire order, and the sections older archives may still carry. */
function renderArchiveSections(): string {
  const travels = (section: (typeof ARCHIVE_SECTIONS)[number]) =>
    typeof section.travels === 'string' ? section.travels : `fields: ${list(section.travels.fields)}`;
  const finishGroup = (name: string) =>
    Object.entries(AREA_GROUPS).find(([, areas]) => (areas as readonly string[]).includes(name))?.[0];
  return [
    `${ARCHIVE_SECTIONS.length} sections, in the order they travel (\`journal/archiveSections.ts\`). "Tables" are the ones the section empties on a Replace; "In a structure file" is what of it may leave in one (ADR-0049).`,
    '',
    table(
      ['Section', 'Feature', 'Tables', 'Written after', 'In a structure file', 'Finished with'],
      ARCHIVE_SECTIONS.map((section) => [
        code(section.name),
        featureOfSection(section.name) ?? '**none**',
        list(sectionTables(section)),
        list(section.after),
        travels(section),
        finishGroup(section.name) ? code(finishGroup(section.name)!) : '-'
      ])
    ),
    '',
    `Dropped before 1.0, skipped when an older archive carries them: ${list(DROPPED_ARCHIVE_SECTION_NAMES)}.`
  ].join('\n');
}

/** The preference catalogue. */
function renderPreferences(): string {
  const portable = new Set<string>(PORTABLE_KEYS);
  const local = new Set<string>(DEVICE_LOCAL_KEYS);
  const boot = new Set<string>(BOOT_KEYS);
  const keys = Object.keys(PREFERENCE_DEFAULTS).sort();
  const kind = (key: string) => (portable.has(key) ? 'portable' : local.has(key) ? 'device-local' : '**neither**');
  return [
    `${keys.length} preferences (\`prefs/catalogue.ts\`): ${PORTABLE_KEYS.length} portable, ${DEVICE_LOCAL_KEYS.length} device-local. "Before the database" marks the ${BOOT_KEYS.length} mirrored outside SQLite because boot needs them before the journal opens (ADR-0003).`,
    '',
    table(
      ['Preference', 'Kind', 'Before the database', 'Default'],
      keys.map((key) => [
        code(key),
        kind(key),
        boot.has(key) ? 'yes' : '-',
        code(JSON.stringify(PREFERENCE_DEFAULTS[key as keyof typeof PREFERENCE_DEFAULTS]))
      ])
    )
  ].join('\n');
}

/** The unprompted registry. */
function renderUnprompted(): string {
  const tiles = new Set<string>(LIVE_TILE_ORDER);
  const where = (row: (typeof UNPROMPTED_ROWS)[number]) =>
    row.notify ? `notification (${code(row.notify.channel)} channel)` : tiles.has(row.key) ? 'Today (live tile)' : 'in the app';
  const pref = (row: (typeof UNPROMPTED_ROWS)[number]) =>
    code(row.surface ? `surfaceOverrides.${row.key}` : row.notify!.prefKey);
  return [
    `${UNPROMPTED_ROWS.length} kinds (\`unprompted/registry.ts\`), ${LIVE_TILE_ORDER.length} of them live tiles. "Quiet with" is the area whose hidden or finished state silences the kind besides its own switch.`,
    '',
    table(
      ['Kind', 'Feature', 'Where', 'Switch', 'Quiet with'],
      UNPROMPTED_ROWS.map((row) => [code(row.key), featureOfKind(row.key) ?? '**none**', where(row), pref(row), row.area ? code(row.area) : '-'])
    )
  ].join('\n');
}

export interface Block {
  doc: 'SCREENS.md' | 'CONTEXT.md';
  name: string;
  render: () => string;
}

export const BLOCKS: readonly Block[] = [
  { doc: 'SCREENS.md', name: 'hub-rows', render: renderHubRows },
  { doc: 'SCREENS.md', name: 'routes', render: renderRoutes },
  { doc: 'CONTEXT.md', name: 'archive-sections', render: renderArchiveSections },
  { doc: 'CONTEXT.md', name: 'preferences', render: renderPreferences },
  { doc: 'CONTEXT.md', name: 'unprompted', render: renderUnprompted }
];

const open = (name: string) => `<!-- generated:${name} (npm run docs:blocks writes this block from code; do not edit it here) -->`;
const close = (name: string) => `<!-- /generated:${name} -->`;

/** What the doc holds between a block's markers, or null when the markers
    are missing or out of order. */
export function blockIn(text: string, name: string): string | null {
  const start = text.indexOf(open(name));
  const end = text.indexOf(close(name));
  if (start < 0 || end < start) return null;
  return text.slice(start + open(name).length, end).replace(/^\n/, '').replace(/\n$/, '');
}

/** The doc with a block's contents replaced. Throws when its markers are
    missing: a block is placed by hand once, then only ever rewritten. */
export function withBlock(text: string, name: string, body: string): string {
  const start = text.indexOf(open(name));
  const end = text.indexOf(close(name));
  if (start < 0 || end < start) throw new Error(`no ${open(name)} ... ${close(name)} markers`);
  return `${text.slice(0, start + open(name).length)}\n${body}\n${text.slice(end)}`;
}
