/* Multi-track somatic breakdown per body region queries (phase 5 deepening ticket 08).
   Aggregates dysphoria/euphoria trajectory, linked measurements, progress photos,
   and laser/hair removal sessions & staging for an anatomical zone. */

import type { SqliteDriver } from '../sqlite/driver';
import type { HairRemovalMethod, HairRemovalSession, HairStage, Measurement } from '../types';
import { HAIR_REMOVAL_AREAS } from '../hairRemovalAreas';
import { bool, entryPresentationFilter } from './support';

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
  source: 'entry' | 'hair_removal' | 'hair_progress';
}

export interface RegionSomaticBreakdown {
  region: string;
  trajectory: RegionFeelingTrajectory[];
  averageDysphoria: number | null;
  averageEuphoria: number | null;
  latestDysphoria: number | null;
  latestEuphoria: number | null;
  measurements: Measurement[];
  photos: RegionSomaticPhoto[];
  hairRemovalSessions: HairRemovalSession[];
  hairStages: HairStage[];
  isEmpty: boolean;
}

const REGION_LINKED_MEASUREMENTS_MAP: Record<string, string[]> = {
  chest: ['chest', 'underbust'],
  hips_waist: ['waist', 'hips'],
  face_jaw: ['facial_hair_density', 'face_jaw', 'jaw', 'face'],
  body_facial_hair: ['body_hair', 'facial_hair_density', 'hair_density', 'body_facial_hair'],
  hairline: ['hairline', 'hair_density'],
  shoulders: ['shoulders', 'shoulder_width'],
  hands_feet: ['hands', 'feet'],
  genitals: ['genitals'],
  voice_throat: ['pitch', 'voice'],
  whole_body: ['waist', 'hips', 'chest', 'underbust', 'weight', 'height']
};

export function linkedMeasurementTypesForRegion(region: string): string[] {
  const linked = REGION_LINKED_MEASUREMENTS_MAP[region];
  if (linked) return linked;
  return [region];
}

const REGION_HAIR_REMOVAL_AREAS_MAP: Record<string, string[]> = {
  face_jaw: ['upper_lip', 'chin', 'neck'],
  chest: ['chest'],
  body_facial_hair: [...HAIR_REMOVAL_AREAS],
  hips_waist: ['bikini_line', 'abdomen'],
  genitals: ['bikini_line', 'abdomen'],
  whole_body: [...HAIR_REMOVAL_AREAS]
};

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

type MeasurementRow = {
  uuid: string;
  epoch_day: number;
  type: string;
  value: number;
  unit: string;
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

type HairPhotoRow = {
  uuid: string;
  file_path: string;
  epoch_day: number;
};

type HairRemovalSessionRow = {
  uuid: string;
  epoch_day: number;
  area: string;
  method: HairRemovalMethod;
  pain_rating: number;
  cost: string;
  provider: string;
};

type HairStageRow = {
  uuid: string;
  epoch_day: number;
  scale: string;
  stage: string;
  description: string;
};

export async function getRegionSomaticBreakdown(
  driver: SqliteDriver,
  region: string,
  /** Filters the trajectory and its progress photos by presentation
      (ADR-0048, ticket 18) - the two tracks joined against `entry`.
      Measurements, hair removal sessions and hair staging carry no
      presentation of their own and are never filtered by this. */
  presentationId?: string | null
): Promise<RegionSomaticBreakdown> {
  const presFilter = entryPresentationFilter(presentationId);

  // 1. Feelings trajectory
  const trajectoryRows = await driver.query<TrajectoryRow>(
    `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, ebr.dysphoria AS dysphoria, ebr.euphoria AS euphoria, e.note AS note
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

  // 2. Linked measurements
  const measurementTypes = linkedMeasurementTypesForRegion(region);
  let measurements: Measurement[] = [];
  if (measurementTypes.length > 0) {
    const placeholders = measurementTypes.map(() => '?').join(', ');
    const mRows = await driver.query<MeasurementRow>(
      `SELECT uuid, epoch_day, type, value, unit
       FROM measurement
       WHERE type IN (${placeholders})
       ORDER BY epoch_day DESC, id DESC`,
      measurementTypes
    );
    measurements = mRows.map((r) => ({
      id: r.uuid,
      epochDay: r.epoch_day,
      type: r.type,
      value: r.value,
      unit: r.unit
    }));
  }

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

  if (region === 'hairline') {
    const hairPhotoRows = await driver.query<HairPhotoRow>(
      `SELECT uuid, file_path, epoch_day FROM hair_photo ORDER BY epoch_day DESC, id`
    );
    for (const r of hairPhotoRows) {
      photos.push({
        id: r.uuid,
        fileName: r.file_path,
        epochDay: r.epoch_day,
        starred: false,
        source: 'hair_progress'
      });
    }
  }

  photos.sort((a, b) => b.epochDay - a.epochDay);

  // 4. Laser & Hair Removal Sessions
  let hairRemovalSessions: HairRemovalSession[] = [];
  if (hairAreas.length > 0) {
    const placeholders = hairAreas.map(() => '?').join(', ');
    const sRows = await driver.query<HairRemovalSessionRow>(
      `SELECT uuid, epoch_day, area, method, pain_rating, cost, provider
       FROM hair_removal_session
       WHERE area IN (${placeholders})
       ORDER BY epoch_day DESC, id DESC`,
      hairAreas
    );
    hairRemovalSessions = sRows.map((r) => ({
      id: r.uuid,
      epochDay: r.epoch_day,
      area: r.area,
      method: r.method,
      painRating: r.pain_rating,
      cost: r.cost,
      provider: r.provider
    }));
  }

  // 5. Hair Staging (Norwood / Sinclair)
  let hairStages: HairStage[] = [];
  if (region === 'hairline' || region === 'whole_body') {
    const stageRows = await driver.query<HairStageRow>(
      `SELECT uuid, epoch_day, scale, stage, description FROM hair_stage ORDER BY epoch_day DESC, id DESC`
    );
    hairStages = stageRows.map((r) => ({
      id: r.uuid,
      epochDay: r.epoch_day,
      scale: r.scale,
      stage: r.stage,
      description: r.description
    }));
  }

  const isEmpty =
    trajectory.length === 0 &&
    measurements.length === 0 &&
    photos.length === 0 &&
    hairRemovalSessions.length === 0 &&
    hairStages.length === 0;

  return {
    region,
    trajectory,
    averageDysphoria,
    averageEuphoria,
    latestDysphoria,
    latestEuphoria,
    measurements,
    photos,
    hairRemovalSessions,
    hairStages,
    isEmpty
  };
}
