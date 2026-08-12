# The public version name comes from a signed tag

One value names a release, and `scripts/app-version.mjs` is the only place it is
worked out. A signed `v<semver>` tag pointing at HEAD, on a tree with no edits
and no untracked files, gives the public version name. Everything else builds as
`0.0.0-dev` followed by the commit it came from, `.dirty` when the tree had been
touched, and `unknown` where there is no checkout to read at all.

The build injects that string as a literal, the About screen shows the literal,
and the release pipeline passes the same string to the release notes and the
Android artifacts through `GENDER_DIARY_VERSION` rather than having each of them
ask git a slightly differently worded question.

This is the public version name, the one a person reads and quotes. It is not
the build id ADR-0021 keys the offline shell cache to, which is SvelteKit's own
and changes on every build whether or not the release did. Two values, one word;
only this one is ever shown to anyone.

## Why

Four things name a release - the built bundle, the About screen, the release
notes and the Android artifacts - and a version written down in four places is a
version that will disagree with itself. The tag is the one fact that already
exists at release time and is already the thing being released.

Requiring a signature keeps a local `git tag v1.0.0` from minting a release name.
Whether the signature verifies is a different question, answered where the public
key is (ticket 18); what is checked here is that the tag object carries one at
all, which is what distinguishes a deliberate release tag from a bookmark.

Refusing an edited tree matters more than it looks. The tag names a commit, and
untracked files reach the build - anything dropped into `static/` is copied into
the release verbatim - so a build from a dirty tree is not the tagged contents
however the tag was made.

The failure being designed against is a build that quietly claims a release
version. That mistake outlives itself: it reaches a support request, a release
note and a store listing, and each of those then describes a build nobody can
identify. A development version that says which commit it came from is worse
looking and better in every way that matters.

## Consequences

Local builds and CI builds of pull requests all show `0.0.0-dev+g<commit>`,
usually with `.dirty`, because a working tree in use is rarely clean. That is the
intended reading: no build outside a signed tag is a release.

`package.json` carries no `version` field. It would be a second place naming a
release, and it is the one people reach for out of habit.

A release therefore cannot be built from a source archive without being told its
version, since an extracted tarball has no tags. `GENDER_DIARY_VERSION` is that
route, and it is also how the Android build and the release-notes step receive
the value instead of re-deriving it.

That override is the one hole in "the tag is the source", and it is deliberate.
It is honoured by the web build too, unchecked and unconditionally, so
`GENDER_DIARY_VERSION=2.0.0 npm run build` on an untagged tree does produce a
bundle claiming 2.0.0. Validating its shape would not close that - a
well-formed wrong version is the failure worth worrying about - so the guard is
where the variable is set rather than where it is read: only the release
pipeline sets it, from the tag, inside the protected release environment. What
the rule prevents is a version claimed by accident. A version claimed on purpose
by whoever holds the release credentials is the pipeline working.

## Amendment (ticket 06): on a release, the build id is the version

The sentence above about two values is now true of development builds only. A
release has to be rebuildable from its tag byte for byte, or the checksum beside
it says nothing more than that the download arrived intact - and SvelteKit's
build id defaults to the time of the build and is folded into the entry chunk,
so it changes every chunk hash. Two builds of one commit shared no bytes at all.

So a build handed a release version uses it as the build id too
(`svelte.config.js`, guarded by `isReleaseVersion`). Development builds keep the
timestamp, where changing on every build is the useful behaviour: it is what
stops two of them sharing an offline-shell cache (ADR-0021). Only the public
version name is still ever shown to anyone; what changed is that on a release
the two values are equal, which incidentally gives ADR-0021's "one cache per
release" its name back - the shell cache of 1.2.3 is called after 1.2.3.

The claim is checked rather than written down: `scripts/package-release.mjs`
builds the release twice and refuses to publish unless the two bundles have the
same digest. Someone outside the pipeline repeats it from the published source
archive, where `GENDER_DIARY_VERSION` is not a convenience but the only way in -
an extracted tarball has no tag to read, and without the version the build id
falls back to the clock and every chunk hash moves. The README has the exact
commands, and they were run: the archive of 0.0.1 rebuilt its bundle byte for
byte outside the repository, with no `.git` anywhere.
