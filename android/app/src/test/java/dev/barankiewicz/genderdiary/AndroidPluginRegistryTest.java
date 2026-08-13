package dev.barankiewicz.genderdiary;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.util.LinkedHashSet;
import java.util.Set;

public class AndroidPluginRegistryTest {

    @Test
    public void pluginClassesExposeExpectedCapacitorIds() {
        AndroidPluginRegistry.assertRequiredPluginClassesExposeExpectedIds();
    }

    @Test
    public void completeRegistrationPassesValidation() {
        Set<String> registered = new LinkedHashSet<>(AndroidPluginRegistry.requiredPluginIds());
        AndroidPluginRegistry.assertRequiredPluginIds(registered);
    }

    @Test
    public void missingRegistrationFailsWithPluginName() {
        Set<String> registered = new LinkedHashSet<>(AndroidPluginRegistry.requiredPluginIds());
        registered.remove("Photos");

        try {
            AndroidPluginRegistry.assertRequiredPluginIds(registered);
            fail("Expected missing-plugin validation to throw");
        } catch (IllegalStateException error) {
            assertTrue(error.getMessage().contains("Missing required Android plugins at startup"));
            assertTrue(error.getMessage().contains("Photos"));
        }
    }
}