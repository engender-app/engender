import { describe, expect, it } from 'vitest';
import { holdRoomAnswers, roomAnswersFor } from './inTheRoom';

const answer = (question: string, text: string) => ({ question, answer: text });

describe('what was jotted in the room', () => {
  it('has nothing for an appointment nobody sat through', () => {
    expect(roomAnswersFor('never-opened')).toEqual([]);
  });

  it('hands back what was held for that appointment', () => {
    holdRoomAnswers('appt-1', [answer('Ask about the dose', 'staying as it is')]);
    expect(roomAnswersFor('appt-1')).toEqual([answer('Ask about the dose', 'staying as it is')]);
  });

  it('reads the same answers twice, so a discarded debrief can be taken up again', () => {
    holdRoomAnswers('appt-1', [answer('Ask about the dose', 'staying as it is')]);
    expect(roomAnswersFor('appt-1')).toHaveLength(1);
    expect(roomAnswersFor('appt-1')).toHaveLength(1);
  });

  it('never surfaces one appointment\'s answers in another\'s debrief', () => {
    holdRoomAnswers('appt-1', [answer('Ask about the dose', 'staying as it is')]);
    expect(roomAnswersFor('appt-2')).toEqual([]);
  });

  it('holds one visit at a time', () => {
    holdRoomAnswers('appt-1', [answer('Ask about the dose', 'staying as it is')]);
    holdRoomAnswers('appt-2', [answer('Bloods', 'in a month')]);
    expect(roomAnswersFor('appt-1')).toEqual([]);
    expect(roomAnswersFor('appt-2')).toEqual([answer('Bloods', 'in a month')]);
  });
});
