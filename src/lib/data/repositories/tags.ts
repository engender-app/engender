/* TagRepository (PRD F4/F17). */

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

export function setGroupEnabled(key: string, enabled: boolean) {
  const g = db.tagGroups.find((g) => g.key === key);
  if (g) {
    g.enabled = enabled;
    save();
  }
}

export function addTag(groupKey: string, label: string) {
  db.tagGroups.find((g) => g.key === groupKey)?.tags.push({
    id: 'custom-' + Date.now(),
    label,
    builtIn: false,
    hidden: false,
  });
  save();
}

export function renameTag(groupKey: string, index: number, label: string) {
  const t = db.tagGroups.find((g) => g.key === groupKey)?.tags[index];
  if (t) {
    t.label = label;
    save();
  }
}

export function moveTagUp(groupKey: string, index: number) {
  const tags = db.tagGroups.find((g) => g.key === groupKey)?.tags;
  if (tags && index > 0) {
    [tags[index - 1], tags[index]] = [tags[index], tags[index - 1]];
    save();
  }
}

export function setTagHidden(groupKey: string, index: number, hidden: boolean) {
  const t = db.tagGroups.find((g) => g.key === groupKey)?.tags[index];
  if (t) {
    t.hidden = hidden;
    save();
  }
}

/** Deleting a custom tag also removes its entry links (PRD F17). */
export function deleteTag(groupKey: string, index: number) {
  const g = db.tagGroups.find((g) => g.key === groupKey);
  if (!g) return;
  const [removed] = g.tags.splice(index, 1);
  if (removed) for (const e of db.entries) e.tags = e.tags.filter((id) => id !== removed.id);
  save();
}

export function addGroup(name: string) {
  db.tagGroups.push({ key: 'custom-' + Date.now(), name, enabled: true, builtIn: false, tags: [] });
  save();
}
