package dev.engender.app.disguise;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Which launcher activity-alias (AndroidManifest.xml) is the one Android
 * shows in the launcher and the recents list. Exactly one is ever enabled.
 *
 * <p>There are current and round aliases per flag, plus the disguised one.
 * The icon follows the palette and shape the person picked.
 * The disguised alias outranks every flag: someone who has turned disguise
 * on has said the app must not announce itself, and a flag is exactly an
 * announcement. So a palette change while disguised is recorded nowhere
 * here and simply waits - the preference is the record, and the shell hands
 * this class all three values on every sync, so the right flag lands the moment
 * disguise comes off.
 *
 * <p>The aliases are enumerated off the manifest rather than listed here, so
 * a ninth palette is a generator run and a manifest entry and nothing in
 * this file. Their names are neutral numbers ({@code Launch01} and on),
 * because apps that list launcher activities print them and they are fixed
 * from 1.0 (FA 43); which palette and shape an alias draws is its
 * {@link #IDENTITY} meta-data, the palette alone or with {@code -round}, or
 * {@code disguised}. The default palette's current artwork is
 * {@link #DEFAULT}, the one the manifest enables, so an install that never
 * changes its flag never flips an alias at all.
 *
 * <p>Always {@code DONT_KILL_APP} here, even though the disguise switch is
 * supposed to restart the app: that restart is a deliberate, separate step
 * ({@link DisguisePlugin#setLauncherIdentity}), not a side effect of this
 * method. Folding it in here would make the alias flip untestable without
 * also killing the process running the test - and a flag change must not
 * restart the app at all, which is only possible while the two are apart.
 */
public final class DisguiseAlias {

    /** The meta-data key each launcher alias carries in the manifest. */
    static final String IDENTITY = "dev.engender.app.LAUNCHER_IDENTITY";
    private static final String DISGUISED_IDENTITY = "disguised";

    /** Pinned rather than looked up: before anything is toggled this is the
        alias the manifest itself enables, and it is the fallback when a
        lookup finds nothing. */
    public static final String DEFAULT = "dev.engender.app.Launch01";
    public static final String DISGUISED = "dev.engender.app.Launch03";

    /** The palette DEFAULT draws, and the one the app ships with. */
    public static final String DEFAULT_PALETTE = "trans";

    private DisguiseAlias() {}

    /** The alias a given identity wants. Unknown palettes fall back to the
        default rather than to nothing: a name no alias answers to would
        leave every alias disabled and the app absent from the launcher. */
    public static String aliasFor(Context context, boolean disguised, String palette, String shape) {
        Map<String, String> byIdentity = identities(context);
        if (disguised) return byIdentity.getOrDefault(DISGUISED_IDENTITY, DISGUISED);
        String suffix = "round".equals(shape) ? "-round" : "";
        String wanted = byIdentity.get((palette == null ? "" : palette) + suffix);
        if (wanted != null) return wanted;
        return byIdentity.getOrDefault(DEFAULT_PALETTE + suffix, DEFAULT);
    }

    /**
     * Makes exactly one alias the live one.
     *
     * @return whether the enabled alias actually changed.
     */
    public static boolean apply(Context context, boolean disguised, String palette, String shape) {
        PackageManager pm = context.getPackageManager();
        String wanted = aliasFor(context, disguised, palette, shape);
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
        return new ArrayList<>(identities(context).values());
    }

    /** Each launcher alias keyed by what it draws, in manifest order: the
        palette, the palette with {@code -round}, or {@code disguised}. */
    static Map<String, String> identities(Context context) {
        Map<String, String> out = new LinkedHashMap<>();
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(
                context.getPackageName(),
                PackageManager.GET_ACTIVITIES | PackageManager.GET_META_DATA | PackageManager.MATCH_DISABLED_COMPONENTS
            );
            if (info.activities != null) {
                for (ActivityInfo activity : info.activities) {
                    String identity = activity.metaData == null ? null : activity.metaData.getString(IDENTITY);
                    if (activity.name != null && identity != null) out.put(identity, activity.name);
                }
            }
        } catch (PackageManager.NameNotFoundException impossible) {
            /* The package asking about itself. */
        }
        if (out.isEmpty()) out.put(DEFAULT_PALETTE, DEFAULT);
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
           android:enabled, and DEFAULT is the only one carrying it. */
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
