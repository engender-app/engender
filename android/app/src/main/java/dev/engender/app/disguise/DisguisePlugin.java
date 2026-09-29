package dev.engender.app.disguise;

import android.os.Process;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

import dev.engender.app.widgets.DisguisableWidgetProvider;
import dev.engender.app.widgets.DoubtWidgetProvider;
import dev.engender.app.widgets.QuickLogWidgetProvider;
import dev.engender.app.widgets.TallyWidgetProvider;

/**
 * Mirrors disguise, palette and icon shape into the alias PackageManager
 * reads. Called from a Svelte effect on every change, including one that
 * arrives through Archive restore rather than the Settings toggle:
 * restoring a disguised backup has to leave the launcher disguised too, not
 * just the in-app preference.
 */
@CapacitorPlugin(name = "Disguise")
public class DisguisePlugin extends Plugin {

    /** Every at-rest widget surface (tickets 26, 33, 34) that must go
        neutral the moment disguise flips - adding a widget here is all
        DisguisePlugin needs to pick it up. These instances are only ever
        used to call updateAll; the system creates its own separate
        instances to deliver the real onUpdate broadcasts. */
    private static final List<DisguisableWidgetProvider> WIDGET_PROVIDERS = List.of(
        new QuickLogWidgetProvider(), new TallyWidgetProvider(), new DoubtWidgetProvider()
    );

    /** A palette change that arrived while running, queued rather than
        applied - see the comment in {@link #setLauncherIdentity}. Null
        means there is nothing queued. Paired with the disguise state at the
        moment it was queued (always equal to {@code wasDisguised} there),
        rather than assumed undisguised: this is also reached while disguised
        ({@link DisguiseAlias#apply} is then a no-op regardless of palette,
        per its own class comment, but the value carried through still has
        to be the real one).

        Written from {@link #setLauncherIdentity}, which Capacitor dispatches
        on its own plugin-call thread (ADR-0089), and read from
        {@link #handleOnStop}, an Activity-lifecycle callback delivered on
        the main thread - the same cross-call-boundary shape
        {@code PickedFiles} guards with {@code synchronized}, so this does
        too rather than relying on plain fields. */
    private String pendingPalette;
    private String pendingShape;
    private boolean pendingDisguised;

    private synchronized void queuePendingPalette(boolean disguised, String palette, String shape) {
        pendingPalette = palette;
        pendingShape = shape;
        pendingDisguised = disguised;
    }

    /** Clears whatever is queued, discarding it - used when a disguise flip
        supersedes any palette-only change still waiting for a background. */
    private synchronized void clearPendingPalette() {
        pendingPalette = null;
    }

    /** Applies whatever is queued, if anything, and clears it - both fields
        read and the clear done under one lock, so a concurrent
        {@link #setLauncherIdentity} can't queue a new value in the gap
        between reading them and clearing the old one. */
    private synchronized void applyPendingPalette() {
        if (pendingPalette == null) return;
        DisguiseAlias.apply(getContext(), pendingDisguised, pendingPalette, pendingShape);
        pendingPalette = null;
    }

    @PluginMethod
    public void setLauncherIdentity(PluginCall call) {
        boolean disguised = Boolean.TRUE.equals(call.getBoolean("disguised", false));
        String palette = call.getString("palette", DisguiseAlias.DEFAULT_PALETTE);
        String shape = call.getString("shape", "current");
        boolean wasDisguised = DisguiseAlias.isDisguised(getContext());
        call.resolve();

        if (wasDisguised != disguised) {
            // Killing the process is what makes the new alias the one the
            // launcher and recents show for this running app, not just for
            // the next cold start - disguise_app_sub_android's "the app
            // closes briefly to switch". Only when the alias actually
            // flipped: prefs sync onto every boot, and a restart nobody
            // asked for is its own kind of leak. Already-placed quick-log,
            // tally and doubt-entry widgets (tickets 26, 33, 34) are the
            // same category of exposure as the launcher icon, so they get
            // the same immediate refresh rather than waiting on their own
            // system-scheduled update.
            boolean changed = DisguiseAlias.apply(getContext(), disguised, palette, shape);
            clearPendingPalette();
            if (changed) {
                for (DisguisableWidgetProvider provider : WIDGET_PROVIDERS) provider.updateAll(getContext());
                Process.killProcess(Process.myPid());
            }
            return;
        }

        // A flag change flips an alias too, and it must not restart the app
        // under somebody - hiding the app has to take effect now, wearing a
        // different flag does not (ticket 50, ADR-0088). That's still true,
        // but applying it immediately isn't the same thing as applying it
        // without a restart: disabling an activity-alias tears down a task
        // that's currently running under it even with DONT_KILL_APP, which
        // only protects the process, not the window - Android does this
        // itself, nothing here calls killProcess or finish(). Whenever the
        // palette just picked happens to disable the alias this task is
        // still live under, the running screen goes with it (ticket 245:
        // reproduced on-device, {@code tests/android-tier/palette-switch-crash-check.mjs}).
        //
        // So the flip waits for a moment nothing is watching: queued here,
        // applied from handleOnStop(). The cost is exactly what this method
        // already used to say out loud - "the launcher shows the new icon
        // from the next cold start rather than the same second" - the code
        // just wasn't keeping that promise. The widgets are not branded by
        // the flag either (see above), so there is nothing of theirs to
        // refresh here.
        queuePendingPalette(disguised, palette, shape);
    }

    @Override
    protected void handleOnStop() {
        applyPendingPalette();
    }
}
