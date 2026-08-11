/* TagRepository (PRD F4/F17). Re-cut around ids in ticket 07: a row is
   addressed by its tag id (seeded key for built-ins, minted uuid for
   customs - ADR-0002), never by its index in a JS array, which has no
   meaning in SQL. Updates on an unknown id throw; deletes are idempotent
   (removing an already-gone row is success). */

import { db, save } from '../db.svelte';
import type { Tag, TagGroup } from '../types';

export function visibleTagGroups(): TagGroup[] {
  return db.tagGroups
    .filter((g) => g.enabled)
    .map((g) => ({ ...g, tags: g.tags.filter((t) => !t.hidden) }))
    .filter((g) => g.tags.length > 0);
}

export function tagById(id: string): Tag | null {
  for (const g of db.tagGroups) {
    const t = g.tags.find((t) => t.id === id);
    if (t) return t;
  }
  return null;
}

function mustFindTag(id: string): Tag {
  const t = tagById(id);
  if (!t) throw new Error(`unknown tag: ${id}`);
  return t;
}

function mustFindGroup(key: string): TagGroup {
  const g = db.tagGroups.find((g) => g.key === key);
  if (!g) throw new Error(`unknown tag group: ${key}`);
  return g;
}

export function setGroupEnabled(key: string, enabled: boolean) {
  mustFindGroup(key).enabled = enabled;
  save();
}

export function addTag(groupKey: string, label: string) {
  mustFindGroup(groupKey).tags.push({
    id: crypto.randomUUID(),
    label,
    builtIn: false,
    hidden: false
  });
  save();
}

export function renameTag(id: string, label: string) {
  mustFindTag(id).label = label;
  save();
}

/** F17 wants drag reordering; a per-click "move up" mutation cannot
    express a drag, so the operation is the whole order at once. */
export function reorder(groupKey: string, orderedIds: string[]) {
  const g = mustFindGroup(groupKey);
  if (
    orderedIds.length !== g.tags.length ||
    !g.tags.every((t) => orderedIds.includes(t.id))
  ) {
    throw new Error(`reorder of ${groupKey} does not permute its tags`);
  }
  g.tags.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  save();
}

export function setTagHidden(id: string, hidden: boolean) {
  mustFindTag(id).hidden = hidden;
  save();
}

/** Deleting removes the tag's entry links too (PRD F17). Customs only:
    built-ins hide, so their history keeps its wording on every device. */
export function deleteTag(id: string) {
  const t = tagById(id);
  if (!t) return; // already gone
  if (t.builtIn) throw new Error(`built-in tags hide, not delete: ${id}`);
  for (const g of db.tagGroups) g.tags = g.tags.filter((x) => x.id !== id);
  for (const e of db.entries) e.tags = e.tags.filter((x) => x !== id);
  save();
}

export function addGroup(name: string) {
  db.tagGroups.push({ key: crypto.randomUUID(), name, enabled: true, builtIn: false, tags: [] });
  save();
}
