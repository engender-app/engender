package dev.engender.app.disguise;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Which launcher activity-alias (AndroidManifest.xml) is the one Android
 * shows in the launcher and the recents list. Exactly one is ever enabled.
 *
 * <p>There is one alias per flag as well as the disguised one (ticket 50),
 * because the icon on a home screen follows the palette the person picked.
 * The disguised alias outranks every flag: someone who has turned disguise
 * on has said the app must not announce itself, and a flag is exactly an
 * announcement. So a palette change while disguised is recorded nowhere
 * here and simply waits - the preference is the record, and the shell hands
 * this class both values on every sync, so the right flag lands the moment
 * disguise comes off.
 *
 * <p>The aliases are enumerated off the manifest rather than listed here, so
 * a ninth palette is a generator run and a manifest entry and nothing in
 * this file. What is computed here is only the name: {@code Launcher} plus
 * the palette, capitalised, with the default palette answering to
 * {@code LauncherDefault} - it has no alias of its own, so an install that
 * never changes its flag never flips an alias at all.
 *
 * <p>Always {@code DONT_KILL_APP} here, even though the disguise switch is
 * supposed to restart the app: that restart is a deliberate, separate step
 * ({@link DisguisePlugin#setLauncherIdentity}), not a side effect of this
 * method. Folding it in here would make the alias flip untestable without
 * also killing the process running the test - and a flag change must not
 * restart the app at all, which is only possible while the two are apart.
 */
public final class DisguiseAlias {

    private static final String PREFIX = "dev.engender.app.disguise.Launcher";

    public static final String DEFAULT = PREFIX + "Default";
    public static final String DISGUISED = PREFIX + "Disguised";

    /** The palette LauncherDefault draws, and the one the app ships with. */
    public static final String DEFAULT_PALETTE = "trans";

    private DisguiseAlias() {}

    /** The alias a given identity wants. Unknown palettes fall back to the
        default rather than to nothing: a name no alias answers to would
        leave every alias disabled and the app absent from the launcher. */
    public static String aliasFor(Context context, boolean disguised, String palette) {
        if (disguised) return DISGUISED;
        if (palette == null || palette.isEmpty() || palette.equals(DEFAULT_PALETTE)) return DEFAULT;
        String wanted = PREFIX + palette.substring(0, 1).toUpperCase(Locale.ROOT) + palette.substring(1);
        return aliases(context).contains(wanted) ? wanted : DEFAULT;
    }

    /**
     * Makes exactly one alias the live one.
     *
     * @return whether the enabled alias actually changed.
     */
    public static boolean apply(Context context, boolean disguised, String palette) {
        PackageManager pm = context.getPackageManager();
        String wanted = aliasFor(context, disguised, palette);
        if (wanted.equals(enabledAlias(pm, context))) return false;

        for (String alias : aliases(context)) setEnabled(pm, context, alias, alias.equals(wanted));
        return true;
    }

    /** The same live PackageManager read {@link #apply} uses, exposed for
        other at-rest surfaces that must not brand themselves while disguise
        is on - the quick-log widget reads this rather than keeping a
        second copy of the preference. */
    public static boolean isDisguised(Context context) {
        return DISGUISED.equals(enabledAlias(context.getPackageManager(), context));
    }

    /** Every launcher alias the manifest declares, disabled ones included.
        The manifest is the list; nothing here repeats it. */
    static List<String> aliases(Context context) {
        List<String> out = new ArrayList<>();
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(
                context.getPackageName(),
                PackageManager.GET_ACTIVITIES | PackageManager.MATCH_DISABLED_COMPONENTS
            );
            if (info.activities != null) {
                for (ActivityInfo activity : info.activities) {
                    if (activity.name != null && activity.name.startsWith(PREFIX)) out.add(activity.name);
                }
            }
        } catch (PackageManager.NameNotFoundException impossible) {
            /* The package asking about itself. */
        }
        if (out.isEmpty()) out.add(DEFAULT);
        return out;
    }

    /** Which alias is live right now, straight from PackageManager - the
        manifest's android:enabled is the fallback for "never toggled", not a
        value this class keeps a second copy of. */
    private static String enabledAlias(PackageManager pm, Context context) {
        for (String alias : aliases(context)) {
            if (pm.getComponentEnabledSetting(new ComponentName(context, alias))
                == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return alias;
        }
        /* Nothing has been toggled yet, so the answer is the manifest's own
           android:enabled, and LauncherDefault is the only one carrying it. */
        return DEFAULT;
    }

    private static void setEnabled(PackageManager pm, Context context, String alias, boolean enabled) {
        pm.setComponentEnabledSetting(
            new ComponentName(context, alias),
            enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        );
    }
}
