/* MilestoneRepository (PRD F6/F26). Identity is minted here (ticket 07):
   a screen hands over a milestone or a draft photo without an id and gets
   the ids back on the stored rows, never a Date.now() of its own. */

import { db, save } from '../db.svelte';
import { todayEpochDay, calendarDuration, nextAnniversaryEpochDay } from '../epochDay';
import { milestoneTemplateRows } from '../vocabulary/builtins';
import type { DraftPhoto, Milestone, MilestoneTemplate, Photo } from '../types';

export interface MilestoneStatus {
  type: 'countdown' | 'today' | 'anniversary';
  days?: number;
  years?: number;
  inDays?: number;
  isAnnivToday?: boolean;
}

export function milestoneStatus(m: Milestone): MilestoneStatus {
  const today = todayEpochDay();
  if (m.epochDay > today) return { type: 'countdown', days: m.epochDay - today };
  if (m.epochDay === today) return { type: 'today', days: 0 };
  const { years } = calendarDuration(m.epochDay, today);
  const nextAnniv = nextAnniversaryEpochDay(m.epochDay, today);
  return { type: 'anniversary', years, inDays: nextAnniv - today, isAnnivToday: nextAnniv === today };
}

export function upcomingMilestones(): { m: Milestone; s: MilestoneStatus }[] {
  return [...db.milestones]
    .map((m) => ({ m, s: milestoneStatus(m) }))
    .sort((a, b) => {
      const key = (x: { s: MilestoneStatus }) =>
        x.s.type === 'anniversary' ? (x.s.inDays ?? 0) : (x.s.days ?? 0);
      return key(a) - key(b);
    });
}

export interface MilestoneInput {
  id?: string;
  name: string;
  epochDay: number;
  templateKey?: string | null;
  photo?: Photo | DraftPhoto | null;
}

function withPhotoId(photo: Photo | DraftPhoto | null): Photo | null {
  if (!photo) return null;
  return 'id' in photo ? photo : { ...photo, id: crypto.randomUUID() };
}

export function upsertMilestone(m: MilestoneInput) {
  const photo = withPhotoId(m.photo ?? null);
  if (m.id) {
    const i = db.milestones.findIndex((x) => x.id === m.id);
    if (i < 0) throw new Error(`unknown milestone: ${m.id}`);
    db.milestones[i] = { ...db.milestones[i], ...m, id: m.id, photo };
  } else {
    db.milestones.push({
      id: crypto.randomUUID(),
      name: m.name,
      epochDay: m.epochDay,
      templateKey: m.templateKey ?? null,
      photo
    });
  }
  save();
}

export function deleteMilestone(id: string) {
  db.milestones = db.milestones.filter((m) => m.id !== id);
  save();
}

/** Keys only, names resolved at display time (ticket 05) - read these
    through vocabulary.ts, not straight from here. */
export const milestoneTemplates: MilestoneTemplate[] = milestoneTemplateRows();

export function randomTemplates(n = 3): MilestoneTemplate[] {
  const pool = [...milestoneTemplates];
  const out: MilestoneTemplate[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
