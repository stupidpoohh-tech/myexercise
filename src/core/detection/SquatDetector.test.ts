import { describe, expect, it } from 'vitest';
import { MotionScript, renderScript, scenarios, type SimulatorOptions } from '../sim/MotionSimulator';
import type { MotionFrame, RejectReason, SquatState } from '../types';
import { CalibrationManager, CALIBRATION_CONFIG } from './CalibrationManager';
import { DEFAULT_CONFIG, type DetectorConfig } from './config';
import { MotionPipeline } from './MotionPipeline';

function run(script: MotionScript, sim: Partial<SimulatorOptions> = {}, config: DetectorConfig = DEFAULT_CONFIG) {
  const pipe = new MotionPipeline(config);
  const d = pipe.detector;
  const reps: number[] = [];
  const rejected: RejectReason[] = [];
  const states: SquatState[] = [];
  const frames: MotionFrame[] = [];
  d.on('rep', (m) => reps.push(m.endedAt));
  d.on('rejected', (r) => rejected.push(r.reason));
  d.on('state', (s) => states.push(s.to));
  for (const s of renderScript(script, sim)) {
    const f = pipe.push(s);
    if (f) frames.push(f);
  }
  return { reps: reps.length, rejected, states, frames, detector: d };
}

// 기기 차이를 모사한 변형: 중력 제외 가속도 미제공, 부호 규약 반대, 민감도·샘플링 차이
const DEVICES: [string, Partial<SimulatorOptions>][] = [
  ['기본', {}],
  ['linear 미제공', { provideLinear: false }],
  ['부호 반전', { invert: true }],
  ['민감도 0.8, 50Hz', { gain: 0.8, rateHz: 50 }],
  ['민감도 1.25, 100Hz', { gain: 1.25, rateHz: 100 }],
  ['잡음 큼', { noise: 0.2, tremor: 0.25, seed: 7 }],
];

describe('SquatDetector — 자동 카운트', () => {
  for (const [name, sim] of DEVICES) {
    describe(name, () => {
      it('정상 스쿼트 10회', () => expect(run(scenarios.normal(10), sim).reps).toBe(10));
      it('느린 스쿼트 5회', () => expect(run(scenarios.slow(5), sim).reps).toBe(5));
      it('빠른 스쿼트 10회', () => expect(run(scenarios.fast(10), sim).reps).toBe(10));
      it('중간에 멈춘 스쿼트·얕은 움직임은 카운트하지 않음', () => expect(run(scenarios.stopped(), sim).reps).toBe(0));
      it('휴대폰 흔들기는 카운트하지 않음', () => expect(run(scenarios.shake(), sim).reps).toBe(0));
      it('휴대폰 방향 변경은 카운트하지 않음', () => expect(run(scenarios.rotate(), sim).reps).toBe(0));
      it('센서 중단 중의 반복은 버리고 앞뒤 반복만 카운트', () => {
        const r = run(scenarios.dropout(), sim);
        expect(r.reps).toBe(2);
        expect(r.rejected).toContain('sensor-gap');
      });
    });
  }

  it('상태는 IDLE→DESCENDING→BOTTOM→ASCENDING→COMPLETED 순서로 전이', () => {
    const r = run(new MotionScript().still(1500).squat().still(1000));
    expect(r.states).toEqual(['DESCENDING', 'BOTTOM', 'ASCENDING', 'COMPLETED', 'IDLE']);
  });

  it('1회당 rep 이벤트는 정확히 한 번 (중복 카운트 없음)', () => {
    const r = run(new MotionScript().still(1500).squat({ bottomMs: 800 }).still(3000));
    expect(r.reps).toBe(1);
    expect(r.frames.filter((f, i) => f.state === 'COMPLETED' && r.frames[i - 1]?.state !== 'COMPLETED').length).toBe(1);
  });

  it('최저 자세에서 잠깐 멈췄다 더 내려가도 1회로 인식', () => {
    const s = new MotionScript().still(1500).descend(0.2, 700).still(300).descend(0.15, 600).still(300).ascend(0.35, 1000).still(1000);
    expect(run(s).reps).toBe(1);
  });

  it('반복 사이 쉬지 않는 연속 스쿼트', () => {
    const s = new MotionScript().still(1500);
    for (let i = 0; i < 8; i++) s.squat({ downMs: 800, bottomMs: 0, upMs: 800 });
    expect(run(s.still(1000)).reps).toBe(8);
  });

  it('이상적으로 너무 빠른 반동(0.3초 이하 구간)은 제외', () => {
    const s = new MotionScript().still(1500);
    for (let i = 0; i < 6; i++) s.squat({ depth: 0.1, downMs: 180, bottomMs: 0, upMs: 180 });
    expect(run(s.still(1000)).reps).toBe(0);
  });
});

describe('보정 (CalibrationManager)', () => {
  it('3회 관찰 후 기기·사용자별 임계값과 기준 깊이를 만든다', () => {
    const cal = new CalibrationManager(3);
    const pipe = new MotionPipeline(CALIBRATION_CONFIG);
    const d = pipe.detector;
    let profile = null as ReturnType<CalibrationManager['add']>;
    d.on('rep', (m) => {
      profile = cal.add(m) ?? profile;
    });
    for (const s of renderScript(scenarios.normal(3), { gain: 0.7 })) {
      pipe.push(s);
    }
    expect(cal.done).toBe(true);
    expect(profile).not.toBeNull();
    expect(profile!.overrides.expectedDepth).toBeGreaterThan(0);
    expect(profile!.overrides.minDepth).toBeLessThan(profile!.overrides.expectedDepth!);
  });

  it('보정 후 진행도(0~1)를 제공하고, 하강 중 증가·상승 중 감소한다', () => {
    const base = run(scenarios.normal(3), {}, CALIBRATION_CONFIG);
    expect(base.frames.every((f) => f.progress === null)).toBe(true); // 보정 전에는 진행도 미제공

    const cal = new CalibrationManager(3);
    const pipe = new MotionPipeline(CALIBRATION_CONFIG);
    const d = pipe.detector;
    let prof: ReturnType<CalibrationManager['add']> = null;
    d.on('rep', (m) => (prof = cal.add(m) ?? prof));
    for (const s of renderScript(scenarios.normal(3))) {
      pipe.push(s);
    }
    const calibrated = CalibrationManager.apply(DEFAULT_CONFIG, prof);
    const r = run(new MotionScript().still(1500).squat().still(1000), { seed: 3 }, calibrated);
    expect(r.reps).toBe(1);
    const desc = r.frames.filter((f) => f.state === 'DESCENDING').map((f) => f.progress!);
    const asc = r.frames.filter((f) => f.state === 'ASCENDING').map((f) => f.progress!);
    expect(desc.every((p) => p !== null && p >= 0 && p <= 1)).toBe(true);
    expect(desc[desc.length - 1]).toBeGreaterThan(desc[0]);
    expect(asc[asc.length - 1]).toBeLessThan(asc[0]);
    expect(Math.max(...desc)).toBeGreaterThan(0.6);
  });

  it('보정 후에는 보정 깊이의 절반에 못 미치는 작은 상하 흔들기를 제외한다', () => {
    const cal = new CalibrationManager(3);
    const pipe = new MotionPipeline(CALIBRATION_CONFIG);
    let prof: ReturnType<CalibrationManager['add']> = null;
    pipe.detector.on('rep', (m) => (prof = cal.add(m) ?? prof));
    for (const s of renderScript(scenarios.normal(3))) pipe.push(s);
    const calibrated = CalibrationManager.apply(DEFAULT_CONFIG, prof);
    // 1Hz, 진폭 ±5cm — 기본값으로는 스쿼트와 구분되지 않지만 보정 후에는 제외
    const pump = new MotionScript().still(1500).shake({ freqHz: 1, amplitude: 0.05, ms: 5000 }).still(1000);
    expect(run(pump, {}, calibrated).reps).toBe(0);
    expect(run(scenarios.normal(10), {}, calibrated).reps).toBe(10);
    expect(run(scenarios.slow(5), {}, calibrated).reps).toBe(5);
    expect(run(scenarios.fast(10), {}, calibrated).reps).toBe(10);
  });
});

describe('알려진 한계 (실기기 검증 필요)', () => {
  it('스쿼트와 비슷한 크기·속도로 휴대폰을 천천히 위아래로 움직이면 구분하지 못한다', () => {
    // 1Hz, 진폭 ±10cm. 휴대폰 센서만으로는 몸 전체의 하강과 팔의 하강을 구분할 수 없다.
    const pump = new MotionScript().still(1500).shake({ freqHz: 1, amplitude: 0.1, ms: 5000 }).still(1000);
    expect(run(pump).reps).toBeGreaterThan(0);
  });
});
