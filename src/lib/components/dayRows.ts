/* What each of the day registry's sections looks like as a row (phase 5
   deepening ticket 21).

   day.ts holds the keys and the reads and speaks no paraglide (ADR-0016);
   this is where they get their words, the same split
   clinicianSummaryLabels.ts keeps. It sits beside DayRecords.svelte rather
   than in vocabulary/ because none of it is vocabulary: it is one screen's
   reading of rows other screens own.

   Every row states the record in the record's own terms and goes to the
   screen that owns it. Nothing here computes a figure that screen does not
   already show (ADR-0010), and nothing writes.

   Two rules the whole map answers to:

   *A row's icon is the icon of the screen it goes to.* Not one glyph per
   record type - the disc says where the row leads, so a dose and a wear
   session both wearing `clock` is the app agreeing with itself rather than
   a collision. The More hub is where those icons are decided.

   *Photographs collapse, records do not.* Five recovery photos are one row
   with the first of them on it and the count beside it; five doses are five
   rows. A photo is one record among several that were taken at once and a
   dose is not, and a day that logged eight hair photos should not read as
   eight events. */

import { m } from '$lib/paraglide/messages';
import type { DayRecords } from '$lib/data/journal/day';
import { isGradedScale } from '$lib/data/hairStageScales';
import { hoursMinutesOf } from '$lib/data/journal/wearSessions';
import type { Photo } from '$lib/data/types';
import {
  cycleEventKindName,
  garmentCategoryName,
  hairRemovalAreaName,
  hairRemovalMethodName,
  hairScaleName,
  hairStageName,
  moodName,
  severityName
} from '$lib/data/vocabulary/labels';
import { routeLabel, statusLabel } from '$lib/data/vocabulary/doseLabels';
import { vocabulary } from '$lib/data/vocabulary/vocabulary';

/** One line in the day's context list. `subtitle` is the earned exception
    (DIRECTION 3b), not the standard: most rows say everything in the
    title. */
export interface DayRow {
  /** The row's own walkthrough handle (ADR-0029) - stable, never the copy. */
  key: string;
  icon: string;
  title: string;
  subtitle?: string;
  href: string;
  /** A photograph to draw where the icon disc would go, and how many more
      of them the row stands for. */
  photo?: Pick<Photo, 'fileName'> & { id?: string };
  count?: number;
}

const HAIR_PROGRESS = '/settings/hair-progress';

/* Photographs by whatever they hang off - the owning tryout or procedure -
   so each owner collapses to one row rather than one per shot. Insertion
   order, which is the order they were read in. */
function groupedBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const existing = groups.get(key(item));
    if (existing) existing.push(item);
    else groups.set(key(item), [item]);
  }
  return [...groups.values()];
}

/** Every row a day shows beside its entries, in the registry's own order.

    The entries are not here: they are the day's centre and the day card
    already draws them (DayCard/DayEntry, the same timeline Home uses).
    This is everything around them. */
export function dayRows(day: DayRecords): DayRow[] {
  const rows: DayRow[] = [];

  for (const milestone of day.milestones) {
    rows.push({
      key: `milestone-${milestone.id}`,
      icon: 'flag',
      title: milestone.name,
      href: '/settings/milestones',
      photo: milestone.photo ?? undefined
    });
  }

  for (const dose of day.doses) {
    rows.push({
      key: `dose-${dose.id}`,
      icon: 'clock',
      title: `${dose.dose} ${dose.doseUnit}, ${routeLabel(dose.route)}`,
      // A dose that was skipped or changed is not the dose the schedule
      // expected, and the row would otherwise read as though it were.
      subtitle: dose.status === 'taken' ? undefined : statusLabel(dose.status),
      href: '/doses'
    });
  }

  for (const result of day.labResults) {
    rows.push({
      key: `lab-${result.id}`,
      icon: 'flask',
      // The analyte in the person's own words and their own unit
      // (ADR-0026), with no range, no reading and no colour beside it.
      title: `${result.analyte} ${result.value} ${result.unit}`,
      href: '/settings/labs'
    });
  }

  for (const measurement of day.measurements) {
    rows.push({
      key: `measurement-${measurement.id}`,
      icon: 'ruler',
      title: `${vocabulary.measurementTypeName(measurement.type)} ${measurement.value} ${measurement.unit}`,
      href: '/settings/measurements'
    });
  }

  for (const record of day.sizeRecords) {
    rows.push({
      key: `size-${record.id}`,
      icon: 'package',
      title: `${garmentCategoryName(record.category)} ${record.size}`,
      subtitle: record.brand || undefined,
      href: '/settings/sizes'
    });
  }

  for (const effect of day.sideEffects) {
    rows.push({
      key: `side-effect-${effect.id}`,
      icon: 'zap',
      title: effect.name,
      subtitle: severityName(effect.severity),
      href: '/settings/side-effects'
    });
  }

  for (const marker of day.personalEffects) {
    rows.push({
      key: `personal-effect-${marker.id}`,
      icon: 'sparkle',
      title: vocabulary.personalEffectTypeName(marker.effect),
      // Earned: without it the row reads as something logged today rather
      // than as the day someone put to when it started.
      subtitle: m.day_first_noticed(),
      href: '/settings/effects'
    });
  }

  for (const event of day.cycleEvents) {
    rows.push({
      key: `cycle-${event.id}`,
      icon: 'calendar',
      title: cycleEventKindName(event.kind),
      href: '/settings/cycle-events'
    });
  }

  /* Both counters as one row each, with the day's count on them. A tally is
     a tap someone makes as it happens and eight of them are eight taps, not
     eight events worth reading one by one. */
  for (const kind of ['misgendered', 'correctly_gendered'] as const) {
    const count = day.tallyEvents.filter((event) => event.kind === kind).length;
    if (count === 0) continue;
    rows.push({
      key: `tally-${kind}`,
      icon: 'stats',
      title: kind === 'misgendered' ? m.tally_misgendered() : m.tally_correctly_gendered(),
      href: '/tally',
      count
    });
  }

  for (const session of day.wearSessions) {
    const { hours, minutes } = hoursMinutesOf(session.durationMs ?? 0);
    rows.push({
      key: `wear-${session.id}`,
      icon: 'clock',
      // Three cases rather than a plural rule: a session still running has
      // no duration to state, and one under an hour would otherwise read
      // "0 h 40 m".
      title:
        session.durationMs === null
          ? m.day_wear_running()
          : hours === 0
            ? m.day_wear_minutes({ minutes })
            : m.day_wear_duration({ hours, minutes }),
      /* Earned, and the one row where it is load-bearing: a duration under
         a clock says nothing about what was worn for it, and this is the
         only record on a day whose title is a bare number. What the person
         wrote comes first where they wrote anything. */
      subtitle: session.note || m.wear_log(),
      href: '/settings/wear'
    });
  }

  for (const felt of day.feltSense) {
    rows.push({
      key: `felt-sense-${felt.id}`,
      icon: felt.owner.kind === 'tryout' ? 'tag' : 'flag',
      title: felt.owner.name,
      // The note if there is one, and the felt sense itself if not: a row
      // saying only a name would not say what it was doing on this day.
      subtitle: felt.note || moodName(felt.mood),
      href: felt.owner.kind === 'tryout' ? `/settings/tryouts/${felt.owner.id}` : '/settings/milestones'
    });
  }

  for (const stage of day.hairStages) {
    /* The scale as well as the grade. On the hair-progress screen the scale
       is the group heading above the row, and there is no grouping here - a
       row reading "3" would say nothing, since '3' is a grade on both
       published scales and means something different on each. 'other'
       publishes no grades at all, so what someone wrote is the record, and
       the screen's own wording covers writing nothing. */
    const graded = isGradedScale(stage.scale);
    rows.push({
      key: `hair-stage-${stage.id}`,
      icon: 'comb',
      title: graded
        ? `${hairScaleName(stage.scale)} ${hairStageName(stage.scale, stage.stage)}`
        : stage.description || m.hair_other_unwritten(),
      href: HAIR_PROGRESS
    });
  }

  // The scheduled fixed-position photos hang off nothing but the day, so
  // they are one group by definition.
  if (day.hairPhotos.length > 0) {
    rows.push({
      key: 'hair-photos',
      icon: 'comb',
      title: m.day_hair_photos(),
      href: HAIR_PROGRESS,
      photo: day.hairPhotos[0],
      count: day.hairPhotos.length
    });
  }

  for (const session of day.hairRemovalSessions) {
    rows.push({
      key: `hair-removal-${session.id}`,
      icon: 'shuffle',
      title: `${hairRemovalAreaName(session.area)}, ${hairRemovalMethodName(session.method)}`,
      href: '/settings/hair-removal'
    });
  }

  for (const record of day.procedureRecords) {
    if (record.kind !== 'consult') continue;
    rows.push({
      key: `consult-${record.id}`,
      icon: 'flag',
      title: record.procedureName,
      subtitle: m.day_consult(),
      href: '/settings/surgery'
    });
  }

  const recoveryPhotos = day.procedureRecords.filter((record) => record.kind === 'recovery-photo');
  for (const group of groupedBy(recoveryPhotos, (record) => record.procedureId)) {
    rows.push({
      key: `recovery-photos-${group[0].procedureId}`,
      icon: 'flag',
      title: group[0].procedureName,
      subtitle: m.day_recovery_photos(),
      href: '/settings/surgery',
      photo: group[0],
      count: group.length
    });
  }

  for (const group of groupedBy(day.tryoutPhotos, (photo) => photo.tryoutId)) {
    rows.push({
      key: `tryout-photos-${group[0].tryoutId}`,
      icon: 'tag',
      title: group[0].tryoutLabel,
      subtitle: m.day_tryout_photos(),
      href: `/settings/tryouts/${group[0].tryoutId}`,
      photo: group[0],
      count: group.length
    });
  }

  return rows;
}
