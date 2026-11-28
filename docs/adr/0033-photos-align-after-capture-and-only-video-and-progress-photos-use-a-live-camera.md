# Photo alignment is a post-capture review, and only video notes and progress photos get a live camera surface

Status: Accepted
Decided: 2026-09-03
Last reviewed: 2026-11-26
Supersedes: ADR-0034 (merged in), ADR-0104 (merged in)

Still photos are captured by the OS camera app: an implicit intent on Android
and a `capture` hint on the web file input (`src/lib/data/photos/picker.ts`).
Aligning a new shot with an earlier one happens after capture. A review screen
overlays the new shot on a reference photo at adjustable opacity before either
is stored, and a retake re-invokes the same native camera. The app builds no
live camera preview for ordinary photos. Two things are the exception: a video
note, which records in the entry editor through `getUserMedia` and
`MediaRecorder`, up to 30 seconds, with the live stream shown while it records;
and a progress photo, which is taken in an in-app camera with the last shot in
the same pose laid faintly over the live picture.

## Why ordinary photos have no live surface

A translucent overlay on a live feed is a custom camera surface: a
`getUserMedia` view on web and a native camera view on Android. That is a
platform commitment well beyond what alignment needs, and it breaks the pattern
every other device capability follows, which is delegating to the native
picker. The review screen gives the outcome a person wants from "line up with
the last shot" (look at the new photo against the old one, retake if it is off)
for a slider and two decoded bitmaps, identically on both platforms.

## Why video differs

No OS surface returns a 30-second clip under this app's size caps
(`src/lib/data/videoNotes/limits.ts`). An `ACTION_VIDEO_CAPTURE` intent hands
back whatever length and resolution the camera app is set to, which is what the
caps exist to prevent. Capture also takes time, so there is no moment after the
shutter to review: the person performs for half a minute and must see what is
being recorded. Recording blind is not usable.

## Why progress photos differ

For a posed body shot the review does not give the same outcome. Lining up
after the fact means retaking through the OS camera until the review looks
right, with the ghost nowhere in sight while posing. The preview infrastructure
already exists for video notes, on both platforms, and the camera permission is
already declared. Progress photos (`/transition/progress-photos`) open an
in-app camera through `getUserMedia`, without the microphone
(`src/lib/stores/progressCamera.ts`,
`src/lib/components/ProgressCamera.svelte`). The newest shot in the chosen pose
sits over the picture at 40% opacity. The shot is one video frame drawn to a
canvas, cropped to the 3:4 the preview shows, then normalized like any picked
photo, so the stored file is what was lined up and carries no camera metadata.

Neither the preview nor the stored shot is mirrored, for either camera. A
preview that mirrored the front camera would have to mirror the ghost with it,
and switching cameras would flip the ghost in one frame. Where `getUserMedia`
fails (no camera, permission refused, no API) the sheet says so and offers the
OS camera or a file, stored without a ghost and without the post-capture
review.

## What the review does and does not do

Nothing about the review is stored. The composite is drawn client-side from the
new shot's bytes and the reference photo's bytes, and both the slider position
and the decoded reference are discarded when the photo is accepted. A rejected
retake leaves nothing behind.

The reference photo is not a cross-area concept. Each calling screen knows what
"the last photo of this context" means for its data and hands the review a
callback resolving to a `ReferencePhoto` (`stores/photoPicking.ts`) through
`photoReview()` (`stores/photoReview.svelte.ts`), which holds the shared
capture, review, accept and cancel state machine. A screen that never calls
`photoReview()` gets no review. The review compares against one reference,
right after a capture. It is not the compare screen
(`src/lib/data/photos/compare-state.ts`), which picks any two stored photos
after the fact. The two share no code.

## Video, specifically

The preview is the capture stream bound to a muted `<video>` in the entry
editor, mirrored horizontally so a person framing their face does not see it
move the wrong way. The mirroring is presentation only: the stored file is
never flipped, and the preview is not part of the recording.

The manifest declares `CAMERA`. Capacitor's own `BridgeWebChromeClient` maps the
WebView's video-capture request to it, so there is no native bridge, the same
as `RECORD_AUDIO` for voice. The camera, autofocus and microphone
`<uses-feature>` lines are all `required="false"`, so a device without a camera
still installs and runs the rest of the journal. The web build needs a secure
context for `getUserMedia`, which it has (ADR-0019 and `androidScheme: 'https'`
in `capacitor.config.ts`).

## Consequences

Any other still photo that wants pose detection, a grid burned into a live
feed, or anything that must see the world before the shutter has to reopen this
decision. Pointing at the video preview or the progress camera does not inherit
it, because each exists for a reason other stills do not share.

The in-app progress camera is a plain WebView stream at whatever resolution the
device offers under the 1920 ideal, with none of the OS camera's processing
(HDR, night mode). For a shot taken in the same spot each time that is
acceptable, and it is why the OS camera stays the fallback rather than being
removed.

Both recorders stop every track when a capture ends or is aborted
(`stores/videoRecording.ts`). A camera must never stay live behind a screen the
person has left, which is the same obligation voice recording carries for the
microphone.

History: decided 2026-09-03; video exception and camera permission added by ADR-0034
(2026-09-03), merged in 2026-11-02; progress-photo camera added by ADR-0104
(decided 2026-11-04), merged in 2026-11-26.
