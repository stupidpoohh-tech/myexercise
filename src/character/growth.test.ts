import { describe, expect, it } from 'vitest';
import { computeGrowth } from './growth';

const days = (done: number, partial = 0) => [
  ...Array.from({ length: done }, () => ({ totalReps: 100 + (done % 7) })),
  ...Array.from({ length: partial }, () => ({ totalReps: 60 })),
];

describe('캐릭터 성장', () => {
  it('포도알 0개 → 1단계', () => {
    const g = computeGrowth(days(0, 5));
    expect(g).toMatchObject({ stage: 1, character: '1', grapes: 0 });
    expect(g.next).toMatchObject({ stage: 2, remaining: 10, progress: 0 });
  });
  it('100회 미만인 날은 포도알로 세지 않는다', () => {
    expect(computeGrowth(days(9, 20)).stage).toBe(1);
  });
  it('10개 → 2단계, 30개 → 3단계(최종)', () => {
    expect(computeGrowth(days(10))).toMatchObject({ stage: 2, character: '2' });
    const g = computeGrowth(days(29));
    expect(g.stage).toBe(2);
    expect(g.next).toMatchObject({ stage: 3, remaining: 1 });
    expect(g.next!.progress).toBeCloseTo(19 / 20);
    expect(computeGrowth(days(30))).toMatchObject({ stage: 3, character: '3', next: null });
    expect(computeGrowth(days(80)).stage).toBe(3);
  });
});
