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
 * Mirrors the two preferences that decide the app's launcher identity - the
 * disguise and the palette - into the alias PackageManager reads. Called
 * from a Svelte effect on every change to either, including one that
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

    @PluginMethod
    public void setLauncherIdentity(PluginCall call) {
        boolean disguised = Boolean.TRUE.equals(call.getBoolean("disguised", false));
        String palette = call.getString("palette", DisguiseAlias.DEFAULT_PALETTE);
        boolean wasDisguised = DisguiseAlias.isDisguised(getContext());
        boolean changed = DisguiseAlias.apply(getContext(), disguised, palette);
        call.resolve();
        // Killing the process is what makes the new alias the one the
        // launcher and recents show for this running app, not just for the
        // next cold start - disguise_app_sub_android's "the app closes
        // briefly to switch". Only when the alias actually flipped: prefs
        // sync onto every boot, and a restart nobody asked for is its own
        // kind of leak. Already-placed quick-log, tally and doubt-entry
        // widgets (tickets 26, 33, 34) are the same category of exposure as
        // the launcher icon, so they get the same immediate refresh rather
        // than waiting on their own system-scheduled update.
        //
        // And only for the disguise (ticket 50, ADR-0088). A flag change
        // flips an alias too, and it must not restart the app under
        // somebody: hiding the app has to take effect now, wearing a
        // different flag does not. The cost is that the launcher shows the
        // new icon from the next cold start rather than the same second,
        // and recents can lag until then. The widgets are not branded by
        // the flag either, so there is nothing for them to redraw.
        if (changed && wasDisguised != disguised) {
            for (DisguisableWidgetProvider provider : WIDGET_PROVIDERS) provider.updateAll(getContext());
            Process.killProcess(Process.myPid());
        }
    }
}
