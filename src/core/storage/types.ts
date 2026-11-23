export const DAILY_GOAL = 100;

export interface DailyRecord {
  /** 현지 날짜 YYYY-MM-DD */
  date: string;
  totalReps: number;
  goalCompleted: boolean;
  /** ISO 시각 */
  updatedAt: string;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'interrupted';

export interface WorkoutSession {
  id: string;
  /** ISO 시각 */
  startedAt: string;
  endedAt: string | null;
  /** 횟수가 확정된 현지 날짜 */
  date: string;
  /** 센서 자동 인식 횟수 */
  autoReps: number;
  /** 수동 보정 (+/-) */
  manualAdjustment: number;
  /** max(0, autoReps + manualAdjustment) */
  finalReps: number;
  status: SessionStatus;
  /** 자정을 넘겨 나뉜 세션들을 묶는 ID */
  groupId: string;
  /** 'auto' 센서 사용 / 'manual' 수동 전용 */
  mode: 'auto' | 'manual';
  updatedAt: string;
}

export interface BackupFile {
  app: 'squat-tracker';
  version: 1;
  exportedAt: string;
  sessions: WorkoutSession[];
  dailyRecords: DailyRecord[];
}

export function computeFinalReps(autoReps: number, manualAdjustment: number): number {
  return Math.max(0, autoReps + manualAdjustment);
}
