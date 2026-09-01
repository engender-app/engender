/* The disguise, as one rule over every registered class (phase 6 ticket 04).
   The registry declares `disguised: true` on all six firing rows;
   registry.test.ts holds that declaration and this holds what it means. */

import { describe, expect, it } from 'vitest';
import { notificationText } from './notificationText.ts';

const PLAIN = { title: 'Estradiol patch', body: 'Left thigh, 20:00' };

describe('notificationText', () => {
  it('says what it was going to say while the disguise is off', () => {
    expect(notificationText(PLAIN, 'Reminders', false)).toEqual(PLAIN);
  });

  it('keeps the channel name and drops the body under the disguise', () => {
    /* The channel name is already visible in the phone's own notification
       settings whether the app posts anything or not, so hiding it buys
       nothing and costs the person any way of telling one notification from
       another. The body is where the revealing detail is. */
    expect(notificationText(PLAIN, 'Reminders', true)).toEqual({ title: 'Reminders', body: '' });
  });

  it('leaves nothing of the original text behind when it disguises', () => {
    const disguised = notificationText(PLAIN, 'Backups', true);
    expect(disguised.title).not.toContain('Estradiol');
    expect(disguised.body).not.toContain('thigh');
  });

  it('does not mutate what it was handed', () => {
    notificationText(PLAIN, 'Reminders', true);
    expect(PLAIN).toEqual({ title: 'Estradiol patch', body: 'Left thigh, 20:00' });
  });
});
