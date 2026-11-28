package dev.engender.app.disguise;

import android.content.Context;
import android.webkit.JavascriptInterface;

/**
 * Hands the live disguise state to the page, synchronously, before any
 * script runs. The disguise preference reaches the WebView's localStorage
 * boot mirror only after Chromium's delayed flush, and the flip kills the
 * process ({@link DisguisePlugin}) well inside that window, so the first
 * cold start after a flip used to read the old mirror: the real lock screen
 * after turning disguise on, "Notes" after turning it off. The alias is
 * written to PackageManager before the kill, so it is the one source that is
 * right on the very next start, whatever ended the process.
 *
 * Read by src/app.html (first frame) and boot-cache.ts (the lock screen),
 * as {@code window.androidDisguiseState.isDisguised()}.
 */
public final class DisguiseState {
    public static final String INTERFACE_NAME = "androidDisguiseState";

    private final Context context;

    public DisguiseState(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public boolean isDisguised() {
        return DisguiseAlias.isDisguised(context);
    }
}
