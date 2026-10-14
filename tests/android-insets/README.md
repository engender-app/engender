# Android inset matrix

This opt-in probe visits the real Home screen, entry editor and template sheet
in an isolated demo APK. It uses Android navigation overlays, display-cutout
overlays, rotation and the actual keyboard. It does not replace CSS inset tokens.
Each API has 60 captures, including the sheet at its start and scrolled to its
last action. The required matrix is API 33, 35 and 36, gesture and three-button navigation,
trans light/dark, plain portrait, cutout portrait and cutout landscape.

Build the same native shell with a separate application ID:

```sh
VITE_DEMO=1 npm run build
npx cap sync android
JAVA_HOME=/home/developer/.sdkman/candidates/java/21.0.12-tem \
  ./android/gradlew -p android --no-daemon -I ../tests/android-insets/isolate.gradle :app:assembleDebug
```

Use a disposable Google APIs x86_64 AVD named `backend51-api33`,
`backend51-api35` or `backend51-api36`. The probe refuses a physical-device
serial, another AVD name or another package. Install the debug APK on the
explicit emulator serial before running:

```sh
adb -s emulator-5592 install android/app/build/outputs/apk/debug/app-debug.apk
node tests/android-insets/run.mjs emulator-5592 .claude/android-insets/api33
```

The host needs ImageMagick for screenshot crops and unzip for APK identity.
The APK must embed the current checkout commit in its development version;
a stale APK fails before the probe changes device settings. The probe keeps screenshots,
top/bottom crops, an IME-boundary crop, native WebView bounds, DOM control bounds, window inset sources
and IME visibility in the output directory. It writes each case before its
assertions so failures retain their evidence. The driver restores navigation,
cutout and rotation settings and removes its own CDP forward in `finally`.
It restarts its isolated app and reconnects after each native configuration,
because changing a cutout overlay can recreate the activity and WebView.
The caller owns AVD startup/shutdown and must uninstall the isolated package.
Do not run it on an AVD that another task owns.

Geometry helper regressions run in the Node tier. `api35-insets.txt` is the
InsetsState section of an API 35 dump supplied by the runtime owner on
14 October 2026. `api33-insets.txt` records the older source names from the
first API 33 run. `api33-ime-insets.txt` preserves API 33's additional
`visibleFrame` field with the keyboard shown. `api33-landscape-ime-insets.txt` also covers an IME bounded by the display cutout.
These fixtures test parsing, not the screen matrix. `tests/safe-area.test.ts`
continues to check viewport-fit and CSS inset declarations; those checks do not
establish Android window or keyboard behavior. A Play Console notice requires
separate external evidence. This probe cannot establish warning removal or
physical-device frame timing.
