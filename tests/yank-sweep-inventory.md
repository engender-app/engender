# Yank sweep inventory

The gesture table in `yank-sweep-core.mjs` is shared by the desktop and
Android runners. Each entry names its route, preparation, control and
route or state postcondition. A missing, hidden, disabled or inert control
is an error. Preparation centers the selected control, and keyboard actions
focus it before capture. Dispatch hit-tests the control center, then viewport-inset points when
part of the target is covered. A scrim can remain usable outside its fan.
A fully covered or offscreen target still fails. Bounds, hit point and hit
identity stay in the action record. Cold-load and injected-proof actions
remain explicit programmatic cases. An unchanged destination or state is also an error. The
report records the requested selector, chosen control and actual outcome.

Theme and palette preparation wait for their actual reset transition and
boot preference mirror before another control is tested. Measurement still
starts after preparation with its existing window.

Both gesture transports use the demo navigation control to mount an
intermediate route, then the requested route. Preparation proves that the
previous screen and intermediate screen detached, the target mounted, and
performance.timeOrigin stayed unchanged. Deep-back scenes use their expected
predecessor as the intermediate route. This resets screen state without
creating a document for every gesture. Journal data stays intact.
Cold recording still reloads the document, retains finite previous and
current document identities, and keeps its camera-before-navigation order
and existing ready-to-sampler window.
The unit-switcher scene enables Measurements through its visible switch when
needed, proves that state, and restores its original visibility after capture.
This exposes the control in an empty journal without adding measurement data.
Preparation closes existing overlays and restores inline edit modes before
opening the state a scene requires. It does not change the recorded motion
window or detector thresholds. Quick add opening, closing, choosing a mood,
opening a backdate and opening its calendar have separate scenes. Setup
steps belong to the empty profile because starting first run clears the
journal. The persona stays intact across both themes. The backup notice
scene restores its demo fixture before every repeat so an earlier dismissal
cannot turn later repeats into missing controls.

The cold-load table covers every rendered route. The route inventory test
checks the current route tree and rejects dead routes or new omissions.
Detail IDs come from the prepared journal's list controls, never invented
IDs. A record missing from the fixture is reported as a skip with its name.
A browser reminder detail is a platform exclusion because the web list
renders an install prompt. Android resolves that record from its own list.

Cold runs record the requested and actual route including query parameters,
theme, boot state and profile. Settings consumes `raise` when opening its
Templates or Modes manager; Home consumes `quickLogDims` when opening the
scale sheet. Those scenes name the consumed parameter and require their
specific visible sheet content at the canonical route. Other query
parameters still have to match. The profile check also reads the journal's
entry-presence cache; persona preparation checks Alice's greeting. Both
themes record onboarding and the PIN gate. The PIN epilogue restores the
persona before capturing it, even when the preceding profile was empty.
PIN setup runs once; each requested theme is applied after setup and route
preparation so those steps cannot reset the preference before capture.

Fresh Android preparation has a ten-minute bound. The observed demo seed
took about five minutes; the former 30-second wait expired during that seed.
The runner polls boot and Home readiness once per second and reports its
state every ten seconds. This bound applies only to setup readiness.
Gesture and cold-load sampling windows remain unchanged.

Each report counts requested, attempted, measured, skipped, failed and
missing runs per profile and theme. A partial report remains explicitly
incomplete and is replaced atomically after each scene. An error or missing
run makes the process fail even without `--gate`. Product yanks remain
findings; only `--gate` treats them as an exit failure. Proof requires every
injected style defect and painted evidence in each proof run.
The synthetic proof samples only its six injected marks so unrelated screen
nodes cannot consume the frame budget. Ordinary scenes still sample the full
tree. Both paths use the same detector, thresholds and measurement window,
and retain their complete compositor cast.

Style findings keep their DOM samples and complete compositor cast. Frame
files carry frame numbers and milliseconds; the metadata keeps absolute
capture timestamps. DOM samples also carry wall timestamps so a style
finding can be compared with the frames that painted it. A mark's node
identity stays fixed while its semantic class or text changes. A replacement
node receives another identity even when its class and text match.

## Boundaries

These runs measure the supported scene table, not every possible user
input. The cold inventory covers screens; it cannot prove every state of
those screens. The report's inventory must accompany any claim of coverage.
The following paths require separate fixtures or platform control:

- Biometric, passphrase, recovery and schema-too-new gates need credentials
  or a journal with that schema. The PIN and onboarding fixtures do not
  represent these gates.
- Camera, microphone, picker and share-system transitions depend on OS
  permission and external surfaces. The browser sweep cannot measure them.
- A real midnight change needs a controlled clock spanning the boundary.
  Navigating to a different day does not reproduce that event.
- Confirmed deletion and save paths need disposable records restored per
  repeat. Opening their confirmation is covered where listed; it does not
  claim coverage of the confirmed write or every row-removal animation.
- Chart drags and body-region switching need gesture fixtures beyond the
  selector-click contract. Cold mounting their routes does not claim those
  interactions were measured.

These omissions are coverage limits, not zero-yank passes or exemptions from
the detector. Existing measurements and thresholds retain their meaning.
