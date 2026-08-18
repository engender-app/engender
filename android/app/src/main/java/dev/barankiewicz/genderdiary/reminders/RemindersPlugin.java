package dev.barankiewicz.genderdiary.reminders;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

@CapacitorPlugin(
    name = "Reminders",
    permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
    }
)
public class RemindersPlugin extends Plugin {

    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSONObject payload = new JSONObject();
            JSArray reminders = call.getArray("reminders");
            payload.put("reminders", reminders == null ? new JSArray() : reminders);
            payload.put("checkInEnabled", Boolean.TRUE.equals(call.getBoolean("checkInEnabled", false)));
            payload.put("checkInTime", text(call, "checkInTime", "21:00"));
            JSArray affirmations = call.getArray("checkInAffirmations");
            payload.put("checkInAffirmations", affirmations == null ? new JSArray() : affirmations);
            payload.put("hideNotificationTitles", Boolean.TRUE.equals(call.getBoolean("hideNotificationTitles", false)));

            Integer latestEntryEpochDay = call.getInt("latestEntryEpochDay");
            payload.put("latestEntryEpochDay", latestEntryEpochDay == null ? JSONObject.NULL : latestEntryEpochDay);

            JSObject texts = call.getObject("texts");
            JSONObject textObject = new JSONObject();
            textObject.put("channelReminders", text(texts, "channelReminders", "Reminders"));
            textObject.put("channelCheckIn", text(texts, "channelCheckIn", "Check-in"));
            textObject.put("checkInTitle", text(texts, "checkInTitle", "Daily check-in"));
            textObject.put("checkInBody", text(texts, "checkInBody", "How are you today?"));
            payload.put("texts", textObject);

            ensureChannels(textObject);
            ReminderScheduler.saveAndSchedule(getContext(), payload);
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(status());
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) {
            call.resolve(status());
            return;
        }

        requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(status());
            return;
        }
        call.resolve(status());
    }

    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        try {
            ReminderScheduler.maybeOpenExactAlarmSettings(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void consumeLaunchRoute(PluginCall call) {
        JSObject result = new JSObject();
        String route = ReminderScheduler.consumeLaunchRoute(getContext());
        if (route == null) {
            result.put("route", JSObject.NULL);
        } else {
            result.put("route", route);
        }
        call.resolve(result);
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

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            status.put("exactAlarms", "not-required");
        } else {
            AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            status.put("exactAlarms", alarmManager != null && alarmManager.canScheduleExactAlarms() ? "granted" : "denied");
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
                .setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private void ensureChannels(JSONObject texts) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel reminders = new NotificationChannel(
            ReminderScheduler.CHANNEL_REMINDERS,
            texts.optString("channelReminders", "Reminders"),
            NotificationManager.IMPORTANCE_HIGH
        );
        NotificationChannel checkIn = new NotificationChannel(
            ReminderScheduler.CHANNEL_CHECK_IN,
            texts.optString("channelCheckIn", "Check-in"),
            NotificationManager.IMPORTANCE_HIGH
        );

        manager.createNotificationChannel(reminders);
        manager.createNotificationChannel(checkIn);
    }

    private static String text(PluginCall call, String key, String fallback) {
        String value = call.getString(key);
        return value == null ? fallback : value;
    }

    private static String text(JSObject object, String key, String fallback) {
        if (object == null) return fallback;
        String value = object.getString(key);
        return value == null ? fallback : value;
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}