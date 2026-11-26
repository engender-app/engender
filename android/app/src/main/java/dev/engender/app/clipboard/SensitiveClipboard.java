package dev.engender.app.clipboard;

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
import android.provider.Settings;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A clipboard copy that hides itself and then takes itself back.
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

    /** Named rather than private for the same reason as LockTimingPlugin.PREFS:
        the reset's test has to name the file it claims to have cleared. */
    public static final String PREFS = "engender-sensitive-clipboard";

    /** SHA-256 of what we last put on the clipboard, base64. */
    private static final String KEY_DIGEST = "digest";

    /** When the clear is due, on the clock that keeps counting while the
        phone sleeps. uptimeMillis - which is what postDelayed counts in -
        stops during deep sleep, so a phone left in a pocket would hold the
        key well past the minute the copy promises. The posted callback is
        still the ordinary trigger; this is what decides whether it is time. */
    private static final String KEY_DUE_AT = "dueAtRealtime";

    /** An elapsed-realtime deadline from an earlier boot is already due. */
    private static final String KEY_BOOT_COUNT = "bootCount";

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
            .putInt(KEY_BOOT_COUNT, bootCount(context))
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
        boolean sameBoot = prefs(context).getInt(KEY_BOOT_COUNT, -1) == bootCount(context);
        if (sameBoot && SystemClock.elapsedRealtime() < prefs(context).getLong(KEY_DUE_AT, 0)) return;

        ClipboardManager clipboard = clipboardOf(context);
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null) {
            /* Either the read was refused for want of focus or the clipboard
               is genuinely empty. Both are answered by waiting: an empty
               clipboard holds no key, and a refused read will be allowed the
               next time the app is in front. */
            return;
        }

        if (!clearIfOurs(context, digest, clip)) {
            // Somebody has copied something since. It is not ours to clear.
            forget(context);
            return;
        }
        forget(context);
    }

    /** Clears the clipboard when {@code clip} is what {@link #copy} put
        there. False when it is something else, which is left untouched. */
    private static boolean clearIfOurs(Context context, String digest, ClipData clip) {
        CharSequence onClipboard = clip.getItemCount() == 0 ? null : clip.getItemAt(0).getText();
        if (!isWhatWeCopied(Base64.decode(digest, Base64.NO_WRAP), onClipboard)) return false;

        ClipboardManager clipboard = clipboardOf(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            clipboard.clearPrimaryClip();
        } else {
            // API 26 and 27 have no clearPrimaryClip. An empty clip is the
            // closest thing, and it replaces the key either way.
            clipboard.setPrimaryClip(sensitiveClip(""));
        }
        return true;
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
        cancelArmedClear();
    }

    private static void cancelArmedClear() {
        if (armedClear != null) {
            new Handler(Looper.getMainLooper()).removeCallbacks(armedClear);
            armedClear = null;
        }
    }

    /** The reset path. The recovery key may still be on the clipboard, and
        what is stored here is the only way to tell it from something copied
        since, so it is used before it goes: the clipboard is cleared if it
        still holds the key, left alone if it holds anything else, and then
        the record and the armed timer are dropped. Reset runs with the app
        in front, which is what lets Android answer the clipboard read. Without
        focus the read is refused, nothing is cleared and nothing is guessed.

        Runs on the main thread like everything else here; a caller on
        another thread waits for it. */
    public static void wipe(Context context) {
        Context appContext = context.getApplicationContext() != null ? context.getApplicationContext() : context;
        try {
            onMainThread(() -> {
                String digest = prefs(appContext).getString(KEY_DIGEST, null);
                if (digest == null) return;
                ClipData clip = clipboardOf(appContext).getPrimaryClip();
                if (clip != null) clearIfOurs(appContext, digest, clip);
            });
        } finally {
            /* Whatever the read did, the record and the timer go: a reset
               that throws here must not leave the digest behind. */
            prefs(appContext).edit().clear().commit();
            cancelArmedClear();
        }
    }

    private static void onMainThread(Runnable work) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            work.run();
            return;
        }
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<RuntimeException> failure = new AtomicReference<>();
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                work.run();
            } catch (RuntimeException e) {
                failure.set(e);
            } finally {
                done.countDown();
            }
        });
        try {
            if (!done.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("the clipboard wipe did not run");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while wiping the clipboard", e);
        }
        if (failure.get() != null) throw failure.get();
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

    private static int bootCount(Context context) {
        return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 0);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
