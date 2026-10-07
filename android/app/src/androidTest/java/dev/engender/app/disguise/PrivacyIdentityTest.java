package dev.engender.app.disguise;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Locale;

import dev.engender.app.R;

@RunWith(AndroidJUnit4.class)
public class PrivacyIdentityTest {
    @Test
    public void polishLauncherUsesItsLocalisedDecoyLabel() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ActivityInfo alias = context.getPackageManager().getActivityInfo(
            new ComponentName(context, DisguiseAlias.DISGUISED), PackageManager.MATCH_DISABLED_COMPONENTS);
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.setLocale(Locale.forLanguageTag("pl"));
        assertEquals("Notatki", context.createConfigurationContext(configuration).getString(alias.labelRes));
        configuration.setLocale(Locale.ENGLISH);
        assertEquals("Notes", context.createConfigurationContext(configuration).getString(alias.labelRes));
    }

    @Test
    public void notificationMarkRendersWithTransparentSpaceBetweenRings() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Drawable mark = context.getDrawable(R.drawable.ic_stat_mark);
        Bitmap bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888);
        mark.setBounds(0, 0, 100, 100);
        mark.draw(new Canvas(bitmap));
        assertEquals(0, Color.alpha(bitmap.getPixel(0, 0)));
        assertTrue(Color.alpha(bitmap.getPixel(1, 50)) > 0);
        assertEquals(0, Color.alpha(bitmap.getPixel(62, 50)));
        assertTrue(Color.alpha(bitmap.getPixel(51, 10)) > 0);
    }
}
