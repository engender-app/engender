package dev.engender.app.reminders;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderRescheduleReceiver extends BroadcastReceiver {

    private static final String ACTION_PACKAGE_REPLACED = "android.intent.action.MY_PACKAGE_REPLACED";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (
            !Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_TIMEZONE_CHANGED.equals(action)
            && !ACTION_PACKAGE_REPLACED.equals(action)
            && !Intent.ACTION_TIME_CHANGED.equals(action)
            && !AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)
        ) {
            return;
        }
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) ReminderScheduler.rescheduleAfterBoot(context);
        else ReminderScheduler.rescheduleFromStore(context);
    }
}
