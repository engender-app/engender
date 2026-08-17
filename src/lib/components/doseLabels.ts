/* Message lookups for the dose log's closed vocabularies (phase 4 ticket
   02). Here rather than in each screen because the map and the log list
   name the same sites, and here rather than in doseSchedule.ts because that
   file is the pure domain layer and knows nothing about locales.

   Every vocabulary is keyed one message per member rather than composed from
   parts. Polish inflects a side with its region's gender ("udo lewe" but
   "pośladek lewy"), so a "{region}, {side}" template would be wrong in half
   the injection sites, and the same trap waits in any language with
   agreement. */

import { m } from '$lib/paraglide/messages';
import type { DoseRoute, DoseStatus, InjectionVehicle, PauseReason } from '$lib/data/types';

const INJECTION_SITE_LABELS: Record<string, () => string> = {
  'ventrogluteal-left': m.dose_site_ventrogluteal_left,
  'ventrogluteal-right': m.dose_site_ventrogluteal_right,
  'dorsogluteal-left': m.dose_site_dorsogluteal_left,
  'dorsogluteal-right': m.dose_site_dorsogluteal_right,
  'thigh-left': m.dose_site_thigh_left,
  'thigh-right': m.dose_site_thigh_right,
  'deltoid-left': m.dose_site_deltoid_left,
  'deltoid-right': m.dose_site_deltoid_right,
  'abdomen-left': m.dose_site_abdomen_left,
  'abdomen-right': m.dose_site_abdomen_right,
  'loveHandle-left': m.dose_site_loveHandle_left,
  'loveHandle-right': m.dose_site_loveHandle_right
};

const APPLICATION_SITE_LABELS: Record<string, () => string> = {
  abdomen: m.dose_app_site_abdomen,
  upperArm: m.dose_app_site_upperArm,
  innerArm: m.dose_app_site_innerArm,
  thigh: m.dose_app_site_thigh,
  buttock: m.dose_app_site_buttock,
  shoulder: m.dose_app_site_shoulder,
  back: m.dose_app_site_back
};

const ROUTE_LABELS: Record<DoseRoute, () => string> = {
  oral: m.dose_route_oral,
  sublingual: m.dose_route_sublingual,
  im: m.dose_route_im,
  sc: m.dose_route_sc,
  patch: m.dose_route_patch,
  gel: m.dose_route_gel
};

const STATUS_LABELS: Record<DoseStatus, () => string> = {
  taken: m.dose_status_taken,
  skipped: m.dose_status_skipped,
  changed: m.dose_status_changed
};

const VEHICLE_LABELS: Record<InjectionVehicle, () => string> = {
  oil: m.dose_vehicle_oil,
  aqueous: m.dose_vehicle_aqueous
};

const PAUSE_REASON_LABELS: Record<PauseReason, () => string> = {
  planned: m.pause_reason_planned,
  accidental: m.pause_reason_accidental
};

/* A site read back from an older archive could name a region this build's
   map no longer has, so the raw key is the fallback rather than a crash: a
   site nobody can read is still better than a dose nobody can open. */
export const injectionSiteLabel = (site: string): string => INJECTION_SITE_LABELS[site]?.() ?? site;
export const applicationSiteLabel = (site: string): string => APPLICATION_SITE_LABELS[site]?.() ?? site;
export const routeLabel = (route: DoseRoute): string => ROUTE_LABELS[route]?.() ?? route;
export const statusLabel = (status: DoseStatus): string => STATUS_LABELS[status]?.() ?? status;
export const vehicleLabel = (vehicle: InjectionVehicle): string => VEHICLE_LABELS[vehicle]?.() ?? vehicle;
export const pauseReasonLabel = (reason: PauseReason): string => PAUSE_REASON_LABELS[reason]?.() ?? reason;

/** Route options for a picker, in the order the ticket names them: the two
    oral-ish routes, the two injections, then the two topical ones. */
export const ROUTE_OPTIONS: { value: DoseRoute; label: string }[] = (
  ['oral', 'sublingual', 'im', 'sc', 'patch', 'gel'] as const
).map((route) => ({ value: route, label: routeLabel(route) }));

export const STATUS_OPTIONS: { value: DoseStatus; label: string }[] = (['taken', 'skipped', 'changed'] as const).map(
  (status) => ({ value: status, label: statusLabel(status) })
);
