import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from './db';
import { computeStats } from './DailyRecordService';
import type { WorkoutSession } from './types';
import { BackupFormatError, WorkoutStorage } from './WorkoutStorage';

let n = 0;
function session(p: Partial<WorkoutSession> = {}): WorkoutSession {
  const id = p.id ?? `s${++n}`;
  return {
    id,
    startedAt: '2026-11-20T01:00:00.000Z',
    endedAt: null,
    date: '2026-11-20',
    autoReps: 0,
    manualAdjustment: 0,
    finalReps: 0,
    status: 'active',
    groupId: id,
    mode: 'auto',
    updatedAt: '2026-11-20T01:00:00.000Z',
    ...p,
  };
}

let storage: WorkoutStorage;
beforeEach(async () => {
  await closeDb();
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase('squat-tracker');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
  storage = new WorkoutStorage();
});

describe('WorkoutStorage', () => {
  it('같은 날 여러 세션을 합산하고 100회에서 목표 달성', async () => {
    await storage.saveSession(session({ autoReps: 60 }));
    let r = await storage.saveSession(session({ autoReps: 39 }));
    expect(r.totalReps).toBe(99);
    expect(r.goalCompleted).toBe(false);
    r = await storage.saveSession(session({ autoReps: 5 }));
    expect(r.totalReps).toBe(104); // 초과분도 저장
    expect(r.goalCompleted).toBe(true);
  });

  it('같은 세션을 여러 번 저장해도 중복 집계하지 않는다', async () => {
    const s = session({ autoReps: 10 });
    await storage.saveSession(s);
    await storage.saveSession(s);
    await storage.saveSession({ ...s, autoReps: 11 });
    expect((await storage.getDaily('2026-11-20'))!.totalReps).toBe(11);
  });

  it('수동 보정을 반영하고 음수가 되지 않는다', async () => {
    await storage.saveSession(session({ autoReps: 10, manualAdjustment: -3 }));
    await storage.saveSession(session({ autoReps: 1, manualAdjustment: -5 }));
    expect((await storage.getDaily('2026-11-20'))!.totalReps).toBe(7);
  });

  it('다른 날짜 기록은 분리된다', async () => {
    await storage.saveSession(session({ autoReps: 10 }));
    await storage.saveSession(session({ autoReps: 20, date: '2026-11-21' }));
    expect((await storage.getDaily('2026-11-20'))!.totalReps).toBe(10);
    expect((await storage.getDaily('2026-11-21'))!.totalReps).toBe(20);
  });

  it('새 연결(새로고침)에서도 기록이 유지되고, 끊긴 세션은 interrupted 로 정리된다', async () => {
    await storage.saveSession(session({ id: 'x', autoReps: 42, status: 'active' }));
    await closeDb();
    const fresh = new WorkoutStorage();
    expect((await fresh.getDaily('2026-11-20'))!.totalReps).toBe(42);
    expect(await fresh.closeDanglingSessions()).toBe(1);
    const [s] = await fresh.getSessionsByDate('2026-11-20');
    expect(s.status).toBe('interrupted');
    expect(s.finalReps).toBe(42);
  });

  it('내보내기 → 초기화 → 가져오기로 복원', async () => {
    await storage.saveSession(session({ autoReps: 100, manualAdjustment: 2, date: '2026-11-18' }));
    await storage.saveSession(session({ autoReps: 30, date: '2026-11-19' }));
    const backup = JSON.parse(JSON.stringify(await storage.exportData()));
    await storage.clearAll();
    expect(await storage.getAllDaily()).toHaveLength(0);
    const res = await storage.importData(backup);
    expect(res.sessions).toBe(2);
    const daily = await storage.getAllDaily();
    expect(daily.find((d) => d.date === '2026-11-18')).toMatchObject({ totalReps: 102, goalCompleted: true });
    expect(daily.find((d) => d.date === '2026-11-19')).toMatchObject({ totalReps: 30 });
  });

  it('같은 백업을 두 번 가져와도 중복되지 않는다', async () => {
    await storage.saveSession(session({ autoReps: 50 }));
    const backup = await storage.exportData();
    await storage.importData(backup);
    await storage.importData(backup);
    expect((await storage.getDaily('2026-11-20'))!.totalReps).toBe(50);
  });

  it('세션 없이 일별 합계만 있는 백업도 보존', async () => {
    await storage.importData({
      app: 'squat-tracker',
      version: 1,
      exportedAt: '',
      sessions: [],
      dailyRecords: [{ date: '2026-10-01', totalReps: 120, goalCompleted: true, updatedAt: '2026-10-01T00:00:00Z' }],
    });
    await storage.importData({
      app: 'squat-tracker',
      version: 1,
      exportedAt: '',
      sessions: [],
      dailyRecords: [{ date: '2026-10-01', totalReps: 120, goalCompleted: true, updatedAt: '2026-10-01T00:00:00Z' }],
    });
    expect((await storage.getDaily('2026-10-01'))!.totalReps).toBe(120);
  });

  it('잘못된 파일은 거부', async () => {
    await expect(storage.importData({ foo: 1 })).rejects.toBeInstanceOf(BackupFormatError);
    await expect(
      storage.importData({ app: 'squat-tracker', version: 1, sessions: [{ id: 'a' }], dailyRecords: [] }),
    ).rejects.toBeInstanceOf(BackupFormatError);
  });
});

describe('통계', () => {
  const rec = (date: string, totalReps: number) => ({ date, totalReps, goalCompleted: totalReps >= 100, updatedAt: '' });
  it('오늘·이번 달·누적·연속 달성', () => {
    const records = [
      rec('2026-10-30', 100),
      rec('2026-10-31', 100),
      rec('2026-11-01', 150),
      rec('2026-11-03', 100),
      rec('2026-11-20', 100),
      rec('2026-11-21', 120),
      rec('2026-11-22', 100),
      rec('2026-11-23', 40),
    ];
    const s = computeStats(records, '2026-11-23');
    expect(s.todayReps).toBe(40);
    expect(s.monthGoalDays).toBe(5);
    expect(s.totalReps).toBe(810);
    expect(s.currentStreak).toBe(3); // 오늘은 아직 진행 중 — 어제까지의 연속
    expect(s.longestStreak).toBe(3);
  });

  it('오늘 달성하면 오늘까지 포함, 하루 빠지면 끊김', () => {
    expect(computeStats([rec('2026-11-22', 100), rec('2026-11-23', 100)], '2026-11-23').currentStreak).toBe(2);
    expect(computeStats([rec('2026-11-21', 100), rec('2026-11-23', 10)], '2026-11-23').currentStreak).toBe(0);
  });

  it('월 경계를 넘는 연속 기록', () => {
    const s = computeStats([rec('2026-10-31', 100), rec('2026-11-01', 100), rec('2026-11-02', 100)], '2026-11-02');
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
  });
});
