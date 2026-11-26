# The landing site and Journal use separate origins

Status: Accepted
Decided: 2026-08-12
Last reviewed: 2026-11-02
Supersedes: none

The public landing site and the hosted journal use separate repositories, deployment pipelines and web origins. The landing site links to the journal and cannot share preferences, storage, service workers or runtime dependencies with it.

## Why

Browser storage and service-worker control follow the origin. Combining marketing code with the journal would let a landing dependency or a deployment mistake reach the origin that holds sensitive data. It would also tie copy and SEO releases to the journal's strict headers, offline shell and rollback rules.

## The values

- Journal: `journal.engender.app` (`JOURNAL_ORIGIN` in `capacitor.config.ts`; hosted web metadata only, Android serves the bundle from `https://localhost`).
- Landing site: `engender.app`.
- Android application ID: `dev.engender.app`.

The application ID is the same identity question one layer down: the reverse-DNS form of the domain, which is what makes it defensible to Google Play and F-Droid without a second domain.

Two of the three stop being changeable at a specific moment. Browser storage is attached to the journal origin, so moving it after the first person creates a journal there strands that journal on an origin nothing links to. A store and a signing key identify the application ID, so changing it after the first upload publishes a second app and every installed copy stops receiving updates. The landing origin is the cheap one: nothing of a visitor's is stored there, so it can move behind a redirect.

## Consequences

The two sites deploy and roll back independently. Language and theme choices on the landing site persist only there. The Start journal link carries no identifier or preference state across the boundary. Shared brand tokens and approved wording may be copied; there is no cross-repository runtime package.

History: values decided 2026-08-12 under a personal domain; moved to the `engender.app` names before 1.0; restated 2026-11-02.
