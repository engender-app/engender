/* The dose log's editor draft, and the dose it saves as (final-audit ticket
   31). The sheet binds its fields to a plain record of strings; this is what
   seeds that record, what naming a drug does to it, and what it becomes on
   save. Rune-free and paraglide-free, so the Node tier can hold it: the app's
   own route words come in from doseLabels.ts at the call site. */

import {
  isInjectionDose,
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
  startOfDayTimestamp
} from './epochDay';
import type { DoseEventInput } from './journal/doses';
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
  /** Which drug this is, when it needs saying (phase 5 ticket 38). `''`
      on every dose logged while at most one episode was active - the
      common case, and the one this field must not add friction to. */
  drug: string;
};

/** `<input type="time">` value for a timestamp. Local wall-clock both ways:
    the field shows the time of day the user took the dose at, which is the
    thing being recorded. */
export function timeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function draftTimestamp(dayValue: string, timeValue: string): number {
  const epochDay = epochDayFromDateInputValueOrToday(dayValue);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return startOfDayTimestamp(epochDay) + (hours || 0) * 3600000 + (minutes || 0) * 60000;
}

/** A new dose, seeded from the active episode: someone logging today's dose
    is almost always logging the regimen they are on, and retyping the amount
    and unit every time is the tax that stops people logging. With more than
    one episode active and none resolved, there is no single episode to seed
    from - the drug picker fills the amount and unit in once a drug is chosen.

    Three more seeds than that (phase 5 UX ticket 37), because the sheet's
    job is to state what the app already knows rather than to ask again:

    The route comes off the episode's own words. It is free text there and
    one of six keys here, so it needs reading rather than copying
    (matchDoseRoute), and where the words name no route or two the answer is
    oral - the same default as before, now only for the cases nothing better
    is available.
    The amount prefers what the schedule is still expecting today over the
    episode's single figure, which is the alternating 2mg/1mg regimen: seeding
    from the episode fills in the wrong number every other day.
    The vehicle comes off the last injection logged, whatever drug it was
    for. It is not on the episode at all, and asking on every injection for
    something that changes about once a prescription is the definition of
    asking twice. */
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
  const match = activeEpisodes.find((episode) => episode.drug === drug);
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
     it here. The three branches cover all six between them. */
  if (draft.route === 'oral' || draft.route === 'sublingual') return { ...common, route: draft.route };
  return null;
}
