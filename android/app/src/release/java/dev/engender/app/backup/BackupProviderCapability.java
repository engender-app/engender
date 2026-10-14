package dev.engender.app.backup;

import android.content.Context;
import android.net.Uri;

/** Release builds never accept an instrumentation provider as durable storage. */
final class BackupProviderCapability {
    static boolean supportsTestProvider(Context context, Uri uri) { return false; }
}
