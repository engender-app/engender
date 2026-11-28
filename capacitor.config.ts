/* The Android shell. Capacitor wraps the same static bundle the web release
   serves - `npm run build` writes it to build/ and `cap sync` copies it into
   the APK - so there is no Android-specific application code above the
   driver seam.

   The scheme and hostname matter more than they look. Capacitor serves the
   bundle from https://localhost by default on Android, and that origin is a
   secure context, which is what lets the same code reach WebCrypto and the
   storage APIs it uses on the web. Changing either would move the app to a
   different origin and orphan whatever a previous version stored there. */

import type { CapacitorConfig } from '@capacitor/cli';

/* Hosted web metadata only. Android loads the bundled app at https://localhost
   through server.hostname below; this constant does not set its origin. */
export const JOURNAL_ORIGIN = 'journal.engender.app';

const config: CapacitorConfig = {
  appId: 'dev.engender.app',
  appName: 'engender',
  webDir: 'build',
  android: {
    /* Pinch zoom is a web capability. The
       bridge maps this to setBuiltInZoomControls(false), the WebView
       setting pinch input actually answers to, so two-finger gestures
       stay with the app's own surfaces (photo wipe, timeline drag) rather
       than zooming the page behind them. Written out rather than left to
       the library default because app.html now allows zoom for the web
       release, and the split is the decision, not an accident. */
    zoomEnabled: false,
    /* The journal is opened by the native driver over SQLCipher, not by the
       WebView, so nothing here needs a mixed-content or cleartext exception. */
    allowMixedContent: false,
    /* Android updates its WebView separately from the OS, so the API level
       does not tell you what the app is running in. This is the number that
       decides whether it runs at all.

       Navigation reads computed translate and scale, available from 104.
       Shared door selectors also need :is() and complex :not() from 88.
       Vite derives its Chromium syntax target from this same value;
       webview-floor.test.ts checks runtime APIs, CSS reads and selectors. */
    minWebViewVersion: 104
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
  /* CSS reads env(safe-area-inset-*). Native handling keeps older WebViews
     padded without injecting unused CSS variables during document creation. */
  plugins: {
    SystemBars: {
      insetsHandling: 'native'
    }
  },
  /* Every plugin call's arguments are logged, in full, before the call runs:
     Bridge.callPluginMethod hands `call.getData().toString()` to
     Logger.verbose, and Logger's only gate is this setting, whose default
     ("debug") means "log whenever the build is debuggable". Release builds
     are not, so nothing shipped ever logged any of it - but the road those
     arguments travel is the same road the journal's raw data key takes on
     every open (SqlitePlugin's `hexKey`), and the archive password, and
     every value written to every row, and the recovery key. A debug build
     on a phone put all of that in logcat, where
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
     <access origin="*" />, a Cordova-compat leftover no plugin here reads. An empty list omits the tag. */
  cordova: {
    accessOrigins: []
  }
};

export default config;
