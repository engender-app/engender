# The public version name comes from a signed tag

Status: Accepted
Decided: 2026-08-12
Last reviewed: 2026-11-02
Supersedes: none

One value names a release, and `scripts/app-version.mjs` is the only place it is worked out. A signed `v<semver>` tag pointing at HEAD, on a tree with no edits, gives the public version name. Everything else builds as `0.0.0-dev+g<commit>`, with `.dirty` appended when the tree had been touched, and `unknown` in place of the commit where there is no checkout to read.

The build injects the string as a literal (`__APP_VERSION__` in `vite.config.ts`), the About screen shows the literal, and the release pipeline passes the same string to the release notes and the Android artifacts through `ENGENDER_VERSION` instead of having each ask git a slightly different question. `android/app/build.gradle` reads it from there.

## Why

Four things name a release: the bundle, the About screen, the release notes and the Android artifacts. A version written in four places disagrees with itself. The tag is the one fact that exists at release time and is the thing being released.

Requiring a signature keeps a local `git tag v1.0.0` from minting a release name. The script checks that the tag object carries a signature, which separates a deliberate release tag from a bookmark; whether it verifies is answered where the public key is.

Refusing an edited tree matters more than it looks. Untracked files reach the build (anything dropped into `static/` is copied into the release verbatim), so a build from a dirty tree is not the tagged contents however the tag was made.

The failure being designed against is a build that quietly claims a release version. It outlives itself: it reaches a support request, a release note and a store listing, each describing a build nobody can identify.

## Consequences

Local and pull-request CI builds show `0.0.0-dev+g<commit>`, usually with `.dirty`. No build outside a signed tag is a release. `package.json` carries no `version` field, since it would be a second place naming a release.

**Source archives need the version told to them.** An extracted tarball has no tags, so `ENGENDER_VERSION` is the route, and it is how the Android build and release-notes step receive the value. The override is the one hole in "the tag is the source", and it is deliberate: the web build honors it unchecked, so `ENGENDER_VERSION=2.0.0 npm run build` on an untagged tree does claim 2.0.0. Validating its shape would not close that, since a well-formed wrong version is the failure that matters. The guard is where it is set: only the release pipeline sets it, from the tag, inside the protected release environment.

**On a release, the build id is the version.** A release has to rebuild from its tag byte for byte, or its checksum says only that the download arrived intact. SvelteKit's build id defaults to the build time and is folded into the entry chunk, so by default two builds of one commit share no bytes. A build handed a release version uses it as the build id too (`svelte.config.js`, guarded by `isReleaseVersion`; `ENGENDER_BUILD_ID` overrides). Development builds keep the timestamp, which is what stops two of them sharing an offline-shell cache (ADR-0021). The shell cache of release 1.2.3 is therefore named after 1.2.3.

The claim is checked: `scripts/package-release.mjs` builds the release twice and refuses to publish unless the two bundles have the same digest. An outsider repeats it from the published source archive with the version supplied; the README has the commands.

History: amended 2026-08-24 (build id is the version on a release); renamed `GENDER_DIARY_VERSION` to `ENGENDER_VERSION` with the app rename (the ADR still said the old name); trimmed 2026-11-02.