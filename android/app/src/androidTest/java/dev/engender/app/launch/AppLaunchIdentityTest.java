package dev.engender.app.launch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.disguise.DisguiseAlias;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Recents and the window title take their label and icon from the component a
 * task was started through. A widget or notification tap must therefore land
 * on the same launcher alias the launcher itself would start, and follow it
 * when disguise flips, or a disguised app opened from a reminder shows up as
 * "engender" with the flag icon.
 */
@RunWith(AndroidJUnit4.class)
public class AppLaunchIdentityTest {
    private Context context;
    private PackageManager pm;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        pm = context.getPackageManager();
    }

    @After
    public void undisguise() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    private String launcherAlias() {
        Intent launcher = new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(context.getPackageName());
        ResolveInfo info = pm.resolveActivity(launcher, 0);
        assertNotNull("no enabled launcher alias", info);
        return info.activityInfo.name;
    }

    private String routeTarget() {
        ResolveInfo info = pm.resolveActivity(AppLaunch.routeIntent(context, "/doubt", "doubt"), 0);
        assertNotNull("route intent resolves to nothing", info);
        return info.activityInfo.name;
    }

    @Test
    public void routeLaunchesResolveToTheLiveLauncherAlias() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
        assertEquals(DisguiseAlias.DEFAULT, launcherAlias());
        assertEquals(launcherAlias(), routeTarget());

        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");
        assertEquals(DisguiseAlias.DISGUISED, launcherAlias());
        assertEquals(DisguiseAlias.DISGUISED, routeTarget());
    }

    @Test
    public void routeLaunchesFollowAChosenFlag() {
        DisguiseAlias.apply(context, false, "nonbinary", "round");
        assertEquals(DisguiseAlias.aliasFor(context, false, "nonbinary", "round"), routeTarget());
        assertEquals(launcherAlias(), routeTarget());
    }
}
