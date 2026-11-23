import { addDays, dateKey } from '../util/date';
import { DAILY_GOAL, type DailyRecord } from './types';

export type DayStatus = 'none' | 'progress' | 'done';

export function dayStatus(r: DailyRecord | undefined | null): DayStatus {
  if (!r || r.totalReps <= 0) return 'none';
  return r.totalReps >= DAILY_GOAL ? 'done' : 'progress';
}

export interface Stats {
  todayReps: number;
  monthGoalDays: number;
  totalReps: number;
  currentStreak: number;
  longestStreak: number;
}

/**
 * 통계 계산 (순수 함수).
 * 현재 연속 달성일: 오늘 달성했으면 오늘부터, 아직이면 어제부터 거꾸로 센다
 * (오늘 운동 전이라고 연속 기록이 끊긴 것으로 보지 않는다).
 */
export function computeStats(records: DailyRecord[], today = dateKey(), monthPrefix = today.slice(0, 7)): Stats {
  const map = new Map(records.map((r) => [r.date, r]));
  const done = (d: string) => (map.get(d)?.totalReps ?? 0) >= DAILY_GOAL;

  let currentStreak = 0;
  let cursor = done(today) ? today : addDays(today, -1);
  while (done(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  const doneDates = records.filter((r) => r.totalReps >= DAILY_GOAL).map((r) => r.date).sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of doneDates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = d;
  }

  return {
    todayReps: map.get(today)?.totalReps ?? 0,
    monthGoalDays: doneDates.filter((d) => d.startsWith(monthPrefix)).length,
    totalReps: records.reduce((s, r) => s + r.totalReps, 0),
    currentStreak,
    longestStreak,
  };
}

export function lastNDays(n: number, today = dateKey()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
