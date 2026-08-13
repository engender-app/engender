import { describe, expect, test } from 'vitest';
import { buildAndroidReminderPayload } from './payload';

describe('buildAndroidReminderPayload', () => {
  test('copies reminders and scheduler state into bridge payload', () => {
    const payload = buildAndroidReminderPayload({
      reminders: [
        {
          id: 'r-1',
          title: 'Estradiol patch',
          type: 'med',
          time: '20:00',
          recurrence: 'EVERY_N_DAYS',
          interval: 3,
          anchorEpochDay: 20300,
          epochDay: null,
          enabled: true
        }
      ],
      checkInEnabled: true,
      checkInTime: '21:30',
      latestEntryEpochDay: 20309,
      hideNotificationTitles: true,
      texts: {
        channelReminders: 'Reminders',
        channelCheckIn: 'Check-in',
        checkInTitle: 'Daily check-in',
        checkInBody: 'How are you today?'
      }
    });

    expect(payload).toEqual({
      reminders: [
        {
          id: 'r-1',
          title: 'Estradiol patch',
          type: 'med',
          time: '20:00',
          recurrence: 'EVERY_N_DAYS',
          interval: 3,
          anchorEpochDay: 20300,
          epochDay: null,
          enabled: true
        }
      ],
      checkInEnabled: true,
      checkInTime: '21:30',
      latestEntryEpochDay: 20309,
      hideNotificationTitles: true,
      texts: {
        channelReminders: 'Reminders',
        channelCheckIn: 'Check-in',
        checkInTitle: 'Daily check-in',
        checkInBody: 'How are you today?'
      }
    });
  });

  test('returns detached objects so caller mutations do not back-write', () => {
    const reminders = [
      {
        id: 'r-1',
        title: 'Reminder',
        type: 'other' as const,
        time: '08:00',
        recurrence: 'DAILY' as const,
        interval: null,
        anchorEpochDay: null,
        epochDay: null,
        enabled: true
      }
    ];

    const payload = buildAndroidReminderPayload({
      reminders,
      checkInEnabled: false,
      checkInTime: '21:00',
      latestEntryEpochDay: 21000,
      hideNotificationTitles: false,
      texts: {
        channelReminders: 'A',
        channelCheckIn: 'B',
        checkInTitle: 'C',
        checkInBody: 'D'
      }
    });

    reminders[0].title = 'Changed';
    expect(payload.reminders[0].title).toBe('Reminder');
  });
});