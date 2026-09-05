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
import { DAY_SECTION_KEYS, type DayRecords, type DaySectionKey } from '$lib/data/journal/day';
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

const HAIR_PROGRESS = '/body/hair-progress';
const MILESTONES = '/transition/milestones';
const SURGERY = '/health/surgery';

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

/** How each registered section reads as rows.

    A full `Record` over the registry's own keys, and that is the half of the
    registry's promise this file owes. day.ts makes an area registered
    nowhere a compile error; without this, a section added there would
    compile, read, cost a query and render nothing - the exact silent gap the
    registry exists to close. A new key is a type error here until somebody
    says what it looks like.

    `entries` says so by returning nothing. The entries are the day's centre
    and the day card draws them (DayCard/DayEntry, the same timeline Home
    uses), so they are deliberately not rows - a declaration rather than an
    omission, which is the point of writing it as a full Record. */
const SECTION_ROWS: Record<DaySectionKey, (day: DayRecords) => DayRow[]> = {
  entries: () => [],

  milestones: (day) =>
    day.milestones.map((milestone) => ({
      key: `milestone-${milestone.id}`,
      icon: 'flag',
      title: milestone.name,
      href: MILESTONES,
      photo: milestone.photo ?? undefined
    })),

  doses: (day) =>
    day.doses.map((dose) => ({
      key: `dose-${dose.id}`,
      icon: 'clock',
      title: `${dose.dose} ${dose.doseUnit}, ${routeLabel(dose.route)}`,
      // A dose that was skipped or changed is not the dose the schedule
      // expected, and the row would otherwise read as though it were.
      subtitle: dose.status === 'taken' ? undefined : statusLabel(dose.status),
      href: '/doses'
    })),

  labResults: (day) =>
    day.labResults.map((result) => ({
      key: `lab-${result.id}`,
      icon: 'flask',
      // The analyte in the person's own words and their own unit
      // (ADR-0026), with no range, no reading and no colour beside it.
      title: `${result.analyte} ${result.value} ${result.unit}`,
      href: '/settings/labs'
    })),

  /* The median pitch and nothing read into it (PRODUCT.md:109): a
     descriptive parameter, no range, no colour, no good or bad end. The
     subtitle is earned for the reason the wear row's is - a bare figure in
     Hz does not say what kind of record it belongs to. */
  voiceBenchmarks: (day) =>
    day.voiceBenchmarks.map((benchmark) => ({
      key: `voice-benchmark-${benchmark.id}`,
      icon: 'mic',
      title: m.vb_hz({ value: Math.round(benchmark.f0MedianHz) }),
      subtitle: m.day_voice_benchmark(),
      href: '/practice/voice?tab=compare'
    })),

  measurements: (day) =>
    day.measurements.map((measurement) => ({
      key: `measurement-${measurement.id}`,
      icon: 'ruler',
      title: `${vocabulary.measurementTypeName(measurement.type)} ${measurement.value} ${measurement.unit}`,
      href: '/body/measurements'
    })),

  sizeRecords: (day) =>
    day.sizeRecords.map((record) => ({
      key: `size-${record.id}`,
      icon: 'package',
      title: `${garmentCategoryName(record.category)} ${record.size}`,
      subtitle: record.brand || undefined,
      href: '/body/sizes'
    })),

  taperSessions: (day) =>
    day.taperSessions.map((session) => ({
      key: `taper-${session.id}`,
      icon: 'flask',
      title: m.dilation(),
      subtitle: session.note || undefined,
      href: '/health/dilation'
    })),

  sideEffects: (day) =>
    day.sideEffects.map((effect) => ({
      key: `side-effect-${effect.id}`,
      icon: 'zap',
      title: effect.name,
      subtitle: severityName(effect.severity) ?? undefined,
      href: '/health/side-effects'
    })),

  personalEffects: (day) =>
    day.personalEffects.map((marker) => ({
      key: `personal-effect-${marker.id}`,
      icon: 'sparkle',
      title: vocabulary.personalEffectTypeName(marker.effect),
      // Earned: without it the row reads as something logged today rather
      // than as the day someone put to when it started.
      subtitle: m.day_first_noticed(),
      href: '/practice/personal-effects'
    })),

  cycleEvents: (day) =>
    day.cycleEvents.map((event) => ({
      key: `cycle-${event.id}`,
      icon: 'calendar',
      title: cycleEventKindName(event.kind),
      href: '/health/cycle-events'
    })),

  /* Both counters as one row each, with the day's count on them. A tally is
     a tap someone makes as it happens, and eight of them are eight taps -
     not eight events worth reading one by one. */
  tallyEvents: (day) =>
    (['misgendered', 'correctly_gendered'] as const)
      .map((kind) => ({ kind, count: day.tallyEvents.filter((event) => event.kind === kind).length }))
      .filter(({ count }) => count > 0)
      .map(({ kind, count }) => ({
        key: `tally-${kind}`,
        icon: 'stats',
        title: kind === 'misgendered' ? m.tally_misgendered() : m.tally_correctly_gendered(),
        href: '/tally',
        count
      })),

  wearSessions: (day) =>
    day.wearSessions.map((session) => {
      const { hours, minutes } = hoursMinutesOf(session.durationMs ?? 0);
      return {
        key: `wear-${session.id}`,
        icon: 'clock',
        // The wear screen's own duration string, so a session reads the same
        // on both surfaces rather than in two nearly identical formats.
        title:
          session.durationMs === null
            ? m.day_wear_running()
            : m.wear_session_duration_hm({ hours: String(hours), minutes: String(minutes) }),
        /* Earned, and the one row where it is load-bearing: a duration under
           a clock says nothing about what was worn for it, and this is the
           only record on a day whose title is a bare number. What the person
           wrote comes first where they wrote anything. */
        subtitle: session.note || m.wear_log(),
        href: '/practice/wear'
      };
    }),

  feltSense: (day) =>
    day.feltSense.map((felt) => ({
      key: `felt-sense-${felt.id}`,
      icon: felt.owner.kind === 'tryout' ? 'tag' : 'flag',
      title: felt.owner.name,
      // The note if there is one, and the felt sense itself if not: a row
      // saying only a name would not say what it was doing on this day.
      subtitle: felt.note || moodName(felt.mood),
      href: felt.owner.kind === 'tryout' ? `/transition/tryouts/${felt.owner.id}` : MILESTONES
    })),

  /* The scale as well as the grade. On the hair-progress screen the scale is
     the group heading above the row and there is no grouping here, so a row
     reading "3" would say nothing - '3' is a grade on both published scales
     and means something different on each, which is why those two never
     separate. 'other' publishes no grades at all, so what someone wrote is
     the record, and that screen's own wording covers writing nothing. */
  hairStages: (day) =>
    day.hairStages.map((stage) => ({
      key: `hair-stage-${stage.id}`,
      icon: 'comb',
      title: isGradedScale(stage.scale)
        ? `${hairScaleName(stage.scale)} ${hairStageName(stage.scale, stage.stage)}`
        : stage.description || m.hair_other_unwritten(),
      href: HAIR_PROGRESS
    })),

  // The scheduled fixed-position photos hang off nothing but the day, so
  // they are one group by definition.
  hairPhotos: (day) =>
    day.hairPhotos.length === 0
      ? []
      : [
          {
            key: 'hair-photos',
            icon: 'comb',
            title: m.day_hair_photos(),
            href: HAIR_PROGRESS,
            photo: day.hairPhotos[0],
            count: day.hairPhotos.length
          }
        ],

  hairRemovalSessions: (day) =>
    day.hairRemovalSessions.map((session) => ({
      key: `hair-removal-${session.id}`,
      icon: 'shuffle',
      title: `${hairRemovalAreaName(session.area)}, ${hairRemovalMethodName(session.method)}`,
      href: '/body/hair-removal'
    })),

  /* One section, two kinds of record: the consults a row each, the recovery
     photos a row per procedure. */
  procedureRecords: (day) => [
    ...day.procedureRecords
      .filter((record) => record.kind === 'consult')
      .map((record) => ({
        key: `consult-${record.id}`,
        icon: 'flag',
        title: record.procedureName,
        subtitle: m.day_consult(),
        href: SURGERY
      })),
    ...groupedBy(
      day.procedureRecords.filter((record) => record.kind === 'recovery-photo'),
      (record) => record.procedureId
    ).map((group) => ({
      key: `recovery-photos-${group[0].procedureId}`,
      icon: 'flag',
      title: group[0].procedureName,
      subtitle: m.day_recovery_photos(),
      href: SURGERY,
      photo: group[0],
      count: group.length
    }))
  ],

  tryoutPhotos: (day) =>
    groupedBy(day.tryoutPhotos, (photo) => photo.tryoutId).map((group) => ({
      key: `tryout-photos-${group[0].tryoutId}`,
      icon: 'tag',
      title: group[0].tryoutLabel,
      subtitle: m.day_tryout_photos(),
      href: `/transition/tryouts/${group[0].tryoutId}`,
      photo: group[0],
      count: group.length
    }))
};

/** Every row a day shows beside its entries, in the registry's own order.

    Off DAY_SECTION_KEYS rather than a sequence written out here, so the
    order rows appear in is the order sections are declared in, and a section
    moved there moves here with it. */
export function dayRows(day: DayRecords): DayRow[] {
  return DAY_SECTION_KEYS.flatMap((key) => SECTION_ROWS[key](day));
}
