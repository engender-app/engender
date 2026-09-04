/* The Android shell (ticket 11). Capacitor wraps the same static bundle the
   web release serves - `npm run build` writes it to build/ and `cap sync`
   copies it into the APK - so there is no Android-specific application code
   above the driver seam (ADR-0017).

   The scheme and hostname matter more than they look. Capacitor serves the
   bundle from https://localhost by default on Android, and that origin is a
   secure context, which is what lets the same code reach WebCrypto and the
   storage APIs it uses on the web. Changing either would move the app to a
   different origin and orphan whatever a previous version stored there. */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.barankiewicz.genderdiary',
  appName: 'enGender',
  webDir: 'build',
  android: {
    /* The journal is opened by the native driver over SQLCipher, not by the
       WebView, so nothing here needs a mixed-content or cleartext exception. */
    allowMixedContent: false,
    /* Android updates its WebView separately from the OS, so the API level
       does not tell you what the app is running in (ADR-0023). This is the
       number that decides whether it runs at all.

       87 is where Vite compiles the bundle to - its default module target -
       so below it the app is syntax the WebView cannot parse. Everything the
       app needs at runtime is at or under that: OPFS at 86, Object.fromEntries
       at 73. The one call that was above it, Object.hasOwn at 93, was
       replaced in prefs/catalogue.ts rather than allowed to set the floor
       six versions higher than the bundle needed. */
    minWebViewVersion: 87
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    /* What a device below that floor sees. Without this, Capacitor logs the
       failure and loads the app anyway, which is a blank screen and a
       SyntaxError in a log nobody holding a phone can read - measured on the
       API 26 emulator, whose WebView is Chrome 69. */
    errorPath: 'webview-too-old.html'
  },
  /* Every plugin call's arguments are logged, in full, before the call runs:
     Bridge.callPluginMethod hands `call.getData().toString()` to
     Logger.verbose, and Logger's only gate is this setting, whose default
     ("debug") means "log whenever the build is debuggable". Release builds
     are not, so nothing shipped ever logged any of it - but the road those
     arguments travel is the same road the journal's raw data key takes on
     every open (SqlitePlugin's `hexKey`), and the archive password, and
     every value written to every row, and since phase 8 audit ticket 09 the
     recovery key. A debug build on a phone put all of that in logcat, where
     anything with the READ_LOGS permission or an adb cable could read it.

     "none" turns Capacitor's own logging off in every build instead of only
     in the ones that ship. What it costs is that JS console output no longer
     reaches logcat either, since Capacitor routes onConsoleMessage through
     the same Logger: a debug build still answers the WebView's devtools
     socket over adb, which is where a console message is worth reading
     anyway. Our own plugins never call Logger, so nothing else here goes
     quiet. */
  loggingBehavior: 'none',
  /* Left unset, `cap sync` writes res/xml/config.xml with a wildcard
     <access origin="*" />, a Cordova-compat leftover no plugin here reads
     (phase 5 security ticket 07, G-07). Empty skips the tag instead of
     narrowing it, since nothing needs it at all. */
  cordova: {
    accessOrigins: []
  }
};

export default config;
