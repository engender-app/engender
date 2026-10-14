package dev.engender.app.backup;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.ProviderInfo;
import android.net.Uri;
import android.os.Bundle;

/** Only the installed test APK can supply controlled local-delivery fixtures. */
final class BackupProviderCapability {
    static boolean supportsTestProvider(Context context, Uri uri) {
        if (!"dev.engender.app.test.backups".equals(uri.getAuthority())) return false;
        ProviderInfo provider = context.getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
        if (provider == null || !provider.packageName.equals(context.getPackageName() + ".test")
            || (provider.applicationInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0
            || context.getPackageManager().queryInstrumentation(context.getPackageName(), 0).stream()
                .noneMatch(instrumentation -> provider.packageName.equals(instrumentation.packageName))) return false;
        Bundle capability = context.getContentResolver().call(Uri.parse("content://" + uri.getAuthority()), "durability", null, null);
        return capability != null && capability.getBoolean("local", false);
    }
}
