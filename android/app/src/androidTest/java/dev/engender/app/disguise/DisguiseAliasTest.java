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
import java.util.Locale;
import java.util.Map;

/**
 * Check the launcher alias PackageManager actually reads, not a preference
 * this app merely believes it set. {@link DisguiseAlias#apply} is what
 * MainActivity's manifest split (an LAUNCHER-less MainActivity behind
 * thirty-three aliases) turns the disguise and the flag on and off through -
 * proved here directly, with {@code DONT_KILL_APP} so the test process
 * survives its own assertions.
 */
@RunWith(AndroidJUnit4.class)
public class DisguiseAliasTest {

    private Context context;
    private PackageManager pm;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        pm = context.getPackageManager();
        // Manifest default: the default alias enabled, nothing else.
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @Test
    public void startsWithTheRealIdentityLaunchable() {
        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertFalse(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void disguisingSwapsWhichAliasIsEnabled() {
        boolean changed = DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");

        assertTrue(changed);
        assertFalse(isEnabled(DisguiseAlias.DEFAULT));
        assertTrue(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void turningDisguiseOffRestoresTheRealIdentity() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");

        boolean changed = DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");

        assertTrue(changed);
        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertFalse(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void applyingTheSameStateTwiceIsANoOp() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");

        boolean changedAgain = DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");

        assertFalse(changedAgain);
        assertTrue(isEnabled(DisguiseAlias.DISGUISED));
    }

    /** The whole set, not a pair: thirty-three aliases, and the invariant that matters is
        that the launcher can never show two of this app or none of it. */
    @Test
    public void exactlyOneAliasIsEverEnabled() {
        List<String> aliases = DisguiseAlias.aliases(context);
        assertEquals(33, aliases.size());

        for (String alias : aliases) {
            if (isRound(alias)) continue;
            /* The disguised alias answers to no palette, so asking for its
               identity undisguised resolves back to the default - which is
               the fallback this walk also exercises. */
            String palette = paletteOf(alias);
            String wanted = DisguiseAlias.aliasFor(context, false, palette, "current");
            DisguiseAlias.apply(context, false, palette, "current");

            assertTrue(palette + " did not enable " + wanted, isEnabled(wanted));
            assertEquals(palette, 1, enabledCount(aliases));
        }
    }

    @Test
    public void roundShapeKeepsEveryPaletteAndDisguise() {
        for (String alias : DisguiseAlias.aliases(context)) {
            if (alias.equals(DisguiseAlias.DISGUISED) || isRound(alias)) continue;
            String palette = paletteOf(alias);
            String round = DisguiseAlias.aliasFor(context, false, palette, "round");
            DisguiseAlias.apply(context, false, palette, "round");
            assertEquals(alias + " lost its round partner", palette + "-round", identityOf(round));
            assertTrue(isEnabled(round));
            assertEquals(1, enabledCount(DisguiseAlias.aliases(context)));
            DisguiseAlias.apply(context, true, palette, "round");
            assertTrue(isEnabled(DisguiseAlias.DISGUISED));
        }
    }

    @Test
    public void theDisguisedAliasOutranksEveryFlag() {
        for (String alias : DisguiseAlias.aliases(context)) {
            if (alias.equals(DisguiseAlias.DISGUISED)) continue;

            DisguiseAlias.apply(context, true, paletteOf(alias), "current");

            assertTrue("disguised lost to " + alias, isEnabled(DisguiseAlias.DISGUISED));
            assertEquals(1, enabledCount(DisguiseAlias.aliases(context)));
        }
    }

    @Test
    public void anUnknownPaletteFallsBackRatherThanDisappearing() {
        /* A palette with no alias would otherwise disable everything and
           take the app off the home screen, which is the one failure this
           class must not have. */
        DisguiseAlias.apply(context, false, "notaflag", "current");

        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertEquals(1, enabledCount(DisguiseAlias.aliases(context)));
    }

    @Test
    public void mainActivityRemainsAvailableInRecents() throws Exception {
        ActivityInfo info = pm.getActivityInfo(new ComponentName(context, "dev.engender.app.MainActivity"), 0);
        assertEquals(0, info.flags & ActivityInfo.FLAG_EXCLUDE_FROM_RECENTS);
    }

    /** FA 43: the names apps listing launcher activities print say nothing
        about the app, its flags or the disguise. */
    @Test
    public void noAliasNameSaysWhatItDraws() {
        Map<String, String> identities = DisguiseAlias.identities(context);
        assertEquals(33, identities.size());
        for (String alias : identities.values()) {
            String name = alias.substring(alias.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            assertTrue(alias, name.matches("launch[0-9]{2}"));
        }
        assertEquals(DisguiseAlias.DEFAULT, identities.get(DisguiseAlias.DEFAULT_PALETTE));
        assertEquals(DisguiseAlias.DISGUISED, identities.get("disguised"));
    }

    /** What an alias draws, off its manifest meta-data. */
    private String identityOf(String alias) {
        for (Map.Entry<String, String> entry : DisguiseAlias.identities(context).entrySet()) {
            if (entry.getValue().equals(alias)) return entry.getKey();
        }
        throw new AssertionError(alias + " has no identity");
    }

    private boolean isRound(String alias) {
        return identityOf(alias).endsWith("-round");
    }

    /** The palette an alias is the icon for. */
    private String paletteOf(String alias) {
        return identityOf(alias);
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
