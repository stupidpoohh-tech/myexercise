import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationController } from '../animation/AnimationController';
import type { CharacterPose } from '../animation/types';
import { SensorManager, type SensorSource } from '../sensor/SensorManager';
import { MotionScript, renderScript, scenarios } from '../sim/MotionSimulator';
import { closeDb } from '../storage/db';
import { WorkoutStorage } from '../storage/WorkoutStorage';
import type { MotionSample, SquatState } from '../types';
import { WorkoutSessionManager } from './WorkoutSessionManager';

/** 테스트에서 샘플을 직접 밀어 넣는 소스 */
class ManualSource implements SensorSource {
  readonly kind = 'simulated' as const;
  private fn: ((s: MotionSample) => void) | null = null;
  start(fn: (s: MotionSample) => void) {
    this.fn = fn;
  }
  stop() {
    this.fn = null;
  }
  feed(samples: MotionSample[]) {
    samples.forEach((s) => this.fn?.(s));
  }
}

let clock: Date;
let dbSeq = 0;
function setup(opts: { calibrated?: boolean } = {}) {
  const source = new ManualSource();
  const sensor = new SensorManager(source);
  const storage = new WorkoutStorage(`test-${++dbSeq}`);
  const m = new WorkoutSessionManager({ sensor, storage, now: () => clock, wakeLock: null });
  if (!opts.calibrated) m.clearCalibration();
  let t = 0;
  const play = (script: MotionScript) => {
    const samples = renderScript(script, { seed: Math.floor(Math.random() * 1000) + 1 }, t);
    t = samples[samples.length - 1].t + 16;
    source.feed(samples);
  };
  return { m, storage, source, play };
}

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase('squat-tracker');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
  clock = new Date(2026, 10, 23, 10, 0, 0);
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.stubGlobal('window', { isSecureContext: true });
});

describe('WorkoutSessionManager', () => {
  it('보정 3회 후 자동 카운트, 매 회 저장 (보정 중 횟수도 포함)', async () => {
    const { m, storage, play } = setup();
    await m.start();
    expect(m.snapshot.phase).toBe('calibrating');
    play(scenarios.normal(3));
    expect(m.snapshot.phase).toBe('running');
    expect(m.calibrationProfile).not.toBeNull();
    play(scenarios.normal(7));
    expect(m.snapshot.sessionReps).toBe(10);
    await m.flush();
    expect((await storage.getDaily('2026-11-23'))!.totalReps).toBe(10);
  });

  it('일시정지 중 움직임은 카운트하지 않고, 재개 후 다시 카운트', async () => {
    const { m, play } = setup();
    await m.start();
    play(scenarios.normal(3));
    m.pause();
    play(scenarios.normal(5));
    expect(m.snapshot.sessionReps).toBe(3);
    m.resume();
    play(scenarios.normal(2));
    expect(m.snapshot.sessionReps).toBe(5);
  });

  it('수동 보정 +1/-1 이 기록에 반영되고 0 미만으로 내려가지 않는다', async () => {
    const { m, storage } = setup();
    await m.start({ mode: 'manual' });
    m.adjust(-1);
    expect(m.snapshot.sessionReps).toBe(0);
    for (let i = 0; i < 5; i++) m.adjust(1);
    m.adjust(-1);
    expect(m.snapshot.sessionReps).toBe(4);
    await m.end();
    expect((await storage.getDaily('2026-11-23'))!.totalReps).toBe(4);
    const [s] = await storage.getSessionsByDate('2026-11-23');
    expect(s).toMatchObject({ status: 'completed', manualAdjustment: 4, autoReps: 0, finalReps: 4 });
  });

  it('하루 여러 세션이 합산되고 오늘 횟수에 이전 세션이 포함된다', async () => {
    const { m, storage } = setup();
    await m.start({ mode: 'manual' });
    for (let i = 0; i < 60; i++) m.adjust(1);
    await m.end();
    m.reset();
    await m.start({ mode: 'manual' });
    await m.flush();
    await new Promise((r) => setTimeout(r, 10));
    for (let i = 0; i < 45; i++) m.adjust(1);
    expect(m.snapshot.todayReps).toBe(105);
    await m.end();
    const d = await storage.getDaily('2026-11-23');
    expect(d).toMatchObject({ totalReps: 105, goalCompleted: true });
  });

  it('자정을 넘기면 확정 시점의 날짜로 분리 기록', async () => {
    clock = new Date(2026, 10, 23, 23, 59, 0);
    const { m, storage, play } = setup({ calibrated: true });
    m.clearCalibration();
    await m.start();
    play(scenarios.normal(3)); // 보정
    play(scenarios.normal(2));
    clock = new Date(2026, 10, 24, 0, 0, 30);
    play(scenarios.normal(4));
    m.adjust(1);
    await m.end();
    expect((await storage.getDaily('2026-11-23'))!.totalReps).toBe(5);
    expect((await storage.getDaily('2026-11-24'))!.totalReps).toBe(5);
    const a = await storage.getSessionsByDate('2026-11-23');
    const b = await storage.getSessionsByDate('2026-11-24');
    expect(a[0].groupId).toBe(b[0].groupId);
    expect(m.snapshot.sessionReps).toBe(10);
  });

  it('저장 실패 시 오류 상태 → 재시도로 복구, 중복 집계 없음', async () => {
    const { m, storage } = setup();
    const real = storage.saveSession.bind(storage);
    let fail = true;
    vi.spyOn(storage, 'saveSession').mockImplementation((s) => (fail ? Promise.reject(new Error('disk')) : real(s)));
    (m as unknown as { autoRetries: number }).autoRetries = 0;
    await m.start({ mode: 'manual' });
    m.adjust(1);
    m.adjust(1);
    await m.flush();
    expect(m.snapshot.save.status).toBe('error');
    fail = false;
    await m.retrySave();
    await m.retrySave();
    expect(m.snapshot.save.status).toBe('idle');
    expect((await storage.getDaily('2026-11-23'))!.totalReps).toBe(2);
  });

  it('센서 수신 중단 시 진행 중이던 반복을 버린다', async () => {
    const { m, play } = setup();
    await m.start();
    play(scenarios.normal(3));
    play(scenarios.dropout());
    expect(m.snapshot.sessionReps).toBe(5);
  });
});

describe('애니메이션 연동', () => {
  it('캐릭터 상태가 센서 판정 상태와 일치하고, 하강 시 내려가고 상승 시 올라온다', async () => {
    const { m, play } = setup();
    let rafCb: ((t: number) => void) | null = null;
    const anim = new AnimationController({}, (cb) => ((rafCb = cb), 1), () => {});
    anim.connect(m.feed);
    const poses: CharacterPose[] = [];
    const events: string[] = [];
    anim.attach({ mount() {}, render: (p) => poses.push(p), onEvent: (e) => events.push(e.type), destroy() {} });

    const detectorStates: SquatState[] = [];
    m.on('frame', (f) => {
      detectorStates.push(f.state);
      // 프레임마다 렌더 루프 1스텝 (16ms)
      const cb = rafCb;
      rafCb = null;
      cb?.(f.t);
    });
    await m.start();
    play(scenarios.normal(3)); // 보정 → 이후 진행도 제공
    poses.length = 0;
    detectorStates.length = 0;
    play(new MotionScript().still(800).squat().still(800));

    // 렌더러가 받은 상태 == 같은 시점 센서 판정 상태
    expect(poses.length).toBeGreaterThan(50);
    for (let i = 0; i < poses.length; i++) expect(poses[i].state).toBe(detectorStates[i]);
    const by = (s: SquatState) => poses.filter((p) => p.state === s).map((p) => p.depth);
    const desc = by('DESCENDING');
    const asc = by('ASCENDING');
    expect(desc[desc.length - 1]).toBeGreaterThan(desc[0]);
    expect(Math.max(...by('BOTTOM'))).toBeGreaterThan(0.6);
    expect(asc[asc.length - 1]).toBeLessThan(asc[0]);
    expect(events).toContain('rep');
    expect(poses[poses.length - 1].reps).toBe(4);
    expect(poses[poses.length - 1].depth).toBeLessThan(0.1);
  });

  it('잘못된 움직임(흔들기)에서는 카운트도 캐릭터 완료 이벤트도 없다', async () => {
    const { m, play } = setup();
    const anim = new AnimationController({}, () => 1, () => {});
    anim.connect(m.feed);
    const events: string[] = [];
    anim.attach({ mount() {}, render() {}, onEvent: (e) => events.push(e.type), destroy() {} });
    await m.start();
    play(scenarios.normal(3));
    events.length = 0;
    play(scenarios.shake());
    expect(m.snapshot.sessionReps).toBe(3);
    expect(events).not.toContain('rep');
  });

  it('진행도를 모르면(보정 전) 상태만으로 움직이고 최저 자세를 과장하지 않는다', () => {
    const anim = new AnimationController({}, () => 1, () => {});
    anim.setFrame({ t: 0, state: 'DESCENDING', progress: null, velocity: 0, accel: 0, shake: 0 });
    let p = anim.step(16);
    for (let i = 0; i < 100; i++) p = anim.step(16);
    expect(p.progressKnown).toBe(false);
    expect(p.depth).toBeLessThan(0.9);
    anim.setFrame({ t: 0, state: 'ASCENDING', progress: null, velocity: 0, accel: 0, shake: 0 });
    for (let i = 0; i < 100; i++) p = anim.step(16);
    expect(p.depth).toBe(0);
  });
});
