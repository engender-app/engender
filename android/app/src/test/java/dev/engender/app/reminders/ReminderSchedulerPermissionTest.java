package dev.engender.app.reminders;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Test;

public class ReminderSchedulerPermissionTest {
    @Test public void eachAlarmRechecksTheCurrentPermission() {
        AtomicBoolean permission = new AtomicBoolean(false);
        List<String> alarms = new ArrayList<>();
        ReminderScheduler.schedule(true, permission::get, () -> alarms.add("exact"), () -> alarms.add("inexact"));
        permission.set(true);
        ReminderScheduler.schedule(true, permission::get, () -> alarms.add("exact"), () -> alarms.add("inexact"));
        permission.set(false);
        ReminderScheduler.schedule(true, permission::get, () -> alarms.add("exact"), () -> alarms.add("inexact"));
        assertEquals(List.of("inexact", "exact", "inexact"), alarms);
    }

    @Test public void aRevokeAfterThePermissionCheckFallsBackToInexact() {
        List<String> alarms = new ArrayList<>();
        ReminderScheduler.schedule(true, () -> true,
            () -> { throw new SecurityException("permission revoked during scheduling"); },
            () -> alarms.add("inexact"));
        assertEquals(List.of("inexact"), alarms);
    }

    @Test public void olderAndroidNeedsNoPermissionCheck() {
        List<String> alarms = new ArrayList<>();
        ReminderScheduler.schedule(false, () -> { throw new AssertionError("checked an unavailable permission"); },
            () -> alarms.add("exact"), () -> fail("used inexact before the permission existed"));
        assertEquals(List.of("exact"), alarms);
    }

    @Test public void unrelatedExactAndFallbackFailuresRemainVisible() {
        IllegalStateException exactFailure = new IllegalStateException("alarm service failed");
        assertSame(exactFailure, assertThrows(IllegalStateException.class, () ->
            ReminderScheduler.schedule(true, () -> true, () -> { throw exactFailure; }, () -> fail("masked exact failure"))));
        IllegalStateException fallbackFailure = new IllegalStateException("inexact service failed");
        assertSame(fallbackFailure, assertThrows(IllegalStateException.class, () ->
            ReminderScheduler.schedule(true, () -> false, () -> fail("used exact without permission"), () -> { throw fallbackFailure; })));
    }
}
