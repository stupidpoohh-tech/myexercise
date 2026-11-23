import { isValidKey } from '../util/date';
import { openDb, reqToPromise, STORES, txDone } from './db';
import { computeFinalReps, DAILY_GOAL, type BackupFile, type DailyRecord, type WorkoutSession } from './types';

/**
 * IndexedDB 저장소.
 *
 * 중복 집계 방지 원칙: DailyRecord.totalReps 는 '증가 연산'으로 갱신하지 않고,
 * 같은 트랜잭션 안에서 해당 날짜의 모든 세션 finalReps 합으로 매번 다시 계산한다.
 * 같은 세션을 몇 번 저장하든(재시도·중복 이벤트) 결과가 같다.
 */
export class WorkoutStorage {
  constructor(private dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDb(this.dbName);
  }

  /** 세션 상태를 저장하고 해당 날짜의 일별 기록을 재계산한다 */
  async saveSession(session: WorkoutSession): Promise<DailyRecord> {
    const db = await this.db();
    const tx = db.transaction([STORES.sessions, STORES.daily], 'readwrite');
    const sessions = tx.objectStore(STORES.sessions);
    const daily = tx.objectStore(STORES.daily);
    const normalized: WorkoutSession = {
      ...session,
      finalReps: computeFinalReps(session.autoReps, session.manualAdjustment),
    };
    sessions.put(normalized);
    const record = await this.recomputeInTx(sessions, daily, session.date);
    await txDone(tx);
    return record;
  }

  private async recomputeInTx(sessions: IDBObjectStore, daily: IDBObjectStore, date: string): Promise<DailyRecord> {
    const list = (await reqToPromise(sessions.index('date').getAll(date))) as WorkoutSession[];
    const total = list.reduce((s, x) => s + computeFinalReps(x.autoReps, x.manualAdjustment), 0);
    const record: DailyRecord = {
      date,
      totalReps: total,
      goalCompleted: total >= DAILY_GOAL,
      updatedAt: new Date().toISOString(),
    };
    if (total === 0 && list.length === 0) daily.delete(date);
    else daily.put(record);
    return record;
  }

  async getDaily(date: string): Promise<DailyRecord | null> {
    const db = await this.db();
    const tx = db.transaction(STORES.daily, 'readonly');
    const r = (await reqToPromise(tx.objectStore(STORES.daily).get(date))) as DailyRecord | undefined;
    return r ?? null;
  }

  async getAllDaily(): Promise<DailyRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.daily, 'readonly');
    return (await reqToPromise(tx.objectStore(STORES.daily).getAll())) as DailyRecord[];
  }

  async getSessionsByDate(date: string): Promise<WorkoutSession[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.sessions, 'readonly');
    const list = (await reqToPromise(tx.objectStore(STORES.sessions).index('date').getAll(date))) as WorkoutSession[];
    return list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async getAllSessions(): Promise<WorkoutSession[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.sessions, 'readonly');
    return (await reqToPromise(tx.objectStore(STORES.sessions).getAll())) as WorkoutSession[];
  }

  /**
   * 이전 실행에서 정상 종료되지 않은 세션(새로고침·앱 종료)을 'interrupted' 로 정리한다.
   * 횟수는 rep 마다 저장되어 있으므로 그대로 유지된다.
   */
  async closeDanglingSessions(exceptId?: string): Promise<number> {
    const all = await this.getAllSessions();
    const dangling = all.filter((s) => (s.status === 'active' || s.status === 'paused') && s.id !== exceptId);
    for (const s of dangling) {
      await this.saveSession({ ...s, status: 'interrupted', endedAt: s.endedAt ?? s.updatedAt });
    }
    return dangling.length;
  }

  async exportData(): Promise<BackupFile> {
    const [sessions, dailyRecords] = await Promise.all([this.getAllSessions(), this.getAllDaily()]);
    return {
      app: 'squat-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      dailyRecords: dailyRecords.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * 백업 파일을 병합한다. 세션은 id 로 중복 제거(더 최근 updatedAt 우선)하고,
   * 일별 기록은 세션에서 다시 계산한다. 세션 없이 일별 기록만 있는 날짜는
   * 기존 값과 비교해 큰 값을 '가져온 기록' 세션으로 보존한다.
   */
  async importData(raw: unknown): Promise<{ sessions: number; dates: number }> {
    const file = validateBackup(raw);
    const db = await this.db();
    const tx = db.transaction([STORES.sessions, STORES.daily], 'readwrite');
    const sessions = tx.objectStore(STORES.sessions);
    const daily = tx.objectStore(STORES.daily);
    const dates = new Set<string>();
    let imported = 0;

    for (const s of file.sessions) {
      const existing = (await reqToPromise(sessions.get(s.id))) as WorkoutSession | undefined;
      if (!existing || existing.updatedAt < s.updatedAt) {
        sessions.put({ ...s, finalReps: computeFinalReps(s.autoReps, s.manualAdjustment) });
        imported++;
      }
      dates.add(s.date);
    }

    // 세션 정보 없이 일별 합계만 있는 경우 (다른 버전·수기 편집 등)
    const sessionDates = new Set(file.sessions.map((s) => s.date));
    for (const d of file.dailyRecords) {
      if (sessionDates.has(d.date)) continue;
      const list = (await reqToPromise(sessions.index('date').getAll(d.date))) as WorkoutSession[];
      const current = list.reduce((a, x) => a + computeFinalReps(x.autoReps, x.manualAdjustment), 0);
      if (d.totalReps > current) {
        const id = `import-${d.date}`;
        const t = `${d.date}T12:00:00.000Z`;
        sessions.put({
          id,
          startedAt: t,
          endedAt: t,
          date: d.date,
          autoReps: 0,
          manualAdjustment: d.totalReps - current + (list.find((x) => x.id === id)?.manualAdjustment ?? 0),
          finalReps: 0,
          status: 'completed',
          groupId: id,
          mode: 'manual',
          updatedAt: new Date().toISOString(),
        } satisfies WorkoutSession);
        imported++;
      }
      dates.add(d.date);
    }

    for (const date of dates) await this.recomputeInTx(sessions, daily, date);
    await txDone(tx);
    return { sessions: imported, dates: dates.size };
  }

  /** 모든 기록 삭제 (가져오기 전 초기화 등) */
  async clearAll(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORES.sessions, STORES.daily], 'readwrite');
    tx.objectStore(STORES.sessions).clear();
    tx.objectStore(STORES.daily).clear();
    await txDone(tx);
  }
}

export class BackupFormatError extends Error {}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function validateBackup(raw: unknown): BackupFile {
  const f = raw as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object' || f.app !== 'squat-tracker' || f.version !== 1) {
    throw new BackupFormatError('스쿼트 기록 백업 파일이 아닙니다.');
  }
  if (!Array.isArray(f.sessions) || !Array.isArray(f.dailyRecords)) {
    throw new BackupFormatError('백업 파일 구조가 올바르지 않습니다.');
  }
  const statuses = new Set(['active', 'paused', 'completed', 'interrupted']);
  const sessions: WorkoutSession[] = f.sessions.map((s, i) => {
    if (
      !s ||
      typeof s.id !== 'string' ||
      !s.id ||
      !isIso(s.startedAt) ||
      !(s.endedAt === null || isIso(s.endedAt)) ||
      !isValidKey(s.date) ||
      !isInt(s.autoReps) ||
      s.autoReps < 0 ||
      !isInt(s.manualAdjustment) ||
      !statuses.has(s.status)
    ) {
      throw new BackupFormatError(`세션 ${i + 1}번 항목이 올바르지 않습니다.`);
    }
    return {
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      date: s.date,
      autoReps: s.autoReps,
      manualAdjustment: s.manualAdjustment,
      finalReps: computeFinalReps(s.autoReps, s.manualAdjustment),
      // 가져온 세션은 진행 중일 수 없다
      status: s.status === 'active' || s.status === 'paused' ? 'interrupted' : s.status,
      groupId: typeof s.groupId === 'string' && s.groupId ? s.groupId : s.id,
      mode: s.mode === 'manual' ? 'manual' : 'auto',
      updatedAt: isIso(s.updatedAt) ? s.updatedAt : s.endedAt ?? s.startedAt,
    };
  });
  const dailyRecords: DailyRecord[] = f.dailyRecords.map((d, i) => {
    if (!d || !isValidKey(d.date) || !isInt(d.totalReps) || d.totalReps < 0) {
      throw new BackupFormatError(`일별 기록 ${i + 1}번 항목이 올바르지 않습니다.`);
    }
    return {
      date: d.date,
      totalReps: d.totalReps,
      goalCompleted: d.totalReps >= DAILY_GOAL,
      updatedAt: isIso(d.updatedAt) ? d.updatedAt : new Date().toISOString(),
    };
  });
  return { app: 'squat-tracker', version: 1, exportedAt: f.exportedAt ?? '', sessions, dailyRecords };
}
