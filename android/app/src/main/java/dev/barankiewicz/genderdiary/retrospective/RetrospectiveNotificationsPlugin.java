package dev.barankiewicz.genderdiary.retrospective;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import dev.barankiewicz.genderdiary.MainActivity;
import dev.barankiewicz.genderdiary.R;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;

/**
 * Opt-in local notifications for wrapped and on-this-day (phase 4 features
 * ticket 04). There is no native scheduling here, unlike Reminders: both
 * "is this due" checks need a live journal read (an entry count, a good-day
 * check), which only JS can do, so a JS-side periodic scheduler
 * (retrospective-notifications-scheduler.ts) decides when to call notifyWrapped
 * or notifyOnThisDay - this plugin only ever posts what it is told to, the
 * same one-shot shape AutoExportPlugin.notifyFailure() uses.
 *
 * Deep-linking reuses ReminderScheduler's EXTRA_ROUTE / launch-route store
 * rather than inventing a second mechanism: MainActivity already captures
 * that extra from any intent regardless of which plugin built it, and
 * ReminderScheduler.sanitizeLaunchRoute's allowlist covers the wrapped and
 * on-this-day route shapes alongside the reminder ones it already had.
 */
@CapacitorPlugin(
    name = "RetrospectiveNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
    }
)
public class RetrospectiveNotificationsPlugin extends Plugin {

    static final String CHANNEL_WRAPPED = "gd-wrapped";
    static final String CHANNEL_ON_THIS_DAY = "gd-on-this-day";
    private static final int NOTIFICATION_ID_WRAPPED = 7300;
    private static final int NOTIFICATION_ID_ON_THIS_DAY = 7301;
    private static final int REQUEST_WRAPPED = 51;
    private static final int REQUEST_ON_THIS_DAY = 52;

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            openNotificationSettings();
            call.resolve(status());
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void notifyWrapped(PluginCall call) {
        postNotification(call, CHANNEL_WRAPPED, NOTIFICATION_ID_WRAPPED, REQUEST_WRAPPED);
    }

    @PluginMethod
    public void notifyOnThisDay(PluginCall call) {
        postNotification(call, CHANNEL_ON_THIS_DAY, NOTIFICATION_ID_ON_THIS_DAY, REQUEST_ON_THIS_DAY);
    }

    private void postNotification(PluginCall call, String channelId, int notificationId, int requestCode) {
        try {
            if (!canNotify()) {
                call.resolve();
                return;
            }
            String title = call.getString("title", "");
            String body = call.getString("body", "");
            String route = call.getString("route", "");
            String channelName = call.getString("channelName", channelId);

            ensureChannel(channelId, channelName);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), channelId)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(openAppIntent(route, requestCode));

            NotificationManagerCompat.from(getContext()).notify(notificationId, builder.build());
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    private PendingIntent openAppIntent(String route, int requestCode) {
        Intent open = new Intent(getContext(), MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("genderdiary://open/retrospective-" + requestCode))
            .putExtra(ReminderScheduler.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            getContext(),
            9100 + requestCode,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /* Recreated on every notification, like RemindersPlugin.ensureChannels -
       cheap, and keeps the channel's displayed name in step with the app's
       current language rather than freezing it at whatever it was the first
       time. */
    private void ensureChannel(String channelId, String channelName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.createNotificationChannel(
            new NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_DEFAULT)
        );
    }

    private boolean canNotify() {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject status() {
        JSObject status = new JSObject();
        boolean notificationsEnabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            status.put("notifications", notificationsEnabled ? "not-required" : "denied");
        } else if (
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED
            && notificationsEnabled
        ) {
            status.put("notifications", "granted");
        } else {
            status.put("notifications", "denied");
        }
        return status;
    }

    private void openNotificationSettings() {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
