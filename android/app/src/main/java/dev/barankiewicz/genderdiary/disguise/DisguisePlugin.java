package dev.barankiewicz.genderdiary.disguise;

import android.os.Process;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mirrors the disguise preference (ticket 15) into the launcher alias
 * PackageManager reads. Called from a Svelte effect on every change to
 * prefs.disguise, including one that arrives through Archive restore rather
 * than the Settings toggle - restoring a disguised backup has to leave the
 * launcher disguised too, not just the in-app preference.
 */
@CapacitorPlugin(name = "Disguise")
public class DisguisePlugin extends Plugin {

    @PluginMethod
    public void setDisguised(PluginCall call) {
        boolean disguised = Boolean.TRUE.equals(call.getBoolean("disguised", false));
        boolean changed = DisguiseAlias.apply(getContext(), disguised);
        call.resolve();
        // Killing the process is what makes the new alias the one the
        // launcher and recents show for this running app, not just for the
        // next cold start - disguise_app_sub_android's "the app closes
        // briefly to switch". Only when the alias actually flipped: prefs
        // sync onto every boot, and a restart nobody asked for is its own
        // kind of leak.
        if (changed) Process.killProcess(Process.myPid());
    }
}
