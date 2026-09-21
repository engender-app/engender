package dev.engender.app.disguise;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;

/**
 * Ticket 15's first acceptance box and ticket 50's, on a device: the
 * launcher alias PackageManager actually reads, not a preference this app
 * merely believes it set. {@link DisguiseAlias#apply} is what MainActivity's
 * manifest split (an LAUNCHER-less MainActivity behind nine aliases) turns
 * the disguise and the flag on and off through - proved here directly, with
 * {@code DONT_KILL_APP} so the test process survives its own assertions.
 */
@RunWith(AndroidJUnit4.class)
public class DisguiseAliasTest {

    private Context context;
    private PackageManager pm;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        pm = context.getPackageManager();
        // Manifest default: LauncherDefault enabled, nothing else.
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE);
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE);
    }

    @Test
    public void startsWithTheRealIdentityLaunchable() {
        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertFalse(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void disguisingSwapsWhichAliasIsEnabled() {
        boolean changed = DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE);

        assertTrue(changed);
        assertFalse(isEnabled(DisguiseAlias.DEFAULT));
        assertTrue(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void turningDisguiseOffRestoresTheRealIdentity() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE);

        boolean changed = DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE);

        assertTrue(changed);
        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertFalse(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void applyingTheSameStateTwiceIsANoOp() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE);

        boolean changedAgain = DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE);

        assertFalse(changedAgain);
        assertTrue(isEnabled(DisguiseAlias.DISGUISED));
    }

    /** Ticket 50. The whole set, not a pair: nine aliases, and the invariant
        that matters is that the launcher can never show two of this app or
        none of it. */
    @Test
    public void exactlyOneAliasIsEverEnabled() {
        List<String> aliases = DisguiseAlias.aliases(context);
        assertEquals(9, aliases.size());

        for (String alias : aliases) {
            /* LauncherDisguised answers to no palette, so asking for its
               name undisguised resolves back to the default - which is the
               fallback this walk also exercises. */
            String palette = paletteOf(alias);
            String wanted = DisguiseAlias.aliasFor(context, false, palette);
            DisguiseAlias.apply(context, false, palette);

            assertTrue(palette + " did not enable " + wanted, isEnabled(wanted));
            assertEquals(palette, 1, enabledCount(aliases));
        }
    }

    @Test
    public void theDisguisedAliasOutranksEveryFlag() {
        for (String alias : DisguiseAlias.aliases(context)) {
            if (alias.equals(DisguiseAlias.DISGUISED)) continue;

            DisguiseAlias.apply(context, true, paletteOf(alias));

            assertTrue("disguised lost to " + alias, isEnabled(DisguiseAlias.DISGUISED));
            assertEquals(1, enabledCount(DisguiseAlias.aliases(context)));
        }
    }

    @Test
    public void anUnknownPaletteFallsBackRatherThanDisappearing() {
        /* A palette with no alias would otherwise disable everything and
           take the app off the home screen, which is the one failure this
           class must not have. */
        DisguiseAlias.apply(context, false, "notaflag");

        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertEquals(1, enabledCount(DisguiseAlias.aliases(context)));
    }

    @Test
    public void mainActivityIsExcludedFromRecents() throws Exception {
        ActivityInfo info = pm.getActivityInfo(new ComponentName(context, "dev.engender.app.MainActivity"), 0);
        assertTrue((info.flags & ActivityInfo.FLAG_EXCLUDE_FROM_RECENTS) != 0);
    }

    /** The palette an alias is the icon for, which is the inverse of the
        name rule in DisguiseAlias: LauncherNonbinary is nonbinary's, and
        LauncherDefault is the default palette's. */
    private String paletteOf(String alias) {
        if (alias.equals(DisguiseAlias.DEFAULT)) return DisguiseAlias.DEFAULT_PALETTE;
        String suffix = alias.substring(alias.lastIndexOf("Launcher") + "Launcher".length());
        return suffix.substring(0, 1).toLowerCase() + suffix.substring(1);
    }

    private int enabledCount(List<String> aliases) {
        int count = 0;
        for (String alias : aliases) if (isEnabled(alias)) count++;
        return count;
    }

    private boolean isEnabled(String alias) {
        int state = pm.getComponentEnabledSetting(new ComponentName(context, alias));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
            return alias.equals(DisguiseAlias.DEFAULT);
        }
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }
}
