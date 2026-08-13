package dev.barankiewicz.genderdiary;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import dev.barankiewicz.genderdiary.backup.AutoExportPlugin;
import dev.barankiewicz.genderdiary.disguise.DisguisePlugin;
import dev.barankiewicz.genderdiary.keystore.KeystorePlugin;
import dev.barankiewicz.genderdiary.photos.PhotosPlugin;
import dev.barankiewicz.genderdiary.quickexit.QuickExitPlugin;
import dev.barankiewicz.genderdiary.reminders.RemindersPlugin;
import dev.barankiewicz.genderdiary.sqlite.SqlitePlugin;

/**
 * Canonical required Android plugin list: each plugin ID and the class
 * MainActivity must register before the bridge is built.
 */
public final class AndroidPluginRegistry {
    private AndroidPluginRegistry() {}

    private static final List<PluginEntry> REQUIRED = Arrays.asList(
        new PluginEntry("Sqlite", SqlitePlugin.class),
        new PluginEntry("Keystore", KeystorePlugin.class),
        new PluginEntry("Photos", PhotosPlugin.class),
        new PluginEntry("Reminders", RemindersPlugin.class),
        new PluginEntry("AutoExport", AutoExportPlugin.class),
        new PluginEntry("Disguise", DisguisePlugin.class),
        new PluginEntry("QuickExit", QuickExitPlugin.class)
    );

    public static List<Class<? extends Plugin>> requiredPluginClasses() {
        ArrayList<Class<? extends Plugin>> classes = new ArrayList<>(REQUIRED.size());
        for (PluginEntry entry : REQUIRED) {
            classes.add(entry.pluginClass);
        }
        return classes;
    }

    public static List<String> requiredPluginIds() {
        ArrayList<String> ids = new ArrayList<>(REQUIRED.size());
        for (PluginEntry entry : REQUIRED) {
            ids.add(entry.pluginId);
        }
        return ids;
    }

    public static void assertRequiredPluginIds(Set<String> registeredPluginIds) {
        Set<String> missing = new LinkedHashSet<>();
        for (String pluginId : requiredPluginIds()) {
            if (!registeredPluginIds.contains(pluginId)) {
                missing.add(pluginId);
            }
        }
        if (missing.isEmpty()) return;
        throw new IllegalStateException(
            "Missing required Android plugins at startup: " + String.join(", ", missing)
        );
    }

    public static void assertRequiredPluginClassesExposeExpectedIds() {
        Set<String> declaredPluginIds = new LinkedHashSet<>();
        for (PluginEntry entry : REQUIRED) {
            CapacitorPlugin annotation = entry.pluginClass.getAnnotation(CapacitorPlugin.class);
            if (annotation == null || annotation.name().isEmpty()) {
                throw new IllegalStateException(
                    "Required plugin class "
                        + entry.pluginClass.getName()
                        + " is missing @CapacitorPlugin(name = ...) for "
                        + entry.pluginId
                );
            }
            if (!entry.pluginId.equals(annotation.name())) {
                throw new IllegalStateException(
                    "Required plugin "
                        + entry.pluginId
                        + " maps to "
                        + entry.pluginClass.getName()
                        + " but declares "
                        + annotation.name()
                );
            }
            declaredPluginIds.add(annotation.name());
        }
        assertRequiredPluginIds(declaredPluginIds);
    }

    private static final class PluginEntry {
        final String pluginId;
        final Class<? extends Plugin> pluginClass;

        PluginEntry(String pluginId, Class<? extends Plugin> pluginClass) {
            this.pluginId = pluginId;
            this.pluginClass = pluginClass;
        }
    }
}