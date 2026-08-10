/* MilestoneRepository (PRD F6/F26). */

import { db, save, todayEpochDay } from '../db.svelte';
import { milestoneTemplates } from '../demo/seed';
import type { Milestone, MilestoneTemplate } from '../types';

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
  const years = Math.floor((today - m.epochDay) / 365.25);
  const nextAnniv = Math.round(m.epochDay + (years + 1) * 365.25);
  const isAnnivToday = (today - m.epochDay) % 365 === 0 && years > 0;
  return { type: 'anniversary', years, inDays: Math.max(0, nextAnniv - today), isAnnivToday };
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

export function upsertMilestone(m: Partial<Milestone> & { name: string; epochDay: number }) {
  if (m.id) {
    const i = db.milestones.findIndex((x) => x.id === m.id);
    if (i >= 0) db.milestones[i] = { ...db.milestones[i], ...m } as Milestone;
  } else {
    db.milestones.push({
      kind: m.epochDay > todayEpochDay() ? 'countdown' : 'anniversary',
      templateKey: null,
      photo: null,
      ...m,
      id: 'm' + Date.now(),
    } as Milestone);
  }
  save();
}

export function deleteMilestone(id: string) {
  db.milestones = db.milestones.filter((m) => m.id !== id);
  save();
}

export function randomTemplates(n = 3): MilestoneTemplate[] {
  const pool = [...milestoneTemplates];
  const out: MilestoneTemplate[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

export { milestoneTemplates };
