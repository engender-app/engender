/* The dose log's editor draft, and the dose it saves as. The sheet binds its fields to a plain record of strings; this is what
   seeds that record, what naming a drug does to it, and what it becomes on
   save. Rune-free and paraglide-free, so the Node tier can hold it: the app's
   own route words come in from doseLabels.ts at the call site. */

import {
  isInjectionDose,
  isPositiveDoseAmount,
  isTopicalDose,
  lastInjectionBefore,
  matchDoseRoute,
  type ApplicationSiteKey,
  type InjectionSiteKey,
  type RouteOption
} from './doseSchedule';
import {
  dateInputValueFromEpochDay,
  epochDayFromDateInputValueOrToday,
  epochDayFromTimestamp,
  timestampAtLocalTime
} from './epochDay';
import type { DoseEventInput } from './journal/doses';
import { sameDrug } from './regimenEpisode';
import type {
  DoseEvent,
  DoseRoute,
  DoseScheduleAmount,
  DoseStatus,
  InjectionVehicle,
  RegimenEpisode
} from './types';

export type DoseDraft = {
  id?: string;
  day: string;
  time: string;
  route: DoseRoute;
  dose: string;
  doseUnit: string;
  /** `''` until the picker is tapped; the save refuses that. */
  injectionSite: InjectionSiteKey | '';
  vehicle: InjectionVehicle;
  applicationSite: ApplicationSiteKey | '';
  status: DoseStatus;
  scheduledDose: string;
  scheduledRoute: DoseRoute;
  scheduledTime: string;
  /** Which drug this is, when it needs saying. `''`
      on every dose logged while at most one episode was active - the
      common case, and the one this field must not add friction to. */
  drug: string;
};

/** `<input type="time">` value for a timestamp. Local wall-clock both ways:
    the field shows the time of day the user took the dose at, which is the
    thing being recorded. */
function timeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The moment a dose typed as a day and a wall-clock time happened at. Set
    on the day's own local date rather than added to midnight, so 10:00 on
    the day the clocks change saves 10:00 and not 09:00 or 11:00.
    A blank or half-typed time counts its missing
    parts as zero, as it always has. */
export function draftTimestamp(dayValue: string, timeValue: string): number {
  const epochDay = epochDayFromDateInputValueOrToday(dayValue);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return timestampAtLocalTime(epochDay, `${hours || 0}:${minutes || 0}`);
}

/** Seed a new dose from the active episode. When multiple episodes are
    active and none is resolved, wait for the drug picker to fill the
    amount and unit.

    Match the episode's free-text route to one of six keys. Fall back to
    oral for an absent or ambiguous match. Prefer today's outstanding
    scheduled amount so alternating doses seed correctly. Use the last
    injection's vehicle across drugs because episodes do not store it. */
export function newDoseDraft(known: {
  today: number;
  now: number;
  activeEpisode: RegimenEpisode | null;
  /** The slot the schedule still expects today, if any. */
  expectedAmount: DoseScheduleAmount | null;
  doses: readonly DoseEvent[];
  routeWords: readonly RouteOption[];
}): DoseDraft {
  const { today, now, activeEpisode, expectedAmount, doses, routeWords } = known;
  return {
    day: dateInputValueFromEpochDay(today),
    time: timeInputValue(now),
    route: (activeEpisode && matchDoseRoute(activeEpisode.route, routeWords)) || 'oral',
    dose: expectedAmount ? String(expectedAmount.dose) : activeEpisode ? String(activeEpisode.dose) : '',
    doseUnit: expectedAmount?.doseUnit ?? activeEpisode?.doseUnit ?? '',
    injectionSite: '',
    vehicle: lastInjectionBefore(doses, now)?.vehicle ?? 'oil',
    applicationSite: '',
    status: 'taken',
    scheduledDose: '',
    scheduledRoute: 'oral',
    scheduledTime: timeInputValue(now),
    drug: activeEpisode?.drug ?? ''
  };
}

export function draftOfDose(dose: DoseEvent): DoseDraft {
  return {
    id: dose.id,
    day: dateInputValueFromEpochDay(epochDayFromTimestamp(dose.timestamp)),
    time: timeInputValue(dose.timestamp),
    route: dose.route,
    dose: String(dose.dose),
    doseUnit: dose.doseUnit,
    injectionSite: isInjectionDose(dose) ? ((dose.injectionSite ?? '') as InjectionSiteKey | '') : '',
    vehicle: (isInjectionDose(dose) ? dose.vehicle : null) ?? 'oil',
    applicationSite: isTopicalDose(dose) ? ((dose.applicationSite ?? '') as ApplicationSiteKey | '') : '',
    status: dose.status,
    scheduledDose: dose.scheduled ? String(dose.scheduled.dose) : String(dose.dose),
    scheduledRoute: dose.scheduled?.route ?? dose.route,
    scheduledTime: timeInputValue(dose.scheduled?.timestamp ?? dose.timestamp),
    drug: dose.drug ?? ''
  };
}

/** A draft with this drug named on it, and with the amount, the unit and the
    route that come with it - the same convenience a single active episode
    already gets for free. A drug no active episode carries is still named on
    the draft and seeds nothing else, which is what leaves the fields for
    somebody logging a drug they have no regimen row for. */
export function draftWithDrug(
  draft: DoseDraft,
  activeEpisodes: readonly RegimenEpisode[],
  drug: string,
  routeWords: readonly RouteOption[]
): DoseDraft {
  const match = activeEpisodes.find((episode) => sameDrug(episode.drug, drug));
  if (!match) return { ...draft, drug };
  return {
    ...draft,
    drug,
    dose: String(match.dose),
    doseUnit: match.doseUnit,
    route: matchDoseRoute(match.route, routeWords) ?? draft.route
  };
}

/** What the draft saves as, or null while an injection or a topical dose has
    no site: a rotation map nobody tapped would store an empty site and
    quietly break the rotation it exists for.

    Split by route so each input carries exactly the fields its arm has,
    which is what stops an oral dose from arriving with a site (types.ts).
    Each branch refuses an untapped picker outright rather than falling
    through to the next, which would write an injection as though it had no
    site to record. */
export function doseInputOfDraft(draft: DoseDraft): DoseEventInput | null {
  const dose = parseFloat(draft.dose);
  if (draft.status !== 'skipped' && !isPositiveDoseAmount(dose)) return null;
  const common = {
    id: draft.id,
    timestamp: draftTimestamp(draft.day, draft.time),
    dose,
    doseUnit: draft.doseUnit.trim(),
    status: draft.status,
    scheduled:
      draft.status === 'changed'
        ? {
            dose: parseFloat(draft.scheduledDose) || dose,
            route: draft.scheduledRoute,
            timestamp: draftTimestamp(draft.day, draft.scheduledTime)
          }
        : null,
    drug: draft.drug.trim() || null
  };
  if (isInjectionDose(draft)) {
    if (draft.injectionSite === '') return null;
    return { ...common, route: draft.route, injectionSite: draft.injectionSite, vehicle: draft.vehicle };
  }
  if (isTopicalDose(draft)) {
    if (draft.applicationSite === '') return null;
    return { ...common, route: draft.route, applicationSite: draft.applicationSite };
  }
  /* Spelled out rather than left as a bare fallthrough: the draft is a plain
     record, not the union, so nothing subtracts the other four routes from
     it here. The three branches cover all eight between them; rectal and
     an implant carry no site, like oral. */
  if (draft.route === 'oral' || draft.route === 'sublingual' || draft.route === 'rectal' || draft.route === 'implant') {
    return { ...common, route: draft.route };
  }
  return null;
}
