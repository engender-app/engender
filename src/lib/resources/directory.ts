/* The bundled resource directory (ticket 32): trans organisations, helplines
   and reading, in the app rather than fetched from anywhere. Something a
   person reaches for at three in the morning with no signal has to be there
   with no signal, and this is the only screen in the app whose whole content
   is other people's phone numbers and addresses.

   Trans-specific first, and no 112 or 999: a person in Poland already knows
   those numbers, and a directory that opens with them buries the entries
   they came here for. The one exception is the general crisis lines under
   Poland (functional audit ticket 40). Lambda answers three hours on
   weekday evenings, so an adult in Poland at night or at a weekend had no
   line on this screen that was open and local. 116 123 and 800 70 2222 are
   the two free adult lines that answer at any hour, and 116 111 is the
   same for under-18s. None of the three is a trans service, and their
   descriptions say so rather than letting anyone find out on the call.

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
   organisation itself publishes. Hours are what rots: Mindline Trans+ went
   from three evenings a week to one and Trans Lifeline stopped being a
   24-hour line, both while their numbers stayed put. Do not bump the date
   without doing the pass. */

export type ResourceRegion = 'pl' | 'int';

/** helpline is a number a person answers, support is an organisation to
    approach, info is reading. Also the order they appear in. */
type ResourceKind = 'helpline' | 'support' | 'info';

interface ResourceShape {
  key: string;
  region: ResourceRegion;
  kind: ResourceKind;
  /** As the organisation writes it. Never translated. */
  name: string;
  /** Dialable as written, spaces and all: it goes into a tel: URI. With its
      country code, because the person holding the phone is in Poland and a
      UK line published as 0300 330 5468 does not ring from there. Polish
      116 short codes and 800 freephone numbers are the exception: they
      exist only inside the Polish network, the operators publish them
      without +48, and a short code is not guaranteed to route with it. */
  phone?: string;
  url?: string;
}

/** The day a person last checked every number and address below. The
    release-time guard in reviewedContent.ts warns six months after it. */
export const RESOURCES_REVIEWED_ON = '2026-10-21';

const ENTRIES = [
  {
    key: 'pl-lambda',
    region: 'pl',
    kind: 'helpline',
    name: 'Telefon Zaufania Lambda Warszawa',
    phone: '+48 22 628 52 22',
    url: 'https://www.lambdawarszawa.org/wsparcie'
  },
  {
    key: 'pl-116123',
    region: 'pl',
    kind: 'helpline',
    name: 'Telefon Zaufania dla Dorosłych',
    phone: '116 123',
    /* NASK's site for the line, never 116123.pl (a parked domain for sale)
       or 116123.edu.pl (a certificate for another host, and behind it a page
       still giving the old 14:00 to 22:00 hours). */
    url: 'https://116sos.pl/'
  },
  {
    key: 'pl-centrum-wsparcia',
    region: 'pl',
    kind: 'helpline',
    name: 'Centrum Wsparcia, Fundacja ITAKA',
    phone: '800 70 2222',
    url: 'https://centrumwsparcia.pl/'
  },
  {
    key: 'pl-116111',
    region: 'pl',
    kind: 'helpline',
    name: 'Telefon Zaufania dla Dzieci i Młodzieży',
    phone: '116 111',
    url: 'https://116111.pl/'
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
    key: 'pl-tranzycja-testosterone',
    region: 'pl',
    kind: 'info',
    name: 'Maskulinizująca terapia hormonalna',
    /* tranzycja.pl's testosterone chapter, the twin of its feminising one.
       The directory's English reading is all feminising (Transfeminine
       Science), so this is the transmasculine reading ticket 40 asked for. */
    url: 'https://tranzycja.pl/krok-po-kroku/maskulinizujaca-terapia-hormonalna/'
  },
  {
    key: 'pl-zaimki',
    region: 'pl',
    kind: 'info',
    name: 'zaimki.pl',
    url: 'https://zaimki.pl/'
  },
  {
    key: 'int-translifeline',
    region: 'int',
    kind: 'helpline',
    name: 'Trans Lifeline',
    phone: '+1 877 565 8860',
    url: 'https://translifeline.org/'
  },
  {
    key: 'int-mindline-trans',
    region: 'int',
    kind: 'helpline',
    name: 'Mindline Trans+',
    phone: '+44 300 330 5468',
    /* Under Mind in Somerset, not mindlinetrans.org.uk. That domain lapsed
       and now serves casino spam. The Mind in Somerset page refuses
       headless browsers, so on 2026-10-21 the Friday 20:00 to 23:00 hours
       came from Frome Town Council's directory (updated 21 May 2026). Open
       it in a real browser at the next review. */
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
  },
  {
    key: 'int-wpath-soc8',
    region: 'int',
    kind: 'info',
    name: 'WPATH Standards of Care, Version 8',
    /* Free-to-read on PMC (NIH), the copy that will still resolve if the
       publisher's own tandfonline.com page ever goes behind a harder
       paywall. Chapter 12 covers hormone therapy in every direction;
       chapter 8 covers non-binary and low-dose approaches specifically. */
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9553112/'
  }
] as const satisfies readonly ResourceShape[];

export type ResourceKey = (typeof ENTRIES)[number]['key'];

/* What a reader gets: one type with optional phone and url, rather than the
   union of literal shapes ENTRIES has, half of which carry no `phone`
   property to read at all. The key stays narrow through that widening, which
   is what lets labels.ts index its maps directly instead of casting them back
   to strings and carrying a fallback for a key that cannot exist. */
interface Resource extends ResourceShape {
  key: ResourceKey;
}

/* RESOURCES stays exported only for its own test (AU-09 test-only review). */
export const RESOURCES: readonly Resource[] = ENTRIES;

export function resourcesFor(region: ResourceRegion): readonly Resource[] {
  return RESOURCES.filter((r) => r.region === region);
}
