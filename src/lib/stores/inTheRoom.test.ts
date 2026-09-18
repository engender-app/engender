import { describe, expect, it } from 'vitest';
import { holdRoomAnswers, restoreRoomAnswers, roomAnswersFor } from './inTheRoom';
import type { DebriefAnswer } from '../data/journal/debriefNote';

const answer = (question: string, text: string) => ({ question, answer: text });

describe('what was jotted in the room', () => {
  it('has nothing for an appointment nobody sat through', () => {
    expect(roomAnswersFor('never-opened')).toEqual([]);
  });

  it('hands back what was held for that appointment', () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    expect(roomAnswersFor('appt-1')).toEqual([answer('Ask about the dose', 'staying as it is')]);
  });

  it('reads the same answers twice, so a discarded debrief can be taken up again', () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    expect(roomAnswersFor('appt-1')).toHaveLength(1);
    expect(roomAnswersFor('appt-1')).toHaveLength(1);
  });

  it("never surfaces one appointment's answers in another's debrief", () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    expect(roomAnswersFor('appt-2')).toEqual([]);
  });

  it('holds both visits of one day, each under its own appointment', () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    holdRoomAnswers({ appointmentId: 'appt-2', answers: [answer('Bloods', 'in a month')], byItemId: { 'item-2': 'in a month' } });
    expect(roomAnswersFor('appt-1')).toEqual([answer('Ask about the dose', 'staying as it is')]);
    expect(roomAnswersFor('appt-2')).toEqual([answer('Bloods', 'in a month')]);
  });

  it('keeps a deleted appointment\'s answers out of the other visit\'s debrief', () => {
    holdRoomAnswers({ appointmentId: 'deleted', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    holdRoomAnswers({ appointmentId: 'remaining', answers: [], byItemId: {} });
    expect(roomAnswersFor('remaining')).toEqual([]);
    expect(restoreRoomAnswers('remaining', ['item-1'])).toEqual({});
  });
});

describe('restoring what a remounted room screen held', () => {
  it('has nothing for an appointment nobody sat through', () => {
    expect(restoreRoomAnswers('never-opened', ['item-1'])).toEqual({});
  });

  it('hands back the held answer under its own item id', () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    expect(restoreRoomAnswers('appt-1', ['item-1'])).toEqual({ 'item-1': 'staying as it is' });
  });

  it('drops an answer whose item is gone rather than moving it to another one', () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [answer('Ask about the dose', 'staying as it is')], byItemId: { 'item-1': 'staying as it is' } });
    // The item that held this answer was deleted; only 'item-2' remains.
    expect(restoreRoomAnswers('appt-1', ['item-2'])).toEqual({});
  });

  it('matches by id regardless of the order ids are asked for', () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [], byItemId: {
      'item-1': 'first answer',
      'item-2': 'second answer'
    }});
    expect(restoreRoomAnswers('appt-1', ['item-2', 'item-1'])).toEqual({
      'item-1': 'first answer',
      'item-2': 'second answer'
    });
  });

  it("never surfaces one appointment's local answers in another's room", () => {
    holdRoomAnswers({ appointmentId: 'appt-1', answers: [], byItemId: { 'item-1': 'staying as it is' } });
    expect(restoreRoomAnswers('appt-2', ['item-1'])).toEqual({});
  });
});
