package dev.engender.app.backup;

import static org.junit.Assert.*;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Files;
import org.junit.Test;

public class BackupResetOwnershipTest {
    @Test public void staleSlotCanBeTakenOverWithoutClearingANewerForegroundOwner() throws Exception {
        synchronized (BackupWork.OWNER) {
            AutoExportPlugin plugin = new AutoExportPlugin();
            File file = Files.createTempFile("backup-reset", ".pending").toFile();
            StagedBackup old = new StagedBackup(file);
            set(plugin, "pendingBackup", old);
            set(plugin, "pendingTransferId", "old");
            set(plugin, "pendingResetEpoch", BackupWork.resetEpoch);
            BackupWork.foregroundPacking = true;
            BackupWork.foregroundTransferId = "old";
            BackupWork.resetForegroundOwner();
            assertFalse(BackupWork.foregroundPacking);
            assertNull(BackupWork.foregroundTransferId);
            BackupWork.foregroundPacking = true;
            BackupWork.foregroundTransferId = "new";
            try {
                plugin.discardStaleBackup();
                assertTrue(old.isClosed());
                assertNull(get(plugin, "pendingBackup"));
                assertTrue(BackupWork.foregroundPacking);
                assertEquals("new", BackupWork.foregroundTransferId);
            } finally {
                old.close();
                BackupWork.resetForegroundOwner();
            }
        }
    }

    @Test public void currentSlotRemainsOwned() throws Exception {
        AutoExportPlugin plugin = new AutoExportPlugin();
        StagedBackup current = new StagedBackup(Files.createTempFile("backup-current", ".pending").toFile());
        try {
            set(plugin, "pendingBackup", current);
            set(plugin, "pendingResetEpoch", BackupWork.resetEpoch);
            plugin.discardStaleBackup();
            assertSame(current, get(plugin, "pendingBackup"));
            assertFalse(current.isClosed());
        } finally { current.close(); }
    }

    private static void set(Object owner, String name, Object value) throws Exception {
        Field field = AutoExportPlugin.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(owner, value);
    }
    private static Object get(Object owner, String name) throws Exception {
        Field field = AutoExportPlugin.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(owner);
    }
}
