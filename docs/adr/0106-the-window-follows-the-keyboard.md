# The window follows the keyboard on every frame

Status: Accepted
Decided: 2026-11-13
Last reviewed: 2026-11-26
Amends: the motion rule that the keyboard moves the window, and the rule that the step back is scrubbed by the gesture

On a Pixel 10a, focusing the note on a new entry's second step made
"Save entry" jump 335.6 px in one frame, and jump back when the keyboard
closed. The app is edge-to-edge (targetSdk 36), so Android does not resize
the window for the keyboard itself. Capacitor's SystemBars listener pads the
decor view's bottom by the keyboard's height, and the WebView inside it
shrinks by that much. Window insets are applied once per keyboard change, at
the end state, so the padding, and with it the page's height (923 to 564 css
px), changed in a single frame while the keyboard itself slid for about
250 ms. For up to six frames before the jump the rising keyboard covered the
button.

## Decision

The window's bottom edge rides on the keyboard. A
`WindowInsetsAnimationCompat.Callback` on the decor view
(`android/.../chrome/KeyboardFollow.java`) lets the end-state padding land,
puts the padding back to where it was before the first frame is drawn, and
moves it from there to the end on each frame of the keyboard's animation by
the animation's own interpolated fraction. The WebView resizes with it, so
every pinned control and the focused field follow the window the way they do
on any resize. Nothing in the page knows about it, and what the padding ends
at is still Capacitor's decision.

It is app-wide: every screen with a field gets the same behaviour, because
the resize is the platform's and not one screen's. It runs on Android 11
(API 30) and later, where the platform reports the keyboard's real movement.
Below that, and with system animations off, the window resizes in one step
as it did before, which is also what the keyboard does there.

## Considered

- A CSS variable for the keyboard's height, sent to the page on every frame,
  with the WebView left at full height. The page would then own the resize
  on every screen: each pinned control, sheet and focused field would need
  to read the variable, and the browser's own scroll of a focused field into
  view, which runs on a resize, would stop. Each frame's value would also
  arrive a frame late across the bridge.
- `interactive-widget` and the VirtualKeyboard API. Chromium's
  intent-to-ship for the keyboard resizing the visual viewport says WebView
  is unchanged, sized by its app, and `overlaysContent` would hand the page
  the same work as the variable above.
- `android.window.PROPERTY_COMPAT_ALLOW_SYNCHRONIZED_INSETS_ANIMATION`, which
  does this for apps with no callback of their own, starts at API 37.2, and
  Capacitor's listener sets the padding by hand rather than through
  `adjustResize`, so it would not reach the WebView anyway.

## Consequences

The WebView relayouts on each frame of a keyboard's movement, about 30 times
in 250 ms on a 120 Hz phone.
