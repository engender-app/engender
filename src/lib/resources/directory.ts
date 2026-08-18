/* The bundled resource directory (ticket 32): trans organizations, helplines
   and reading, in the app rather than fetched from anywhere. Something a
   person reaches for at three in the morning with no signal has to be there
   with no signal, and this is the only screen in the app whose whole content
   is other people's phone numbers and addresses.

   Trans-specific only. No 112, no 999, no general crisis line: a person in
   Poland already knows those numbers, and a directory that opens with them
   buries the three entries they came here for.

   Keys and language-neutral facts only. A name like "Fundacja Trans-Fuzja" is
   a proper noun and reads the same in both catalogues, and a number is a
   number, so those live here; what an entry offers and when it answers does
   not survive translation, so labels.ts holds it (the same split as
   vocabulary/builtins.ts, ADR-0016). This file takes nothing but types, so
   the Node tier can check it without dragging in paraglide.

   `as const`, so the key list also produces the union labels.ts has to cover
   exhaustively: an entry added here without its wording is a typecheck
   failure rather than a raw key in front of someone who needs the number.

   RESOURCES_REVIEWED_ON is a claim, not a build stamp. It says a person
   opened every site below and read the number and the hours off what the
   organization itself publishes. Hours are what rots: Mindline Trans+ went
   from three evenings a week to one and Trans Lifeline stopped being a
   24-hour line, both while their numbers stayed put. Do not bump the date
   without doing the pass. */

export type ResourceRegion = 'pl' | 'int';

/** helpline is a number a person answers, support is an organization to
    approach, info is reading. Also the order they appear in. */
export type ResourceKind = 'helpline' | 'support' | 'info';

export interface Resource {
  key: string;
  region: ResourceRegion;
  kind: ResourceKind;
  /** As the organization writes it. Never translated. */
  name: string;
  /** Dialable as written, spaces and all: it goes into a tel: URI. */
  phone?: string;
  url?: string;
}

/** The day a person last checked every number and address below. */
export const RESOURCES_REVIEWED_ON = '2026-08-18';

const ENTRIES = [
  {
    key: 'pl-lambda',
    region: 'pl',
    kind: 'helpline',
    name: 'Telefon Zaufania Lambda Warszawa',
    phone: '+48 22 628 52 22',
    url: 'https://lambdawarszawa.org/wsparcie'
  },
  {
    key: 'pl-transfuzja',
    region: 'pl',
    kind: 'support',
    name: 'Fundacja Trans-Fuzja',
    /* /pomoc rather than the front page, and rather than one of the three
       role addresses on /kontakt: the consultations, the legal help and the
       groups each have their own way in, and this is the page that lists
       all of them. transfuzja.pl, which reads like the obvious domain, is a
       parked listing on a domain marketplace and must never be shipped. */
    url: 'https://www.transfuzja.org/pomoc'
  },
  {
    key: 'pl-tranzycja',
    region: 'pl',
    kind: 'info',
    name: 'tranzycja.pl',
    url: 'https://tranzycja.pl/'
  },
  {
    key: 'int-translifeline',
    region: 'int',
    kind: 'helpline',
    name: 'Trans Lifeline',
    phone: '1 877 565 8860',
    url: 'https://translifeline.org/'
  },
  {
    key: 'int-trevor',
    region: 'int',
    kind: 'helpline',
    name: 'The Trevor Project',
    phone: '1 866 488 7386',
    url: 'https://www.thetrevorproject.org/'
  },
  {
    key: 'int-mindline-trans',
    region: 'int',
    kind: 'helpline',
    name: 'Mindline Trans+',
    phone: '0300 330 5468',
    /* Under Mind in Somerset, not mindlinetrans.org.uk. That domain lapsed
       and now serves casino spam. */
    url: 'https://www.mindinsomerset.org.uk/our-services/mindline-trans/'
  },
  {
    key: 'int-gdb',
    region: 'int',
    kind: 'info',
    name: 'The Gender Dysphoria Bible',
    url: 'https://genderdysphoria.fyi/'
  },
  {
    key: 'int-transfemscience',
    region: 'int',
    kind: 'info',
    name: 'Transfeminine Science',
    url: 'https://transfemscience.org/'
  }
] as const satisfies readonly Resource[];

export type ResourceKey = (typeof ENTRIES)[number]['key'];

/* Widened on the way out. ENTRIES stays literal so the key union above is
   exact, but every reader wants one type with optional phone and url rather
   than a union of eight shapes, half of which have no `phone` property to
   read at all. */
export const RESOURCES: readonly Resource[] = ENTRIES;

export function resourcesFor(region: ResourceRegion, kind?: ResourceKind): readonly Resource[] {
  return RESOURCES.filter((r) => r.region === region && (kind === undefined || r.kind === kind));
}
