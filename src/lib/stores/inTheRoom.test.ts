import { describe, expect, it } from 'vitest';
import { holdRoomAnswers, restoreRoomAnswers, roomAnswersFor } from './inTheRoom';
import type { DebriefAnswer } from '../data/journal/debriefNote';

const answer = (question: string, text: string) => ({ question, answer: text });

const hold = (appointmentId: string, answers: DebriefAnswer[], byItemId: Record<string, string>) =>
  holdRoomAnswers({ appointmentId, answers, byItemId });

describe('what was jotted in the room', () => {
  it('has nothing for an appointment nobody sat through', () => {
    expect(roomAnswersFor('never-opened')).toEqual([]);
  });

  it('hands back what was held for that appointment', () => {
    hold('appt-1', [answer('Ask about the dose', 'staying as it is')], { 'item-1': 'staying as it is' });
    expect(roomAnswersFor('appt-1')).toEqual([answer('Ask about the dose', 'staying as it is')]);
  });

  it('reads the same answers twice, so a discarded debrief can be taken up again', () => {
    hold('appt-1', [answer('Ask about the dose', 'staying as it is')], { 'item-1': 'staying as it is' });
    expect(roomAnswersFor('appt-1')).toHaveLength(1);
    expect(roomAnswersFor('appt-1')).toHaveLength(1);
  });

  it("never surfaces one appointment's answers in another's debrief", () => {
    hold('appt-1', [answer('Ask about the dose', 'staying as it is')], { 'item-1': 'staying as it is' });
    expect(roomAnswersFor('appt-2')).toEqual([]);
  });

  it('holds one visit at a time', () => {
    hold('appt-1', [answer('Ask about the dose', 'staying as it is')], { 'item-1': 'staying as it is' });
    hold('appt-2', [answer('Bloods', 'in a month')], { 'item-2': 'in a month' });
    expect(roomAnswersFor('appt-1')).toEqual([]);
    expect(roomAnswersFor('appt-2')).toEqual([answer('Bloods', 'in a month')]);
  });
});

describe('restoring what a remounted room screen held', () => {
  it('has nothing for an appointment nobody sat through', () => {
    expect(restoreRoomAnswers('never-opened', ['item-1'])).toEqual({});
  });

  it('hands back the held answer under its own item id', () => {
    hold('appt-1', [answer('Ask about the dose', 'staying as it is')], { 'item-1': 'staying as it is' });
    expect(restoreRoomAnswers('appt-1', ['item-1'])).toEqual({ 'item-1': 'staying as it is' });
  });

  it('drops an answer whose item is gone rather than moving it to another one', () => {
    hold('appt-1', [answer('Ask about the dose', 'staying as it is')], { 'item-1': 'staying as it is' });
    // The item that held this answer was deleted; only 'item-2' remains.
    expect(restoreRoomAnswers('appt-1', ['item-2'])).toEqual({});
  });

  it('matches by id regardless of the order ids are asked for', () => {
    hold('appt-1', [], {
      'item-1': 'first answer',
      'item-2': 'second answer'
    });
    expect(restoreRoomAnswers('appt-1', ['item-2', 'item-1'])).toEqual({
      'item-1': 'first answer',
      'item-2': 'second answer'
    });
  });

  it("never surfaces one appointment's local answers in another's room", () => {
    hold('appt-1', [], { 'item-1': 'staying as it is' });
    expect(restoreRoomAnswers('appt-2', ['item-1'])).toEqual({});
  });
});
