# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trans people tracking their own gender transition day by day, on their own
device. The reader knows what dysphoria is, what a dose is, what a name
change costs; the app never explains their life to them. Some users open
the app in situations where being seen with it is unsafe, which is why
disguise mode and the app lock exist and gate what renders.

## Product Purpose

A local-first journal: entries carry mood, gender feelings on configurable
scales, tags, notes, photos, voice recordings and body-region feelings,
plus milestones, labs, regimen, measurements and the other care surfaces.
There is no account and no backend; data leaves the device only when the
person deliberately creates an archive. Success is the person seeing their
own history clearly, on their own terms.

## Positioning

One trans person wrote this for other trans people. GPLv3, no price, no
plan, nothing to upsell. Nothing in the app has to sell anything, and copy
written as though a company stood behind it reads as a lie. Local-first: no
account, no backend, data leaves the device only when the person
deliberately archives it - a neighbouring product with a business model
behind it could not truthfully copy that.

## Operating Context

SvelteKit PWA plus a Capacitor Android wrapper from one codebase, offline
first (one document, one cache per release, ADR-0021). English and Polish.
Colour is entirely data-attribute driven through a token layer
(`src/lib/theme/`), no utility framework, no CSS-in-JS; cards, buttons and
list rows are global classes, so restyling the app is a token edit. 61
routes exist. Feature surfaces are grouped under a More hub (`/more`);
Settings (`/settings`) holds only preferences, though most existing feature
routes still live under `/settings/*` URLs since only their entry point
moved, not the URL (ADR-0036, shipped). Every screen lights a tab in the
bottom bar/rail (ADR/ticket 09, shipped, see `src/lib/navigation/active-tab.ts`).

## Capabilities and Constraints

- 8 queer-flag palettes x light/dark carry identity - agender, bisexual,
  genderfluid, lesbian, nonbinary, pansexual, rainbow, trans. All 8 stay,
  whatever a redesign does with them. The flag needs no new assets:
  `--motif-stripes` lists in `src/lib/theme/palettes.css` are faithful
  stripe sequences per palette, including bisexual's doubled stops encoding
  its 2:1:2 proportions.
- Colour never judges (ADR-0012): single-hue intensity ramps, never
  red-to-green or diverging. Mood has its own fixed literal-hex scale
  (ADR-0025), independent of any palette.
- The pride motif is Home-only and never shows under disguise (ADR-0035,
  shipped).
- Feature surfaces live in a More hub; Settings holds only preferences
  (ADR-0036, shipped).
- No medical framing anywhere: the app never interprets a value or suggests
  a dose.
- A full per-route inventory - what each screen must keep doing, where it's
  reachable from, and which of this repo's in-flight tickets change it -
  lives in `SCREENS.md`, not here. This file stays product truth; that file
  is the screen-by-screen brief.

## Brand Commitments

Voice per `docs/ui-copy.md`: second person, sentence case, British
spelling, warm but not chirpy, never genders the reader, no emoji, no em or
en dashes, no "we". Type is bundled Nunito (body) and Outfit (display).
The app name is a working title; the rename decision is open and out of
scope for any UI work.

## Evidence on Hand

Real UI strings in `messages/en.json` / `messages/pl.json`. The full domain
language lives in `CONTEXT.md`. Historical visual reference from the
project's original static mockup is in `mockup/DESIGN.md`; it predates the
More hub and current navigation and should be read as early-project
context, not current truth. The current, authoritative screen-by-screen
brief is `SCREENS.md`. Demo data renders every screen without a journal
(`VITE_DEMO=1`).

## Product Principles

- Private by default; anything visible to a bystander is a design decision.
- The person names their own identity; the app assumes nothing about
  direction or goal.
- Say what a screen does and get out of the way.
- No judgment encoded anywhere: not in colour, not in copy, not in a score.

## Accessibility & Inclusion

Floor from `docs/ui-copy.md` and the phase-5 UX spec: usable at 390px width
and 200% zoom, touch targets >= 44px, WCAG 4.5:1 for body text (3:1 large),
the palette contrast test guards on-colour pairs across all 8 palettes x 2
themes.
