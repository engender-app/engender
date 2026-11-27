/* Bundle the resource directory so it opens offline. List trans services first. Poland's
   general crisis lines extend coverage outside limited hours and for minors. Their labels
   identify them as general services.

   Keep names, phone numbers and addresses here. labels.ts owns the translated description
   and hours. The const key list makes label coverage a type check.

   Set RESOURCES_REVIEWED_ON only after checking numbers and opening hours against each
   provider's own publications. Hours can change while numbers stay the same. */

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
