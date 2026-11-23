import { useCallback, useEffect, useState } from 'react';
import type { DailyRecord } from '../../core/storage/types';
import { dateKey } from '../../core/util/date';
import { storage, workout } from '../../services';

/** 화면에 열려 있는 모든 기록 구독자 — 가져오기 등으로 기록이 바뀌면 함께 다시 읽는다 */
const reloaders = new Set<() => void>();

/** 일별 기록 전체. 저장될 때마다 갱신 */
export function useDailyRecords(): { records: DailyRecord[]; error: string | null; reload: () => void; loaded: boolean } {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    storage
      .getAllDaily()
      .then((r) => {
        setRecords(r);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, []);
  const reload = useCallback(() => reloaders.forEach((fn) => fn()), []);
  useEffect(() => {
    load();
    reloaders.add(load);
    const off = workout.on('saved', (rec) => {
      setRecords((prev) => {
        const rest = prev.filter((r) => r.date !== rec.date);
        return rec.totalReps > 0 ? [...rest, rec] : rest;
      });
    });
    return () => {
      reloaders.delete(load);
      off();
    };
  }, [load]);
  return { records, error, reload, loaded };
}

/** 현재 날짜 키 (자정이 지나면 갱신) */
export function useToday(): string {
  const [today, setToday] = useState(() => dateKey());
  useEffect(() => {
    const id = setInterval(() => setToday(dateKey()), 30_000);
    const onVis = () => setToday(dateKey());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return today;
}
