import { DAILY_GOAL, type DailyRecord } from '../core/storage/types';
import type { CharacterId } from './index';

/**
 * 캐릭터 성장 규칙.
 * 지금까지 모은 포도알(하루 목표 100회를 달성한 날) 수로 단계가 정해진다.
 * 기록에서 매번 계산하므로 별도 저장값이 없고, 백업을 가져와도 단계가 맞게 복원된다.
 * 기준을 바꿀 때는 이 표만 수정한다.
 */
export const GROWTH_STAGES: { stage: number; character: CharacterId; minGrapes: number }[] = [
  { stage: 1, character: '1', minGrapes: 0 },
  { stage: 2, character: '2', minGrapes: 100 },
  { stage: 3, character: '3', minGrapes: 200 },
];

export interface Growth {
  stage: number;
  character: CharacterId;
  grapes: number;
  /** 다음 단계 정보. 마지막 단계면 null */
  next: { stage: number; minGrapes: number; remaining: number; progress: number } | null;
}

export function computeGrowth(records: Pick<DailyRecord, 'totalReps'>[]): Growth {
  const grapes = records.filter((r) => r.totalReps >= DAILY_GOAL).length;
  let i = 0;
  for (let k = 0; k < GROWTH_STAGES.length; k++) if (grapes >= GROWTH_STAGES[k].minGrapes) i = k;
  const cur = GROWTH_STAGES[i];
  const nxt = GROWTH_STAGES[i + 1];
  return {
    stage: cur.stage,
    character: cur.character,
    grapes,
    next: nxt
      ? {
          stage: nxt.stage,
          minGrapes: nxt.minGrapes,
          remaining: nxt.minGrapes - grapes,
          progress: (grapes - cur.minGrapes) / (nxt.minGrapes - cur.minGrapes),
        }
      : null,
  };
}
