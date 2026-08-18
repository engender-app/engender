package dev.barankiewicz.genderdiary.disguise;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

/**
 * Which of the two launcher activity-aliases (AndroidManifest.xml) is the
 * one Android shows in the launcher and the recents list (ticket 15's first
 * acceptance box). Exactly one is ever enabled.
 *
 * <p>Always {@code DONT_KILL_APP} here, even though the disguise switch is
 * supposed to restart the app: that restart is a deliberate, separate step
 * ({@link DisguisePlugin#setDisguised}), not a side effect of this method.
 * Folding it in here would make the alias flip untestable without also
 * killing the process running the test.
 */
public final class DisguiseAlias {

    public static final String DEFAULT = "dev.barankiewicz.genderdiary.disguise.LauncherDefault";
    public static final String DISGUISED = "dev.barankiewicz.genderdiary.disguise.LauncherDisguised";

    private DisguiseAlias() {}

    /** @return whether the enabled alias actually changed. */
    public static boolean apply(Context context, boolean disguised) {
        PackageManager pm = context.getPackageManager();
        if (isDisguised(pm, context) == disguised) return false;

        setEnabled(pm, context, DEFAULT, !disguised);
        setEnabled(pm, context, DISGUISED, disguised);
        return true;
    }

    /** The same live PackageManager read {@link #apply} uses, exposed for
        other at-rest surfaces that must not brand themselves while disguise
        is on - the quick-log widget (ticket 26) reads this rather than
        keeping a second copy of the preference. */
    public static boolean isDisguised(Context context) {
        return isDisguised(context.getPackageManager(), context);
    }

    /** Reads which alias is currently live, straight from PackageManager -
        the manifest's android:enabled is the fallback for "never toggled",
        not a value this class keeps a second copy of. */
    private static boolean isDisguised(PackageManager pm, Context context) {
        int state = pm.getComponentEnabledSetting(new ComponentName(context, DISGUISED));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return false;
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    private static void setEnabled(PackageManager pm, Context context, String alias, boolean enabled) {
        pm.setComponentEnabledSetting(
            new ComponentName(context, alias),
            enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        );
    }
}
