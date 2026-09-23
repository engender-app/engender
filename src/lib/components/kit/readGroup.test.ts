import { describe, expect, it } from 'vitest';
import { ReadGroup, heldByReadGroup } from './readGroup';

describe('ReadGroup', () => {
  it('holds until every member and its owner have answered', () => {
    let own = false;
    const answered = [false, false];
    const group = new ReadGroup(() => own);
    group.join(() => answered[0]);
    group.join(() => answered[1]);

    expect(group.answered).toBe(false);
    answered[0] = true;
    expect(group.answered).toBe(false);
    answered[1] = true;
    expect(group.answered).toBe(false);
    own = true;
    expect(group.answered).toBe(true);
  });

  it('stays answered once answered, whatever joins or unanswers after', () => {
    let answered = true;
    const group = new ReadGroup();
    group.join(() => answered);
    expect(group.answered).toBe(true);

    answered = false;
    group.join(() => false);
    expect(group.answered).toBe(true);
  });

  it('answers at once with no members and nothing of its own to wait on', () => {
    expect(new ReadGroup().answered).toBe(true);
  });

  it('is not shown until told, even once answered', () => {
    const group = new ReadGroup();
    expect(group.answered).toBe(true);
    expect(group.shown).toBe(false);
    group.show();
    expect(group.shown).toBe(true);
  });

  it('holds a panel transition until the group is shown', () => {
    const group = new ReadGroup();
    expect(heldByReadGroup(group)).toBe(true);
    group.show();
    expect(heldByReadGroup(group)).toBe(false);
    expect(heldByReadGroup(undefined)).toBe(false);
  });
});
