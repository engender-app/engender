package dev.engender.app.files;

import static org.junit.Assert.*;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public class FileResetOwnershipTest {
    @Test public void staleSlotIsClosedBeforeAnotherFileUsesItsPath() throws Exception {
        FileDeliveryPlugin plugin = new FileDeliveryPlugin();
        StagedFile old = StagedFile.encrypted(Files.createTempFile("file-reset", ".pending").toFile());
        try {
            set(plugin, "staged", old);
            set(plugin, "pendingResetEpoch", epoch());
            plugin.discardStaleFile();
            assertFalse(old.isClosed());
            FileDeliveryPlugin.resetTransfers();
            plugin.discardStaleFile();
            assertTrue(old.isClosed());
            assertNull(get("staged", plugin));
        } finally { old.close(); }
    }

    @Test public void ownerlessOldPickerCallbackCannotClearANewerSlot() throws Exception {
        FileDeliveryPlugin plugin = new FileDeliveryPlugin();
        StagedFile current = StagedFile.encrypted(Files.createTempFile("file-current", ".pending").toFile());
        try {
            set(plugin, "staged", current);
            set(plugin, "pendingResetEpoch", epoch());
            java.lang.reflect.Method complete = FileDeliveryPlugin.class.getDeclaredMethod("complete",
                com.getcapacitor.PluginCall.class, androidx.activity.result.ActivityResult.class);
            complete.setAccessible(true);
            complete.invoke(plugin, null, null);
            assertSame(current, get("staged", plugin));
            assertFalse(current.isClosed());
        } finally { current.close(); }
    }

    @Test public void destroyingAnOldInstanceCannotDeleteTheNewInstancesStaging() throws Exception {
        java.io.File directory = Files.createTempDirectory("file-owners").toFile();
        FileDeliveryPlugin oldPlugin = new FileDeliveryPlugin();
        FileDeliveryPlugin currentPlugin = new FileDeliveryPlugin();
        StagedFile old = StagedFile.encrypted(FileDeliveryPlugin.stagingFile(directory, "00000000-0000-4000-8000-000000000001"));
        set(oldPlugin, "staged", old);
        set(oldPlugin, "pendingResetEpoch", epoch());
        FileDeliveryPlugin.resetTransfers();
        StagedFile current = StagedFile.encrypted(FileDeliveryPlugin.stagingFile(directory, "00000000-0000-4000-8000-000000000002"));
        set(currentPlugin, "staged", current);
        set(currentPlugin, "pendingResetEpoch", epoch());
        try {
            oldPlugin.handleOnDestroy();
            assertTrue("old destruction must leave the new staging file", current.file.exists());
            assertFalse(current.isClosed());
            current.append(0, new byte[] {42});
        } finally { currentPlugin.handleOnDestroy(); directory.delete(); }
    }

    private static long epoch() throws Exception { return ((AtomicLong) get("resetEpoch", null)).get(); }
    private static Object get(String name, Object owner) throws Exception {
        Field field = FileDeliveryPlugin.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(owner);
    }
    private static void set(Object owner, String name, Object value) throws Exception {
        Field field = FileDeliveryPlugin.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(owner, value);
    }
}
