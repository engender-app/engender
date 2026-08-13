package dev.barankiewicz.genderdiary.disguise;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Ticket 15's first acceptance box, on a device: the launcher alias
 * PackageManager actually reads, not a preference this app merely believes
 * it set. {@link DisguiseAlias#apply} is what MainActivity's manifest split
 * (an LAUNCHER-less MainActivity behind two aliases) turns disguise on and
 * off through - proved here directly, with {@code DONT_KILL_APP} so the
 * test process survives its own assertions.
 */
@RunWith(AndroidJUnit4.class)
public class DisguiseAliasTest {

    private Context context;
    private PackageManager pm;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        pm = context.getPackageManager();
        // Manifest default: LauncherDefault enabled, LauncherDisguised not.
        DisguiseAlias.apply(context, false);
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false);
    }

    @Test
    public void startsWithTheRealIdentityLaunchable() {
        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertFalse(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void disguisingSwapsWhichAliasIsEnabled() {
        boolean changed = DisguiseAlias.apply(context, true);

        assertTrue(changed);
        assertFalse(isEnabled(DisguiseAlias.DEFAULT));
        assertTrue(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void turningDisguiseOffRestoresTheRealIdentity() {
        DisguiseAlias.apply(context, true);

        boolean changed = DisguiseAlias.apply(context, false);

        assertTrue(changed);
        assertTrue(isEnabled(DisguiseAlias.DEFAULT));
        assertFalse(isEnabled(DisguiseAlias.DISGUISED));
    }

    @Test
    public void applyingTheSameStateTwiceIsANoOp() {
        DisguiseAlias.apply(context, true);

        boolean changedAgain = DisguiseAlias.apply(context, true);

        assertFalse(changedAgain);
        assertTrue(isEnabled(DisguiseAlias.DISGUISED));
    }

    private boolean isEnabled(String alias) {
        int state = pm.getComponentEnabledSetting(new ComponentName(context, alias));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
            return alias.equals(DisguiseAlias.DEFAULT);
        }
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }
}
