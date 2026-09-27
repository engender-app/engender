import { describe, expect, it } from 'vitest';
import { distinctHandlePositions, visibleSegment } from './spanTimelineGeometry';

describe('Look back rail geometry', () => {
  it('draws equal-day history at rail edge with visible width', () => {
    expect(visibleSegment(100, 100, 100)).toEqual({ left: 97, width: 3, leftPx: 97, widthPx: 3 });
  });

  it('keeps existing band width when dates already have room', () => {
    expect(visibleSegment(20, 28, 100)).toEqual({ left: 20, width: 8, leftPx: 20, widthPx: 8 });
  });

  it('separates same-day handles at either rail edge', () => {
    expect(distinctHandlePositions(100, 100, 100)).toEqual({ start: 86, end: 100 });
    expect(distinctHandlePositions(0, 0, 100)).toEqual({ start: 0, end: 14 });
  });

  it('leaves handles alone when dates already have room', () => {
    expect(distinctHandlePositions(20, 40, 100)).toEqual({ start: 20, end: 40 });
  });
});
