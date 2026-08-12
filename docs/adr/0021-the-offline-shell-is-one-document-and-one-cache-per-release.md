# The offline shell is one document and one cache per release

The service worker precaches the whole release into a cache named after the build
version, and answers every navigation with the single fallback document it found
there. Asset URLs are therefore root-absolute rather than relative to the path a
document was rendered for (`paths.relative: false`).

## Why

The Journal is a static SPA with one fallback page, so /calendar, /settings/labs
and /entry/new/today all render from the same document. SvelteKit's default is to
write asset URLs relative to the path a page was served at, which is correct only
at the depth it was rendered for: the shell cached from / then asks
/entry/new/today for /entry/new/_app/immutable/entry/start.js, and an offline start
on a nested route dies with no chunks. A hosted server hides this by rewriting the
document per request. A worker serving from cache cannot.

Keying the cache to the build version is what keeps one load from combining
release generations. A new release fills its own cache and cannot read half of the
previous one, so the document and the hashed chunks it names always come from the
same build.

The precache list is what the client build actually emitted, not what Vite's
manifest mentions. The manifest omits everything Vite's worker pipeline writes, so
a shell precached from SvelteKit's `build` list alone opens offline and then dies
on the first read of the Journal: SQLocal's worker and its copy of the SQLite WASM
are missing from it.

## Consequences

Deploying the Journal anywhere but the root of its origin needs this decision
revisited, which the fixed production origin already rules out. Capacitor serves
from the root of its own scheme, so the Android shell is unaffected.

Every release fills its whole shell again, because the cache name changes with the
version even for assets whose hashes did not. Only the document is fetched past the
HTTP cache, so unchanged hashed assets are usually re-stored rather than
re-downloaded. That is the cost of never mixing generations, and the shell is small
enough to pay it.

When a waiting worker may take over is a separate decision, made where a Journal
write in flight can be seen (ticket 04). This worker does not claim clients or skip
waiting.
