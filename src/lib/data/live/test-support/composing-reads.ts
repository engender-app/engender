/* Every read that answers out of other areas' reads rather than SQL of
   its own, with the reads it composes and the tables it deliberately does
   not declare. writes.test.ts holds each one to exactly the union of what
   it composes; writes.sql.test.ts lets a narrowed table through when the
   composed read's own SQL reads it. One list for both, so a narrowing is
   stated once. */

import type { TableName } from '../writes.ts';

export type Read = readonly [area: string, operation: string];

export interface ComposingRead {
  read: Read;
  /** Every read it performs, through the areas openJournal hands it. */
  composes: readonly Read[];
  /** A table one of those reads declares that this one deliberately does
      not, with the reason. Checked both ways below, so a narrowing that has
      stopped being true fails rather than sitting here. */
  narrows?: Partial<Record<TableName, string>>;
}

export const COMPOSING_READS: readonly ComposingRead[] = [
  {
    // Every counter recomputed from the dose log and the episode history
    // (exposure.ts); this area owns no table at all.
    read: ['exposure', 'getCounters'],
    composes: [
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes']
    ]
  },
  {
    read: ['hormoneCurve', 'getCurves'],
    composes: [
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes'],
      ['labs', 'getUsedAnalytes'],
      ['labs', 'getResults']
    ]
  },
  {
    // The same two models over one day, for the one word Care's curve row
    // states (phase 11 ticket 10). No lab read at all: a direction needs no
    // fit, and a scale factor cannot turn a rise into a fall.
    read: ['hormoneCurve', 'getCurveDirection'],
    composes: [
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes']
    ]
  },
  {
    read: ['chartAnnotations', 'getAnnotations'],
    composes: [
      ['milestones', 'getMilestones'],
      ['regimen', 'getEpisodes'],
      ['doses', 'getPauses'],
      ['journalingPauses', 'getPauses'],
      ['tryouts', 'getTryouts'],
      ['procedures', 'getProcedures'],
      ['eras', 'getEras'],
      ['areaStates', 'getAreaStates']
    ],
    narrows: {
      photo: 'an annotation is a name and a day: the milestone read it comes through carries photos it never draws',
      roadmapGoal: "the same read carries a linked custom goal's text, and an annotation draws the milestone's own name"
    }
  },
  {
    // The hormone curve's own markers (phase 8 features ticket 15). Two of
    // the four are records with a day on them and two are days that stood
    // out against the person's own recent spread, which is why the tally and
    // entry reads are here at all.
    read: ['chartAnnotations', 'getCurveMarkers'],
    composes: [
      ['sideEffects', 'getSideEffectsInRange'],
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes'],
      ['stats', 'tallyTrend'],
      ['stats', 'bodyRegionReadings']
    ]
  },
  {
    // Its declaration is the section registry's own union
    // (clinicianSummary.ts's CLINICIAN_SUMMARY_TABLES), so this entry checks
    // the registry's per-section tables rather than a copy in writes.ts.
    read: ['clinicianSummary', 'getSummary'],
    composes: [
      ['regimen', 'getEpisodes'],
      ['doses', 'getDoses'],
      ['labs', 'getUsedAnalytes'],
      ['labs', 'getResults'],
      ['exposure', 'getCounters'],
      ['sideEffects', 'getSideEffectsInRange'],
      ['procedures', 'getProcedures'],
      ['procedures', 'getChecklist'],
      ['procedures', 'getPhotos'],
      ['areaStates', 'getAreaStates'],
      ['checklists', 'getStandaloneChecklist']
    ]
  },
  {
    // Its own registry's union too (day.ts's DAY_TABLES), checked the same
    // way: one entry here per registered section's read.
    read: ['day', 'getDay'],
    composes: [
      ['entries', 'entriesForDay'],
      ['milestones', 'getMilestonesOnDay'],
      ['doses', 'getDoses'],
      ['labs', 'getResultsOnDay'],
      ['voiceBenchmarks', 'getBenchmarksOnDay'],
      ['measurements', 'getMeasurementsInRange'],
      ['sizeRecords', 'getRecordsOnDay'],
      ['taper', 'getSessionsOnDay'],
      ['sideEffects', 'getSideEffectsInRange'],
      ['personalEffects', 'getMarkersFirstNoticedOn'],
      ['cycleEvents', 'getCycleEventsInRange'],
      ['tally', 'getEventsOnDay'],
      ['wearSessions', 'getSessions'],
      ['feltSense', 'onDay'],
      ['hairProgress', 'getStagesOnDay'],
      ['hairProgress', 'getPhotosOnDay'],
      ['hairRemoval', 'getSessionsOnDay'],
      ['appointments', 'getDayRecords'],
      ['procedures', 'getDayRecords'],
      ['tryouts', 'getPhotosOnDay'],
      ['documents', 'getDocumentsOnDay']
    ]
  },
  {
    // Its own registry's union too (lastWrite.ts's LAST_WRITE_TABLES), checked
    // the same way: one entry here per registered area's own last-write read.
    // hairProgress appears twice, the same reason it does under 'day' above:
    // two registered areas share one owning module.
    read: ['lastWrite', 'getLastWrites'],
    composes: [
      ['entries', 'lastWriteEpochDay'],
      ['milestones', 'lastWriteEpochDay'],
      ['doses', 'lastWriteEpochDay'],
      ['labs', 'lastWriteEpochDay'],
      ['voiceBenchmarks', 'lastWriteEpochDay'],
      ['measurements', 'lastWriteEpochDay'],
      ['sizeRecords', 'lastWriteEpochDay'],
      ['taper', 'lastWriteEpochDay'],
      ['sideEffects', 'lastWriteEpochDay'],
      ['personalEffects', 'lastWriteEpochDay'],
      ['cycleEvents', 'lastWriteEpochDay'],
      ['tally', 'lastWriteEpochDay'],
      ['wearSessions', 'lastWriteEpochDay'],
      ['feltSense', 'lastWriteEpochDay'],
      ['hairProgress', 'lastStageWriteEpochDay'],
      ['hairProgress', 'lastPhotoWriteEpochDay'],
      ['hairRemoval', 'lastWriteEpochDay'],
      ['procedures', 'lastWriteEpochDay'],
      ['tryouts', 'lastWriteEpochDay'],
      ['documents', 'lastWriteEpochDay']
    ]
  },
  {
    // Its own registry's union too (dayAhead.ts's DAY_AHEAD_TABLES), checked
    // the same way: one entry here per kind's own read. `appointments` and
    // `procedures` each name the other's table too - the surgery-hub join
    // `getProcedures`/`getAppointments` both carry - so listing either read
    // once already brings both tables with it.
    read: ['dayAhead', 'getDayAhead'],
    composes: [
      ['appointments', 'getAppointments'],
      ['procedures', 'getProcedures'],
      ['milestones', 'getMilestones'],
      ['letters', 'getUnlockDaysInRange'],
      ['regimen', 'getEpisodes'],
      ['doses', 'getSchedules'],
      ['doses', 'getPauses']
    ],
    narrows: {
      photo: 'a mark is a day and a kind: the milestone read it comes through carries photos it never draws',
      tryout: "the same read carries a linked tryout's label, which a mark never draws",
      roadmapGoal: "the same read carries a linked custom goal's text, which a mark never draws"
    }
  },
  {
    read: ['journalBook', 'getBook'],
    composes: [
      ['entries', 'searchEntries'],
      ['tags', 'getTagGroups'],
      ['milestones', 'getMilestones'],
      ['sideEffects', 'getSideEffectsInRange'],
      ['stats', 'recap']
    ]
  },
  {
    read: ['correlationCards', 'getCards'],
    composes: [
      ['dimensions', 'getDimensions'],
      ['doses', 'getDoses'],
      ['stats', 'tagInsights'],
      ['stats', 'dayAverages']
    ]
  },
  {
    read: ['intervalMoodPattern', 'dayOfInterval'],
    composes: [
      ['stats', 'dayAverages'],
      ['doses', 'getDoses']
    ]
  },
  {
    // The custom fold reads no dose log: it folds by the epoch day itself.
    read: ['intervalMoodPattern', 'byCustomInterval'],
    composes: [['stats', 'dayAverages']]
  }
];
