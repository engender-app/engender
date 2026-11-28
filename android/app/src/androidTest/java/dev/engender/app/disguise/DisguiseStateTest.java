package dev.engender.app.disguise;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * the page reads the live alias, synchronously, under the name the pre-paint
 * script and boot-cache.ts look for. The disguise flip kills the process
 * before the WebView flushes its localStorage boot mirror, so this is the
 * only answer that is right on the first start after a flip.
 */
@RunWith(AndroidJUnit4.class)
public class DisguiseStateTest {

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @Test
    public void followsTheAliasTheFlipJustWrote() {
        DisguiseState state = new DisguiseState(context);
        assertFalse(state.isDisguised());

        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");
        assertTrue(state.isDisguised());

        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
        assertFalse(state.isDisguised());
    }

    @Test
    public void isExposedUnderTheNameTheScriptsRead() {
        assertEquals("androidDisguiseState", DisguiseState.INTERFACE_NAME);
    }
}
