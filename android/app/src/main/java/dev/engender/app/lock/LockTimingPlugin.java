package dev.engender.app.lock;

import android.app.Activity;

import dev.engender.app.screencapture.ScreenCapturePlugin;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import dev.engender.app.files.StorageFailure;
import dev.engender.app.keystore.CredentialWrapStore;
import org.json.JSONObject;

/** Mirrors lock timing and owns durable PIN admissions and their waits. */
@CapacitorPlugin(name = "LockTiming")
public class LockTimingPlugin extends Plugin {

    /** The reset test names the file this plugin owns. */
    public static final String PREFS = "engender-lock-timing";
    private static final String KEY_TIMING = "timing";
    private static final String LEGACY_PREFS = "engender-quick-exit";

    @PluginMethod
    public void setTiming(PluginCall call) {
        String timing = call.getString("timing");
        if (!"immediately".equals(timing) && !"one-minute".equals(timing)
            && !"five-minutes".equals(timing) && !"restart".equals(timing)) {
            call.reject("Invalid lock timing");
            return;
        }
        prefs(getContext()).edit().putString(KEY_TIMING, timing).apply();
        getContext().deleteSharedPreferences(LEGACY_PREFS);
        call.resolve();
    }

    /** The page's mirror for the leave cover (LeaveCover, leave-cover.ts). */
    @PluginMethod
    public void setLeaveCover(PluginCall call) {
        LeaveCover.set(Boolean.TRUE.equals(call.getBoolean("cover", false)), call.getString("ground"));
        Activity activity = getActivity();
        if (activity != null) {
            // The Recents preview follows whether a lock is set.
            activity.runOnUiThread(() -> ScreenCapturePlugin.applyWindowFlags(activity));
        }
        call.resolve();
    }

    /** The page has drawn what is under the cover: take it off. */
    @PluginMethod
    public void revealLeaveCover(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof LeaveCoverHost) {
            activity.runOnUiThread(((LeaveCoverHost) activity)::revealLeaveCover);
        } else {
            LeaveCover.reveal();
        }
        call.resolve();
    }

    /** What MainActivity offers, named so the plugin need not import it. */
    public interface LeaveCoverHost {
        void revealLeaveCover();
    }

    @PluginMethod
    public void getPinWait(PluginCall call) {
        String owner = call.getString("owner");
        Integer legacyCount = call.getInt("legacyWrongAttempts");
        Boolean legacyPending = call.getBoolean("legacyPending");
        if (owner != null && (!validIdentity(owner) || legacyCount == null || legacyCount < 0 || legacyPending == null)) {
            call.reject("Invalid PIN accounting adoption");
            return;
        }
        JSObject result = new JSObject();
        try {
            synchronized (PinAttemptWait.class) {
                PinAttemptWait wait = pinWait(getContext());
                if (owner != null) {
                    wait.adopt(legacyCount, legacyPending, SystemClock.elapsedRealtime(), bootCount(getContext()));
                    wait.recover(owner, SystemClock.elapsedRealtime(), bootCount(getContext()));
                }
                result.put("remainingMs", wait.remaining(SystemClock.elapsedRealtime(), bootCount(getContext())));
                result.put("proven", wait.hasState());
                result.put("fullDelayMs", wait.fullDelayMs());
                result.put("wrongAttempts", wait.wrongAttempts());
                result.put("adopted", wait.adopted());
            }
        } catch (IllegalStateException error) {
            rejectStorage(call, error);
            return;
        }
        call.resolve(result);
    }

    @PluginMethod
    public void setPinWait(PluginCall call) {
        Double remainingMs = call.getDouble("remainingMs");
        Double fullDelayMs = call.getDouble("fullDelayMs");
        if (remainingMs == null || !Double.isFinite(remainingMs)
            || remainingMs < 0 || remainingMs > 60_000
            || fullDelayMs == null || !Double.isFinite(fullDelayMs)
            || fullDelayMs < remainingMs || fullDelayMs > 60_000) {
            call.reject("Invalid PIN wait");
            return;
        }
        try {
            synchronized (PinAttemptWait.class) {
                pinWait(getContext()).hold((long) Math.ceil(remainingMs), (long) Math.ceil(fullDelayMs),
                    SystemClock.elapsedRealtime(), bootCount(getContext()));
            }
        } catch (IllegalStateException error) {
            rejectStorage(call, error);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void beginPinAttempt(PluginCall call) {
        String owner = call.getString("owner");
        if (!validIdentity(owner)) { call.reject("Invalid PIN attempt owner"); return; }
        try {
            JSObject result = new JSObject();
            synchronized (PinAttemptWait.class) {
                result.put("token", pinWait(getContext()).admit(owner, SystemClock.elapsedRealtime(), bootCount(getContext())));
            }
            call.resolve(result);
        } catch (IllegalStateException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void finishPinAttempt(PluginCall call) {
        String owner = call.getString("owner"), token = call.getString("token");
        Boolean successful = call.getBoolean("successful");
        if (!validIdentity(owner) || !validIdentity(token) || successful == null) {
            call.reject("Invalid PIN attempt result"); return;
        }
        try {
            synchronized (PinAttemptWait.class) {
                pinWait(getContext()).finish(owner, token, successful, SystemClock.elapsedRealtime(), bootCount(getContext()));
            }
            call.resolve();
        } catch (IllegalStateException error) {
            rejectStorage(call, error);
        }
    }

    /** A failed durable read or write reaches the page as `DEVICE_FULL` unless the failure says otherwise. */
    private static void rejectStorage(PluginCall call, IllegalStateException error) {
        call.reject(error.getMessage(), StorageFailure.code(error, StorageFailure.DEVICE_FULL), error);
    }

    private static boolean validIdentity(String value) {
        return value != null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    /** Also removes the unused Quick exit flag left by older versions. */
    public static void wipe(Context context) {
        synchronized (PinAttemptWait.class) {
            pinWait(context).reset();
            prefs(context).edit().clear().commit();
        }
        context.deleteSharedPreferences(LEGACY_PREFS);
    }

    static int bootCount(Context context) {
        return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 0);
    }

    static PinAttemptWait pinWait(Context context) {
        SharedPreferences preferences = prefs(context);
        CredentialWrapStore ledger = CredentialWrapStore.pinAttempts(context);
        return new PinAttemptWait(new PinAttemptWait.Store() {
            public PinAttemptWait.State read() {
                try {
                    String raw = ledger.read();
                    if (raw == null) {
                        if (!preferences.contains("pinDeadline")) return null;
                        return new PinAttemptWait.State(preferences.getLong("pinDeadline", 0),
                            preferences.getInt("pinBootCount", -1), preferences.getLong("pinFullDelayMs", 0));
                    }
                    JSONObject json = new JSONObject(raw);
                    long deadline = json.getLong("deadline"), fullDelay = json.getLong("fullDelayMs");
                    int count = json.getInt("wrongAttempts");
                    String owner = json.isNull("pendingOwner") ? null : json.getString("pendingOwner");
                    String token = json.isNull("pendingToken") ? null : json.getString("pendingToken");
                    if (deadline < 0 || fullDelay < 0 || count < 0 || (owner == null) != (token == null)
                        || (owner != null && (!validIdentity(owner) || !validIdentity(token)))) {
                        throw new IllegalStateException("invalid persisted PIN accounting");
                    }
                    return new PinAttemptWait.State(deadline, json.getInt("bootCount"), fullDelay, count,
                        json.getBoolean("adopted"), json.getBoolean("waitRecorded"), owner, token);
                } catch (Exception error) { throw new IllegalStateException("could not read PIN accounting", error); }
            }
            public void write(PinAttemptWait.State state) {
                try {
                    JSONObject json = new JSONObject();
                    json.put("deadline", state.deadline).put("bootCount", state.bootCount).put("fullDelayMs", state.fullDelayMs)
                        .put("wrongAttempts", state.wrongAttempts).put("adopted", state.adopted).put("waitRecorded", state.waitRecorded)
                        .put("pendingOwner", state.pendingOwner == null ? JSONObject.NULL : state.pendingOwner)
                        .put("pendingToken", state.pendingToken == null ? JSONObject.NULL : state.pendingToken);
                    ledger.write(json.toString());
                } catch (Exception error) { throw new IllegalStateException("could not persist PIN accounting", error); }
            }
            public void clear() {
                write(new PinAttemptWait.State(0, 0, 0, 0, true, false, null, null));
            }
        });
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
