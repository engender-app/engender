package dev.engender.app.sqlite;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SqlitePluginLifecycleTest {
    private static final String KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    @Test public void destructionDrainsWritesReleasesKeyAndRefusesLateCalls() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().startsWith("dev.engender.app.test."));
        String name = "renderer-lifecycle.db";
        context.deleteDatabase(name);
        class OwnedPlugin extends SqlitePlugin {
            @Override public Context getContext() { return context; }
            void destroy() { handleOnDestroy(); }
        }
        OwnedPlugin plugin = new OwnedPlugin();
        plugin.load();
        try {
            Call open = new Call("open", new JSObject().put("name", name).put("hexKey", KEY).put("session", "old").put("seq", 0));
            plugin.open(open);
            open.success();
            Call write = new Call("exec", new JSObject().put("sql", "CREATE TABLE kept(value); INSERT INTO kept VALUES (36)")
                .put("session", "old").put("seq", 1));
            plugin.exec(write);
            plugin.destroy();
            write.success();
            ExecutorService worker = (ExecutorService) field(plugin, SqlitePlugin.class, "worker");
            assertTrue("old SQLCipher worker must terminate", worker.awaitTermination(10, TimeUnit.SECONDS));
            SqliteConnection old = (SqliteConnection) field(plugin, SqlitePlugin.class, "connection");
            assertEquals("", field(old, SqliteConnection.class, "password"));
            assertNull(field(old, SqliteConnection.class, "database"));
            assertNull(field(old, SqliteConnection.class, "databaseFile"));
            Call late = new Call("query", new JSObject().put("sql", "SELECT * FROM kept").put("session", "old").put("seq", 2));
            plugin.query(late);
            assertEquals("sqlite bridge is closed", late.error);
            SqliteConnection fresh = new SqliteConnection();
            try {
                fresh.open(context, name, KEY);
                assertEquals(36, fresh.query("SELECT value FROM kept", null).getJSONObject(0).getInt("value"));
            } finally { fresh.dispose(); }
        } finally { context.deleteDatabase(name); }
    }

    private static Object field(Object owner, Class<?> type, String name) throws Exception {
        Field field = type.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(owner);
    }

    private static final class Call extends PluginCall {
        private final CountDownLatch done = new CountDownLatch(1);
        private String error;
        Call(String method, JSObject options) { super(null, "Sqlite", "test", method, options); }
        @Override public void resolve() { done.countDown(); }
        @Override public void resolve(JSObject value) { done.countDown(); }
        @Override public void reject(String message, String code, Exception cause, JSObject data) {
            error = message;
            done.countDown();
        }
        void success() throws Exception {
            assertTrue("native call must finish", done.await(10, TimeUnit.SECONDS));
            assertNull(error);
        }
    }
}
