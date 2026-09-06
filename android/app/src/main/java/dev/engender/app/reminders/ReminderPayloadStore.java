package dev.engender.app.reminders;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The reminder payload on disk (audit finding G-02): every reminder's
 * title and time, the check-in affirmation pool, the
 * hide-titles preference and the epoch day of the latest entry, wrapped under
 * a Keystore AES-GCM key instead of written as a JSON string anyone holding
 * the app's directory can read.
 *
 * <p><b>Why not the data key.</b> The alarm receiver has to name the person's
 * own reminder while the journal is locked - that is what the payload is for -
 * so it cannot be under the key that unlocking mints. This key asks for
 * nothing: {@code setUserAuthenticationRequired(false)}, usable by app code in
 * this process with no prompt. What it buys is that a copy of the directory is
 * no longer enough. The ciphertext is only readable on the device whose
 * keystore holds the alias, and the alias cannot be copied out of it.
 *
 * <p><b>Nothing is left outside the wrap.</b> The scheduler needs the reminder
 * rules before it can compute a fire time, and it can decrypt to get them, so
 * there is no field the receiver must read first. The launch route beside this
 * one stays plaintext: it is a route and a reminder id, never a title.
 *
 * <p>The same shape as {@code AutoExportPlugin}'s {@code PasswordStore}, and
 * deliberately its own copy of it rather than a shared helper: each store
 * owning its own alias is what lets {@code DeviceStores} stay a list of
 * owners rather than a list of key names, and it means neither reset can take
 * the other's key with it by accident.
 */
public final class ReminderPayloadStore {

    /** The Keystore entry. Named for the app, since the keystore is shared. */
    public static final String ALIAS = "engender-reminders-payload";

    /** The wrapped payload, and the nonce it was wrapped under. Named
        rather than private because the test that reads the file's bytes has
        to know what it is looking at, and a copy spelled out there would
        keep passing after this moved. */
    static final String KEY_CIPHERTEXT = "payload-v2";
    private static final String KEY_NONCE = "payload-v2-nonce";

    /** What builds before this ticket wrote: the same JSON, in the clear. */
    static final String KEY_LEGACY_PLAINTEXT = "payload-v1";

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private ReminderPayloadStore() {}

    static void write(Context context, JSONObject payload) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] ciphertext = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));

        /* commit rather than apply: this write is also the one that takes
           an older build's plaintext off disk, and apply returns before the
           file does. The payload is a few hundred bytes and this runs once
           per sync, so there is nothing to gain by queueing it. */
        prefs(context).edit()
            .putString(KEY_NONCE, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString(KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .remove(KEY_LEGACY_PLAINTEXT)
            .commit();
    }

    /**
     * The payload, or null when there is none to read.
     *
     * <p>Null also covers every way the read can fail - a payload that will
     * not parse, a ciphertext whose alias has gone, a tag that does not check
     * out - because they are one thing to every caller: there are no rules to
     * schedule and no notification to post. That is what a missing payload
     * already meant before this ticket.
     */
    static JSONObject read(Context context) {
        SharedPreferences prefs = prefs(context);
        String nonce = prefs.getString(KEY_NONCE, null);
        String ciphertext = prefs.getString(KEY_CIPHERTEXT, null);
        if (nonce != null && ciphertext != null) return parse(decrypt(nonce, ciphertext));
        return readLegacy(context, prefs);
    }

    /**
     * A payload an older build left in the clear: read once, rewrapped, and
     * the plaintext removed. Nobody loses their reminders to this ticket.
     *
     * <p>If the rewrap throws, the plaintext stays and the payload is still
     * returned. A device whose keystore will not mint a key is a device where
     * removing the only copy would silently drop somebody's reminders, and
     * this leaves it no worse off than the build that wrote it. A payload that
     * will not parse is removed either way: it schedules nothing, so all it
     * can still do is read as a title.
     */
    private static JSONObject readLegacy(Context context, SharedPreferences prefs) {
        String raw = prefs.getString(KEY_LEGACY_PLAINTEXT, null);
        if (raw == null || raw.isBlank()) return null;

        JSONObject payload = parse(raw);
        if (payload == null) {
            prefs.edit().remove(KEY_LEGACY_PLAINTEXT).commit();
            return null;
        }

        try {
            write(context, payload);
        } catch (Exception ignored) {
            // Left in the clear rather than dropped; see above.
        }
        return payload;
    }

    /** Static, and no context: the wrapping key outlives the ciphertext, so
        the reset has to reach it after the preference file holding the
        payload is already gone. */
    static void deleteKey() throws Exception {
        KeyStore keyStore = keystore();
        if (keyStore.containsAlias(ALIAS)) keyStore.deleteEntry(ALIAS);
    }

    private static boolean aliasExists() throws Exception {
        return keystore().containsAlias(ALIAS);
    }

    /* Reading never mints a key. key() creates one when the alias is
       absent, which on this path would mean answering "the key is gone"
       with a fresh key that cannot open the stored ciphertext - the same
       null in the end, by way of a GCM tag failure and a keystore entry
       nothing can use. */
    private static String decrypt(String nonce, String ciphertext) {
        try {
            if (!aliasExists()) return null;
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(nonce, Base64.DEFAULT)));
            return new String(cipher.doFinal(Base64.decode(ciphertext, Base64.DEFAULT)), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static JSONObject parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static SecretKey key() throws Exception {
        SecretKey existing = (SecretKey) keystore().getKey(ALIAS, null);
        if (existing != null) return existing;

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        keyGenerator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        return keyGenerator.generateKey();
    }

    private static KeyStore keystore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        return keyStore;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
    }
}
