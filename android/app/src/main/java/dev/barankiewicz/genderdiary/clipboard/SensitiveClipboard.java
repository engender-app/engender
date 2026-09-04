package dev.barankiewicz.genderdiary.clipboard;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.SystemClock;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * A clipboard copy that hides itself and then takes itself back (phase 8
 * audit ticket 09).
 *
 * Android's clipboard is not a private buffer. Whatever is on it is offered
 * by the keyboard's own clipboard history to anyone who long-presses in any
 * text field in any app, and shown in the paste preview besides, and nothing
 * ever clears it. For the recovery key that is a complete bypass of the
 * passphrase, the PIN, the biometric, disguise mode, Safe Space and
 * FLAG_SECURE, which is the one thing the screen's own copy tells people not
 * to do with those characters.
 *
 * Two things are done about it here, neither reachable from the web
 * clipboard API, which is why this exists at all:
 *
 * <ul>
 *   <li>the clip is marked sensitive, which keeps the value out of the
 *       keyboard's history and out of the paste preview;</li>
 *   <li>the clipboard is cleared again after the interval the caller states,
 *       and the screen's copy names that interval so the person knows how
 *       long they have to paste.</li>
 * </ul>
 *
 * The clear refuses to wipe something the person copied afterwards, so it
 * only fires while the clipboard still holds what we put there. What is kept
 * to decide that is a SHA-256 of the value rather than the value: once
 * setPrimaryClip has returned, nothing in this process holds the characters,
 * so a heap dump taken while the timer is still running has nothing in it to
 * find. Nothing here is logged, and there is no read method - see the plugin.
 *
 * Everything below runs on the main thread: the plugin marshals the copy
 * there (clipboard writes off it crash on some OEMs), the delayed clear is
 * posted to the main looper, and the resume retry arrives on it. So no
 * locking.
 */
public final class SensitiveClipboard {
    private SensitiveClipboard() {}

    /**
     * ClipDescription.EXTRA_IS_SENSITIVE is API 33. It is a compile-time
     * String constant, so javac inlines its value here and no older device
     * ever looks the field up; Gboard honoured the same string before the
     * constant was public, and a device that honours neither is no worse off
     * than it was.
     */
    private static final String EXTRA_IS_SENSITIVE = ClipDescription.EXTRA_IS_SENSITIVE;

    /**
     * The clip carries no label. A label is shown in some paste UIs beside
     * the value, and there is nothing to gain from naming what this one is.
     */
    private static final String NO_LABEL = "";

    /** SHA-256 of what we last put on the clipboard, or null if nothing is
        owed a clear. */
    private static byte[] pendingDigest;

    /** When that clear is due, on the uptime clock the handler posts against. */
    private static long clearDueAt;

    private static Runnable armedClear;

    /**
     * Puts {@code value} on the clipboard marked sensitive, and arranges for
     * the clipboard to be cleared {@code clearAfterMs} later if it still
     * holds it.
     *
     * @throws IllegalStateException if the device has no clipboard service.
     */
    public static void copy(Context context, String value, long clearAfterMs) {
        ClipboardManager clipboard = clipboardOf(context);

        clipboard.setPrimaryClip(sensitiveClip(value));

        pendingDigest = digest(value);
        clearDueAt = SystemClock.uptimeMillis() + clearAfterMs;

        Handler handler = new Handler(Looper.getMainLooper());
        if (armedClear != null) handler.removeCallbacks(armedClear);
        Context appContext = context.getApplicationContext();
        armedClear = () -> clearIfDue(appContext);
        handler.postDelayed(armedClear, clearAfterMs);
    }

    /**
     * Clears the clipboard if the interval is up and it still holds what
     * {@link #copy} put there. Called by the timer and again whenever the app
     * is resumed, because the timer can fire at a moment when the answer
     * cannot be had: from Android 10 the clipboard is readable only by an app
     * that has focus, so a timer that fires while the person is in their
     * password manager reads nothing and has to wait until they are back.
     * That is the ordinary path, not a corner case - pasting the key
     * elsewhere is what Copy is for.
     */
    public static void clearIfDue(Context context) {
        if (pendingDigest == null) return;
        if (SystemClock.uptimeMillis() < clearDueAt) return;

        ClipboardManager clipboard = clipboardOf(context);
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null) {
            /* Either the read was refused for want of focus or the clipboard
               is genuinely empty. Both are answered by waiting: an empty
               clipboard holds no key, and a refused read will be allowed the
               next time the app is in front. */
            return;
        }

        CharSequence onClipboard =
            clip.getItemCount() == 0 ? null : clip.getItemAt(0).getText();
        if (!isWhatWeCopied(pendingDigest, onClipboard)) {
            // Somebody has copied something since. It is not ours to clear.
            forget();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            clipboard.clearPrimaryClip();
        } else {
            // API 26 and 27 have no clearPrimaryClip. An empty clip is the
            // closest thing, and it replaces the key either way.
            clipboard.setPrimaryClip(sensitiveClip(""));
        }
        forget();
    }

    /** Whether what is on the clipboard is the string {@code digest} was
        taken of. The clip we set has one text item, so its first item is the
        whole question. Package-private, and free of every Android type, so
        the JVM tier can exercise the decision without a device. */
    static boolean isWhatWeCopied(byte[] digest, CharSequence onClipboard) {
        if (onClipboard == null) return false;
        return MessageDigest.isEqual(digest, digest(onClipboard.toString()));
    }

    static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            // Every Android release ships SHA-256.
            throw new IllegalStateException("no SHA-256 on this device", e);
        }
    }

    /** Drops the pending clear. Also the teardown the instrumentation test
        needs, so one test's timer cannot fire during the next. */
    static void forget() {
        pendingDigest = null;
        clearDueAt = 0;
        if (armedClear != null) {
            new Handler(Looper.getMainLooper()).removeCallbacks(armedClear);
            armedClear = null;
        }
    }

    private static ClipData sensitiveClip(String value) {
        ClipData clip = ClipData.newPlainText(NO_LABEL, value);
        PersistableBundle extras = new PersistableBundle();
        extras.putBoolean(EXTRA_IS_SENSITIVE, true);
        clip.getDescription().setExtras(extras);
        return clip;
    }

    private static ClipboardManager clipboardOf(Context context) {
        ClipboardManager clipboard =
            (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) throw new IllegalStateException("this device has no clipboard");
        return clipboard;
    }
}
