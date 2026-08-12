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

## The values

Decided in phase 2 ticket 01, not working values:

- Journal: `app.genderdiary.barankiewicz.dev`
- Landing site: `genderdiary.barankiewicz.dev`
- Android application ID: `dev.barankiewicz.genderdiary`

The application ID belongs here because it is the same identity question one
layer down: it is the reverse-DNS form of the domain above, which is what makes
it defensible to Google Play and F-Droid without a second domain.

Two of the three stop being changeable at a specific moment. The Journal origin
is what browser storage is attached to, so moving it after the first person
creates a Journal there strands that Journal on an origin nothing links to. The
application ID is what a store and a signing key identify, so changing it after
the first upload publishes a second app rather than an update, and every
installed copy stops receiving updates. The landing origin is the cheap one:
nothing of a visitor's is stored there, so it can move behind a redirect.

## Consequences

The two sites deploy and roll back independently. Language and theme choices on
the landing site persist only there; the Journal keeps its own preferences. The
Start journal link carries no identifier or preference state across the boundary.
Shared brand tokens and approved wording may be copied, but Phase 2 does not add a
cross-repository runtime package.
