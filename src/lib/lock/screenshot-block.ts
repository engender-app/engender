/* What the Security row's switch shows and writes (tester report 02,
   ticket 02).

   The row is a blocker a person switches on, and it is off on a fresh
   install. The stored preference keeps its older direction,
   `allowScreenCapture`, because the native mirror and every saved journal
   already speak it: a device that had capture blocked holds `false`, and
   must come back with the switch on. So the row reads and writes the
   preference through these two, and nothing else turns it round. */

type CaptureChoice = { allowScreenCapture: boolean };

export function screenshotsBlocked(prefs: CaptureChoice): boolean {
  return !prefs.allowScreenCapture;
}

export function setScreenshotsBlocked(prefs: CaptureChoice, blocked: boolean): void {
  prefs.allowScreenCapture = !blocked;
}
