# 14 - Produce a playable photo timelapse

Status: ready-for-agent
Size: L
Model: gpt-6.1-sol
Type: bug
Blocked by: None
UI: yes

## What to build

The photo export screen reports that it made a timelapse, then shows a black player with a 0:00 duration that cannot play. Reproduce the failure and fix the generated video or its preview, whichever fails. Collage export already works and must keep working.

## Acceptance

- [ ] A supported device generates a timelapse from two or more chosen photos. Its preview plays and reports a nonzero duration.
- [ ] The saved or shared file also plays outside the preview. A failed encode or unsupported browser reports a clear error instead of a false success.
- [ ] Verify photo order, cancellation, repeat generation and collage export. Record tested browser and Android versions.

Source: 11 October recording at 18:42.
