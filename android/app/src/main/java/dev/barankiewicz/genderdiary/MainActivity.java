package dev.barankiewicz.genderdiary;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.barankiewicz.genderdiary.backup.AutoExportPlugin;
import dev.barankiewicz.genderdiary.keystore.KeystorePlugin;
import dev.barankiewicz.genderdiary.sqlite.SqlitePlugin;

/**
 * The whole Android application. Everything above the driver seam is the same
 * static bundle the web release serves (ADR-0017), so the only Android-specific
 * things here are the platform bridges: SQLite, Keystore, and the Storage
 * Access Framework bridge for backup destinations.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super.onCreate: the bridge is built there, and a plugin
        // registered afterwards is not in the bridge the WebView gets.
        registerPlugin(SqlitePlugin.class);
        registerPlugin(KeystorePlugin.class);
        registerPlugin(AutoExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
