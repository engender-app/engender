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
       does not tell you what the app is running in. API 26 is the spec's
       floor and the emulator image for it ships Chrome 69, from 2018, which
       has no OPFS - the app stores its photos there and cannot work without
       it. OPFS arrived in Chrome 86, so that is the honest floor.

       Declaring it means an under-spec WebView gets Capacitor's "update
       your WebView" screen. Without it the same device gets a blank page
       and a SyntaxError in a log nobody on a phone can read, which is what
       ticket 11 found when it first launched on API 26. */
    minWebViewVersion: 86
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost'
  }
};

export default config;
