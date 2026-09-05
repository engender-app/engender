/* Display wording for the dose log's closed vocabularies (phase 4 ticket
   02), alongside reminderLabel.ts for the same reason it is there: the
   wording speaks paraglide, and nothing the Node tier touches may import
   that (ADR-0016). doseSchedule.ts holds the vocabularies themselves and
   stays free of it; this is where they get their words.

   Each record is typed against a union derived from those `as const` lists,
   the rule labels.ts sets out: adding a site or a route without adding its
   message is then a typecheck failure rather than a raw key on screen.

   Keyed one message per member rather than composed from parts. Polish
   inflects a side with its region's gender ("udo lewe" but "pośladek lewy"),
   so a "{region}, {side}" template would be wrong in half the injection
   sites, and the same trap waits in any language with agreement. */

import { m } from '$lib/paraglide/messages';
import type { ApplicationSiteKey, InjectionSiteKey, RouteOption } from '$lib/data/doseSchedule';
import type { DoseRoute, DoseStatus, EpisodeEndReason, InjectionVehicle, PauseReason } from '$lib/data/types';
import type { RegimenTemplateKey } from './builtins';

const INJECTION_SITE_LABELS: Record<InjectionSiteKey, () => string> = {
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

const APPLICATION_SITE_LABELS: Record<ApplicationSiteKey, () => string> = {
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

/** None preferred over another (ticket 43, mirroring the rule just above). */
const EPISODE_END_REASON_LABELS: Record<EpisodeEndReason, () => string> = {
  switchedDrugOrRoute: m.episode_end_reason_switched,
  pausedForNow: m.episode_end_reason_paused,
  decidedToStop: m.episode_end_reason_stopped
};

/* A regimen template's picker-row name, and the drug/ester text it pre-fills
   (CONTEXT: "Regimen template", phase 5 ticket 42). Route is not repeated
   here - it pre-fills from ROUTE_LABELS below, by the DoseRoute each
   template names, so the word matches whatever the dose log already calls
   that route rather than drifting into a second wording for the same
   route. Ester is absent from a template with none, the same nullable
   shape RegimenEpisode.ester itself has. */
const REGIMEN_TEMPLATE_NAME: Record<RegimenTemplateKey, () => string> = {
  estradiol_valerate_im: m.tpl_regimen_estradiol_valerate_im,
  estradiol_oral: m.tpl_regimen_estradiol_oral,
  estradiol_gel: m.tpl_regimen_estradiol_gel,
  testosterone_cypionate_im: m.tpl_regimen_testosterone_cypionate_im,
  testosterone_gel: m.tpl_regimen_testosterone_gel
};

const REGIMEN_TEMPLATE_DRUG: Record<RegimenTemplateKey, () => string> = {
  estradiol_valerate_im: m.tpl_regimen_drug_estradiol,
  estradiol_oral: m.tpl_regimen_drug_estradiol,
  estradiol_gel: m.tpl_regimen_drug_estradiol,
  testosterone_cypionate_im: m.tpl_regimen_drug_testosterone,
  testosterone_gel: m.tpl_regimen_drug_testosterone
};

const REGIMEN_TEMPLATE_ESTER: Partial<Record<RegimenTemplateKey, () => string>> = {
  estradiol_valerate_im: m.tpl_regimen_ester_valerate,
  testosterone_cypionate_im: m.tpl_regimen_ester_cypionate
};

const REGIMEN_TEMPLATE_ROUTE: Record<RegimenTemplateKey, DoseRoute> = {
  estradiol_valerate_im: 'im',
  estradiol_oral: 'oral',
  estradiol_gel: 'gel',
  testosterone_cypionate_im: 'im',
  testosterone_gel: 'gel'
};

/* Both take a plain string, not the key union: a site read back from an
   older archive could name a region this build's map no longer has, and the
   raw key is a better fallback than a crash - a site nobody can read still
   beats a dose nobody can open. The records above are exhaustive over the
   current keys, which is what the typecheck guards. */
export const injectionSiteLabel = (site: string): string =>
  INJECTION_SITE_LABELS[site as InjectionSiteKey]?.() ?? site;
export const applicationSiteLabel = (site: string): string =>
  APPLICATION_SITE_LABELS[site as ApplicationSiteKey]?.() ?? site;
export const routeLabel = (route: DoseRoute): string => ROUTE_LABELS[route]?.() ?? route;
export const statusLabel = (status: DoseStatus): string => STATUS_LABELS[status]?.() ?? status;
export const vehicleLabel = (vehicle: InjectionVehicle): string => VEHICLE_LABELS[vehicle]?.() ?? vehicle;
export const pauseReasonLabel = (reason: PauseReason): string => PAUSE_REASON_LABELS[reason]?.() ?? reason;
export const episodeEndReasonLabel = (reason: EpisodeEndReason): string =>
  EPISODE_END_REASON_LABELS[reason]?.() ?? reason;
export const regimenTemplateName = (key: string): string =>
  REGIMEN_TEMPLATE_NAME[key as RegimenTemplateKey]?.() ?? key;
export const regimenTemplateDrug = (key: string): string => REGIMEN_TEMPLATE_DRUG[key as RegimenTemplateKey]?.() ?? '';
export const regimenTemplateEster = (key: string): string | null =>
  REGIMEN_TEMPLATE_ESTER[key as RegimenTemplateKey]?.() ?? null;
export const regimenTemplateRoute = (key: string): string =>
  routeLabel(REGIMEN_TEMPLATE_ROUTE[key as RegimenTemplateKey] ?? 'oral');

/** Route options for a picker, in the order the ticket names them: the two
    oral-ish routes, the two injections, then the two topical ones. */
export const ROUTE_OPTIONS: RouteOption[] = (['oral', 'sublingual', 'im', 'sc', 'patch', 'gel'] as const).map(
  (route) => ({ value: route, label: routeLabel(route) })
);

export const STATUS_OPTIONS: { value: DoseStatus; label: string }[] = (['taken', 'skipped', 'changed'] as const).map(
  (status) => ({ value: status, label: statusLabel(status) })
);
