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
 * Keep exactly one launcher alias enabled. Disguise overrides the chosen
 * palette and shape, which the caller supplies again on every sync.
 *
 * <p>Discover aliases from the manifest via {@link #IDENTITY} metadata
 * (palette, palette with {@code -round}, or {@code disguised}). Neutral
 * names such as {@code Launch01} are visible to other apps and must stay
 * stable. {@link #DEFAULT} is enabled on a fresh install.
 *
 * <p>Use {@code DONT_KILL_APP}. {@link DisguisePlugin#setLauncherIdentity}
 * restarts only when disguise changes, so flag changes keep the app alive
 * and alias selection can be tested in-process.
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
