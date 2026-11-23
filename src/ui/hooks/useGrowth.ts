import { useEffect, useMemo } from 'react';
import { computeGrowth, type Growth } from '../../character/growth';
import { useDailyRecords } from './useRecords';

const CACHE_KEY = 'squat.growth.stage.v1';

function cachedStage(): number {
  try {
    return Number(localStorage.getItem(CACHE_KEY)) || 1;
  } catch {
    return 1;
  }
}

/**
 * 현재 성장 단계. 기록에서 계산하며, 기록을 불러오기 전에는 마지막으로 본 단계를 보여 줘
 * 화면을 열 때 캐릭터가 바뀌어 보이지 않게 한다 (표시용 캐시일 뿐, 기준은 항상 기록).
 */
export function useGrowth(): Growth & { loaded: boolean } {
  const { records, loaded } = useDailyRecords();
  const growth = useMemo(() => computeGrowth(records), [records]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(CACHE_KEY, String(growth.stage));
    } catch {
      /* noop */
    }
  }, [loaded, growth.stage]);
  if (!loaded) {
    const stage = cachedStage();
    const c = computeGrowth([]);
    return { ...c, stage, character: String(stage) as Growth['character'], loaded };
  }
  return { ...growth, loaded };
}
