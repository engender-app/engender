import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { compareDoseSchedule } from './journal/doses';
import type { Journal } from './journal/journal';
import { activeEpisodesAt, attributeDose, attributeDrug, nearestActiveEpisode } from './regimenEpisode';

/** How far back the log and the comparison look at first. The screen widens
    it by this much per Earlier, or to reach a deep-linked dose (phase 11
    ticket 18). */
export const DOSE_LOG_WINDOW_DAYS = 90;

/** How far nearestActiveEpisode may search either side of today for a
    schedule's nearest open slot (ticket 40) - a different question from the
    window above (how much history the log and comparison show), not the same
    number reused: it happens to share its value only because the log is read
    for that window, and a wider search would find a "nearest" slot the screen
    has no doses to check against. */
const NEAREST_SLOT_RADIUS_DAYS = DOSE_LOG_WINDOW_DAYS;

/** How long an auto-logged dose keeps its one-tap correction (ticket 11).
    A month is long enough to cover a person opening the app after a
    fortnight away and reading back what was written for them, and short
    enough that a two-year log is not a wall of buttons. Past it the row is
    an ordinary row and the flip is still there in the editor. */
const SKIP_CONTROL_DAYS = 30;

export interface DoseLogQuestion {
  today: number;
  /** The window's first day. */
  fromEpochDay: number;
  /** The dose a link named, resolved by id so one outside the window can be
      reached by widening it, and a deleted one can say so. */
  deepLinkedDoseId: string | null;
  /** Which regimen the schedule view compares against while more than one
      is active (ticket 15), in order of claim: the pick made on this visit,
      the drug a Care spine link named, the stored pick. The first naming an
      active drug wins; with none, the default the new-dose editor gets. */
  regimenClaims: readonly (string | null)[];
}

/** One result for the dose log's two views and its editor (final-audit
    ticket 31). Start every journal call before awaiting so liveQuery observes
    every dependency on its first run. One answer, as readCare is: both views
    land together, and a failed read leaves the screen at NO_DOSE_LOG rather
    than half of it drawn from reads that did answer. */
export async function readDoseLog(journal: Pick<Journal, 'regimen' | 'doses'>, question: DoseLogQuestion) {
  const { today, fromEpochDay, deepLinkedDoseId, regimenClaims } = question;
  const [episodes, allDoses, schedules, pauses, deepLinkedDose] = await Promise.all([
    journal.regimen.getEpisodes(),
    /* The whole log, not the window (ticket 10): a rotation site's last use
       routinely predates the window, and "never used" has to mean never. The
       window and whether anything precedes it are cut from the same rows. */
    journal.doses.getDoses(0, today),
    journal.doses.getSchedules(),
    journal.doses.getPauses(),
    deepLinkedDoseId ? journal.doses.getDoseById(deepLinkedDoseId) : Promise.resolve(null)
  ]);
  const windowStart = startOfDayTimestamp(fromEpochDay);
  const doses = allDoses.filter((dose) => dose.timestamp >= windowStart);

  /* Every episode active today (phase 5 ticket 38): usually one, but a
     concurrent second drug's makes it two. An episode is in effect for whole
     days (regimenEpisode.ts), so today's start answers what Date.now() did. */
  const activeEpisodes = activeEpisodesAt(episodes, startOfDayTimestamp(today));
  /* The episode a new dose defaults to (ticket 40): the sole active one, or
     whichever schedule's slot sits nearest to now when that is not a tie. */
  const activeEpisode = nearestActiveEpisode(
    episodes, activeEpisodes, schedules, pauses, doses, today, NEAREST_SLOT_RADIUS_DAYS
  );
  /* The drugs to choose between, for both the editor and the schedule view's
     picker: both ask "which of the concurrently active drugs". */
  const activeDrugChoices = [...new Set(activeEpisodes.map((episode) => episode.drug))];
  const selectedRegimenDrug =
    regimenClaims.find((drug): drug is string => drug !== null && activeDrugChoices.includes(drug)) ??
    activeEpisode?.drug ?? (activeDrugChoices.length > 0 ? activeDrugChoices[0] : null);
  /* `drug` only travels while more than one regimen is active - with at most
     one, the comparison's own default already answers the question. */
  const scheduleView = compareDoseSchedule(episodes, doses, schedules, pauses, {
    fromEpochDay,
    toEpochDay: today,
    drug: activeDrugChoices.length > 1 ? (selectedRegimenDrug ?? undefined) : undefined
  });

  /* Newest first, each row with the episode it was attributed to and the
     drug that goes with it. The drug is attributeDrug's answer rather than
     the attribution's: it tolerates two active episodes agreeing on one drug
     and takes a dose's own name as-is. */
  const logRows = [...doses].reverse().map((dose) => ({
    dose,
    attribution: attributeDose(episodes, dose),
    drug: attributeDrug(episodes, dose).drug,
    /* The one-tap correction: an auto-logged dose not already corrected,
       inside its window. */
    offersSkip: dose.source === 'schedule' && dose.status !== 'skipped' &&
      epochDayFromTimestamp(dose.timestamp) >= today - SKIP_CONTROL_DAYS
  }));
  const unmatchedRows = (scheduleView.reason === null ? scheduleView.comparison.unmatched : []).map((dose) => ({
    dose,
    drug: attributeDrug(episodes, dose).drug
  }));

  return {
    episodes,
    doses,
    allDoses,
    hasOlderDoses: allDoses.length > 0 && allDoses[0].timestamp < windowStart,
    deepLinkedDose,
    logRows,
    activeEpisodes,
    activeEpisode,
    activeDrugChoices,
    selectedRegimenDrug,
    scheduleView,
    unmatchedRows
  };
}

export type DoseLog = Awaited<ReturnType<typeof readDoseLog>>;

/** What the screen draws before the first answer, or after a read that
    failed: nothing logged and nothing to compare against. */
export const NO_DOSE_LOG: DoseLog = {
  episodes: [],
  doses: [],
  allDoses: [],
  hasOlderDoses: false,
  deepLinkedDose: null,
  logRows: [],
  activeEpisodes: [],
  activeEpisode: null,
  activeDrugChoices: [],
  selectedRegimenDrug: null,
  scheduleView: { reason: 'noEpisode' },
  unmatchedRows: []
};
