package dev.barankiewicz.genderdiary.clipboard;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.util.Base64;

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
 *   <li>the clip is marked sensitive, which asks the keyboard to keep the
 *       value out of its history and out of the paste preview;</li>
 *   <li>the clipboard is cleared again after the interval the caller states,
 *       and the screen's copy names that interval so the person knows how
 *       long they have to paste.</li>
 * </ul>
 *
 * The clear refuses to wipe something the person copied afterwards, so it
 * only fires while the clipboard still holds what we put there. What is kept
 * to decide that is a SHA-256 of the value rather than the value: once
 * setPrimaryClip has returned, nothing in this process and nothing on this
 * disk holds the characters, so neither a heap dump taken while the timer is
 * still running nor the preference file below has anything in it to find.
 * Nothing here is logged, and there is no read method - see the plugin.
 *
 * That pending clear is written down rather than held in memory, and the
 * reason is the ordinary path rather than a corner case: the person copies
 * the key, leaves for their password manager, and Android is free to kill
 * this process while they are gone. A clear that lived only in a static
 * field would die with it and leave the key on the clipboard for good, while
 * the screen's copy promises it goes. So the record outlives the process,
 * and the plugin asks again when the app is next loaded as well as at every
 * resume.
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
     * constant was public, and a device whose keyboard honours neither is no
     * worse off than it was - which is why the screen's copy says the flag is
     * asked for rather than that the history is empty.
     */
    private static final String EXTRA_IS_SENSITIVE = ClipDescription.EXTRA_IS_SENSITIVE;

    /**
     * The clip carries no label. A label is shown in some paste UIs beside
     * the value, and there is nothing to gain from naming what this one is.
     */
    private static final String NO_LABEL = "";

    /** Named rather than private for the same reason as QuickExitPlugin.PREFS:
        the reset's test has to name the file it claims to have cleared. */
    public static final String PREFS = "gender-diary-sensitive-clipboard";

    /** SHA-256 of what we last put on the clipboard, base64. */
    private static final String KEY_DIGEST = "digest";

    /** When the clear is due, on the clock that keeps counting while the
        phone sleeps. uptimeMillis - which is what postDelayed counts in -
        stops during deep sleep, so a phone left in a pocket would hold the
        key well past the minute the copy promises. The posted callback is
        still the ordinary trigger; this is what decides whether it is time. */
    private static final String KEY_DUE_AT = "dueAtRealtime";

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

        prefs(context)
            .edit()
            .putString(KEY_DIGEST, Base64.encodeToString(digest(value), Base64.NO_WRAP))
            .putLong(KEY_DUE_AT, SystemClock.elapsedRealtime() + clearAfterMs)
            .apply();

        Handler handler = new Handler(Looper.getMainLooper());
        if (armedClear != null) handler.removeCallbacks(armedClear);
        Context appContext = context.getApplicationContext();
        armedClear = () -> clearIfDue(appContext);
        handler.postDelayed(armedClear, clearAfterMs);
    }

    /**
     * Clears the clipboard if the interval is up and it still holds what
     * {@link #copy} put there. Called by the timer, when the plugin loads,
     * and again whenever the app is resumed, because the timer can fire at a
     * moment when the answer cannot be had: from Android 10 the clipboard is
     * readable only by an app that has focus, so a timer that fires while the
     * person is in their password manager reads nothing and has to wait until
     * they are back. That is the ordinary path, not a corner case - pasting
     * the key elsewhere is what Copy is for.
     */
    public static void clearIfDue(Context context) {
        String digest = prefs(context).getString(KEY_DIGEST, null);
        if (digest == null) return;
        if (SystemClock.elapsedRealtime() < prefs(context).getLong(KEY_DUE_AT, 0)) return;

        ClipboardManager clipboard = clipboardOf(context);
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null) {
            /* Either the read was refused for want of focus or the clipboard
               is genuinely empty. Both are answered by waiting: an empty
               clipboard holds no key, and a refused read will be allowed the
               next time the app is in front. */
            return;
        }

        CharSequence onClipboard = clip.getItemCount() == 0 ? null : clip.getItemAt(0).getText();
        if (!isWhatWeCopied(Base64.decode(digest, Base64.NO_WRAP), onClipboard)) {
            // Somebody has copied something since. It is not ours to clear.
            forget(context);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            clipboard.clearPrimaryClip();
        } else {
            // API 26 and 27 have no clearPrimaryClip. An empty clip is the
            // closest thing, and it replaces the key either way.
            clipboard.setPrimaryClip(sensitiveClip(""));
        }
        forget(context);
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

    /** Drops the pending clear, having done it or found it was not ours. */
    static void forget(Context context) {
        prefs(context).edit().clear().apply();
        if (armedClear != null) {
            new Handler(Looper.getMainLooper()).removeCallbacks(armedClear);
            armedClear = null;
        }
    }

    /** The reset path (ADR-0014). What is here is a digest of something that
        may still be on the clipboard, which is not the journal but is a
        record the reset claims to have left nothing of. */
    public static void wipe(Context context) {
        prefs(context).edit().clear().commit();
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

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
