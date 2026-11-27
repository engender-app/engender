/* Multi-track somatic breakdown per body region queries.
   Aggregates dysphoria/euphoria trajectory, progress photos,
   and laser/hair removal sessions for an anatomical zone. */

import type { SqliteDriver } from '../sqlite/driver';
import type { HairRemovalSession } from '../types';
import { HAIR_REMOVAL_AREAS } from '../hairRemovalAreas';
import { bool, entryPresentationFilter } from './support';
import { SESSION_COLUMNS, toHairRemovalSession, type HairRemovalSessionRow } from './hairRemoval';

interface RegionFeelingTrajectory {
  entryId: number;
  epochDay: number;
  dysphoria: number | null;
  euphoria: number | null;
  note?: string;
}

interface RegionSomaticPhoto {
  id: string;
  fileName: string;
  epochDay: number;
  starred: boolean;
  entryId?: number;
  source: 'entry' | 'hair_removal';
}

export interface RegionSomaticBreakdown {
  region: string;
  trajectory: RegionFeelingTrajectory[];
  averageDysphoria: number | null;
  averageEuphoria: number | null;
  latestDysphoria: number | null;
  latestEuphoria: number | null;
  photos: RegionSomaticPhoto[];
  hairRemovalSessions: HairRemovalSession[];
  isEmpty: boolean;
}

const REGION_HAIR_REMOVAL_AREAS_MAP: Record<string, string[]> = {
  face_jaw: ['upper_lip', 'cheeks', 'jawline', 'sideburns', 'chin', 'neck'],
  chest: ['chest'],
  body_facial_hair: [...HAIR_REMOVAL_AREAS],
  hips_waist: ['bikini_line', 'abdomen'],
  genitals: ['bikini_line', 'abdomen', 'genital_surgical_site'],
  whole_body: [...HAIR_REMOVAL_AREAS]
};

/* linkedHairRemovalAreasForRegion stays exported only for its own test (AU-09
   test-only review). */
export function linkedHairRemovalAreasForRegion(region: string): string[] {
  const linked = REGION_HAIR_REMOVAL_AREAS_MAP[region];
  if (linked) return linked;
  if (HAIR_REMOVAL_AREAS.includes(region as (typeof HAIR_REMOVAL_AREAS)[number])) {
    return [region];
  }
  return [];
}

type TrajectoryRow = {
  entry_id: number;
  epoch_day: number;
  dysphoria: number | null;
  euphoria: number | null;
  note: string;
};

type EntryPhotoRow = {
  uuid: string;
  file_path: string;
  starred: number;
  epoch_day: number;
  entry_id: number;
};

type HairRemovalPhotoRow = {
  uuid: string;
  file_path: string;
  epoch_day: number;
};

export async function getRegionSomaticBreakdown(
  driver: SqliteDriver,
  region: string,
  /** Filters the trajectory and its progress photos by presentation
      (ADR-0048) - the two tracks joined against `entry`.
      Hair removal sessions and hair staging carry no
      presentation of their own and are never filtered by this. */
  presentationId?: string | null
): Promise<RegionSomaticBreakdown> {
  const presFilter = entryPresentationFilter(presentationId);

  // 1. Feelings trajectory. Each row sits on one side of the shared 0-100
  // scale. Project only that side's intensity, using stats.ts's arithmetic.
  const trajectoryRows = await driver.query<TrajectoryRow>(
    `SELECT e.id AS entry_id, e.epoch_day AS epoch_day,
            CASE WHEN ebr.value < 50 THEN (50 - ebr.value) * 2 END AS dysphoria,
            CASE WHEN ebr.value > 50 THEN (ebr.value - 50) * 2 END AS euphoria,
            e.note AS note
     FROM entry_body_region ebr
     JOIN entry e ON e.id = ebr.entry_id
     WHERE ebr.region = ? AND e.trashed_at IS NULL${presFilter.sql}
     ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC`,
    [region, ...presFilter.params]
  );

  const trajectory: RegionFeelingTrajectory[] = trajectoryRows.map((r) => ({
    entryId: r.entry_id,
    epochDay: r.epoch_day,
    dysphoria: r.dysphoria,
    euphoria: r.euphoria,
    note: r.note || undefined
  }));

  const dysValues = trajectory.map((t) => t.dysphoria).filter((v): v is number => v !== null);
  const euValues = trajectory.map((t) => t.euphoria).filter((v): v is number => v !== null);

  const averageDysphoria = dysValues.length > 0 ? dysValues.reduce((a, b) => a + b, 0) / dysValues.length : null;
  const averageEuphoria = euValues.length > 0 ? euValues.reduce((a, b) => a + b, 0) / euValues.length : null;
  const latestDysphoria = dysValues[0] ?? null;
  const latestEuphoria = euValues[0] ?? null;

  // 3. Progress photos
  const entryPhotoRows = await driver.query<EntryPhotoRow>(
    `SELECT p.uuid AS uuid, p.file_path AS file_path, p.starred AS starred,
            e.epoch_day AS epoch_day, e.id AS entry_id
     FROM photo p
     JOIN entry e ON e.id = p.entry_id
     JOIN entry_body_region ebr ON ebr.entry_id = e.id
     WHERE ebr.region = ? AND e.trashed_at IS NULL${presFilter.sql}
     ORDER BY e.epoch_day DESC, p.order_index, p.id`,
    [region, ...presFilter.params]
  );

  const photos: RegionSomaticPhoto[] = entryPhotoRows.map((r) => ({
    id: r.uuid,
    fileName: r.file_path,
    epochDay: r.epoch_day,
    starred: bool(r.starred),
    entryId: r.entry_id,
    source: 'entry'
  }));

  const hairAreas = linkedHairRemovalAreasForRegion(region);
  if (hairAreas.length > 0) {
    const placeholders = hairAreas.map(() => '?').join(', ');
    const hrPhotoRows = await driver.query<HairRemovalPhotoRow>(
      `SELECT p.uuid AS uuid, p.file_path AS file_path, s.epoch_day AS epoch_day
       FROM hair_removal_photo p
       JOIN hair_removal_session s ON s.id = p.session_id
       WHERE s.area IN (${placeholders})
       ORDER BY s.epoch_day DESC, p.id`,
      hairAreas
    );
    for (const r of hrPhotoRows) {
      photos.push({
        id: r.uuid,
        fileName: r.file_path,
        epochDay: r.epoch_day,
        starred: false,
        source: 'hair_removal'
      });
    }
  }

  photos.sort((a, b) => b.epochDay - a.epochDay);

  // 4. Laser & Hair Removal Sessions
  let hairRemovalSessions: HairRemovalSession[] = [];
  if (hairAreas.length > 0) {
    const placeholders = hairAreas.map(() => '?').join(', ');
    const sRows = await driver.query<HairRemovalSessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM hair_removal_session
       WHERE area IN (${placeholders})
       ORDER BY epoch_day DESC, id DESC`,
      hairAreas
    );
    hairRemovalSessions = sRows.map(toHairRemovalSession);
  }

  const isEmpty =
    trajectory.length === 0 &&
    photos.length === 0 &&
    hairRemovalSessions.length === 0;

  return {
    region,
    trajectory,
    averageDysphoria,
    averageEuphoria,
    latestDysphoria,
    latestEuphoria,
    photos,
    hairRemovalSessions,
    isEmpty
  };
}
