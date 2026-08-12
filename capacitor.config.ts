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
  appName: 'Gender Diary',
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
  }
};

export default config;
