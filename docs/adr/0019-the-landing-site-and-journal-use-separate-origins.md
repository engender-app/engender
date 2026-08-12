# The landing site and Journal use separate origins

The public landing site and hosted Journal use separate repositories, deployment
pipelines and web origins. The landing site links to the Journal but cannot share
preferences, storage, service workers or runtime dependencies with it.

## Why

Browser storage and service-worker control follow the origin boundary. Combining
marketing code with the Journal would let a landing dependency or deployment
mistake reach the origin that holds sensitive data. It would also couple ordinary
copy and SEO releases to the Journal's strict headers, offline shell and rollback
rules.

## Consequences

The two sites deploy and roll back independently. Language and theme choices on
the landing site persist only there; the Journal keeps its own preferences. The
Start journal link carries no identifier or preference state across the boundary.
Shared brand tokens and approved wording may be copied, but Phase 2 does not add a
cross-repository runtime package.
