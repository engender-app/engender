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
