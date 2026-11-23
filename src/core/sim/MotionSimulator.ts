import type { MotionSample, Vec3 } from '../types';

/**
 * 개발·테스트용 가상 움직임 생성기.
 * 실제 센서 없이도 SquatDetector 와 애니메이션 상태를 검증할 수 있도록
 * DeviceMotionEvent 와 같은 형태(MotionSample)의 샘플을 만든다.
 *
 * 단순화된 물리 모델이므로, 실제 기기 인식 정확도를 대신 검증하지는 못한다.
 */

const G = 9.80665;

interface SegmentPoint {
  /** 수직 선형 가속도 (m/s², 위 +) */
  a: number;
  /** 기기 기울기 추가 회전 (deg, x축 기준) */
  tiltDeg?: number;
  /** 회전 속도 (deg/s) */
  rot?: number;
  /** 수평 가속도 (흔들기 등) */
  lateral?: number;
}

interface Segment {
  durationMs: number;
  at: (tMs: number) => SegmentPoint;
  /** true 면 이 구간 동안 샘플을 내보내지 않는다 (센서 수신 중단) */
  dropout?: boolean;
}

export interface SimulatorOptions {
  rateHz: number;
  /** 가속도 센서 백색 잡음 표준편차 (m/s²) */
  noise: number;
  /** 손떨림(8~10Hz) 진폭 (m/s²) */
  tremor: number;
  /** 기기 기본 기울기 (deg) — 가슴 앞에 세로로 들고 화면이 약간 위를 향함 */
  baseTiltDeg: number;
  /** acc(중력 제외) 제공 여부 */
  provideLinear: boolean;
  /** 가속도 센서 배율 (기기별 민감도 차이 모사) */
  gain: number;
  /** 부호 반전 (일부 플랫폼 규약 차이 모사) */
  invert: boolean;
  seed: number;
}

export const DEFAULT_SIM_OPTIONS: SimulatorOptions = {
  rateHz: 60,
  noise: 0.08,
  tremor: 0.12,
  baseTiltDeg: 20,
  provideLinear: true,
  gain: 1,
  invert: false,
  seed: 1,
};

export class MotionScript {
  readonly segments: Segment[] = [];

  /** 가만히 서 있기 */
  still(ms: number): this {
    this.segments.push({ durationMs: ms, at: () => ({ a: 0 }) });
    return this;
  }

  /** 정상 스쿼트 1회 (depth m, 하강/최저/상승 ms) */
  squat(opts: { depth?: number; downMs?: number; bottomMs?: number; upMs?: number } = {}): this {
    const D = opts.depth ?? 0.35;
    const down = opts.downMs ?? 1000;
    const bottom = opts.bottomMs ?? 150;
    const up = opts.upMs ?? 1000;
    this.descend(D, down);
    if (bottom > 0) this.still(bottom);
    this.ascend(D, up);
    return this;
  }

  /** 하강만 */
  descend(depth: number, ms: number): this {
    const w = Math.PI / (ms / 1000);
    this.segments.push({ durationMs: ms, at: (t) => ({ a: (-depth / 2) * w * w * Math.cos(w * (t / 1000)) }) });
    return this;
  }

  /** 상승만 */
  ascend(depth: number, ms: number): this {
    const w = Math.PI / (ms / 1000);
    this.segments.push({ durationMs: ms, at: (t) => ({ a: (depth / 2) * w * w * Math.cos(w * (t / 1000)) }) });
    return this;
  }

  /** 휴대폰 상하 흔들기 (진폭 m, 주파수 Hz) */
  shake(opts: { amplitude?: number; freqHz?: number; ms?: number; lateral?: boolean } = {}): this {
    const A = opts.amplitude ?? 0.08;
    const f = opts.freqHz ?? 4;
    const w = 2 * Math.PI * f;
    const lateral = opts.lateral ?? false;
    // 정수 주기로 맞춰 시작·끝 속도가 0이 되게 한다 (변위 x = A(cos wt − 1))
    const cycles = Math.max(1, Math.round(((opts.ms ?? 2000) / 1000) * f));
    this.segments.push({
      durationMs: (cycles / f) * 1000,
      at: (t) => {
        const acc = -A * w * w * Math.cos(w * (t / 1000));
        return lateral ? { a: acc * 0.15, lateral: acc, rot: 60 } : { a: acc, rot: 40 };
      },
    });
    return this;
  }

  /** 휴대폰 방향 바꾸기 (deg 만큼 기울이기) */
  rotate(deg: number, ms: number): this {
    const rate = deg / (ms / 1000);
    this.segments.push({
      durationMs: ms,
      at: (t) => ({ a: 0.6 * Math.sin((2 * Math.PI * t) / ms), tiltDeg: (deg * t) / ms, rot: Math.abs(rate) }),
    });
    // 회전한 상태 유지
    this.segments.push({ durationMs: 1, at: () => ({ a: 0, tiltDeg: deg }) });
    return this;
  }

  /** 센서 수신 중단 */
  dropout(ms: number): this {
    this.segments.push({ durationMs: ms, at: () => ({ a: 0 }), dropout: true });
    return this;
  }

  get durationMs(): number {
    return this.segments.reduce((s, x) => s + x.durationMs, 0);
  }
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function gaussian(r: () => number): number {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 스크립트를 MotionSample 배열로 변환 */
export function renderScript(script: MotionScript, options: Partial<SimulatorOptions> = {}, startT = 0): MotionSample[] {
  const o = { ...DEFAULT_SIM_OPTIONS, ...options };
  const r = rng(o.seed);
  const step = 1000 / o.rateHz;
  const out: MotionSample[] = [];
  let segStart = 0;
  let persistentTilt = 0;
  let t = 0;
  for (const seg of script.segments) {
    const end = segStart + seg.durationMs;
    for (; t < end; t += step) {
      if (seg.dropout) continue;
      const p = seg.at(t - segStart);
      if (p.tiltDeg !== undefined) persistentTilt = p.tiltDeg;
      const tilt = ((o.baseTiltDeg + persistentTilt) * Math.PI) / 180;
      // 기기 좌표계에서 '위' 방향
      const up: Vec3 = { x: 0, y: Math.cos(tilt), z: Math.sin(tilt) };
      const side: Vec3 = { x: 1, y: 0, z: 0 };
      const tremor = o.tremor * Math.sin(2 * Math.PI * 9 * (t / 1000) + r() * 0.3);
      const a = p.a + tremor;
      const lat = p.lateral ?? 0;
      const sgn = o.invert ? -1 : 1;
      const n = () => gaussian(r) * o.noise;
      const acc: Vec3 = {
        x: sgn * o.gain * (up.x * a + side.x * lat) + n(),
        y: sgn * o.gain * (up.y * a + side.y * lat) + n(),
        z: sgn * o.gain * (up.z * a + side.z * lat) + n(),
      };
      const accG: Vec3 = {
        x: acc.x + sgn * G * up.x,
        y: acc.y + sgn * G * up.y,
        z: acc.z + sgn * G * up.z,
      };
      const rotMag = (p.rot ?? 0) + Math.abs(gaussian(r)) * 3;
      out.push({
        t: startT + t,
        acc: o.provideLinear ? acc : null,
        accG,
        rot: { alpha: rotMag, beta: 0, gamma: 0 },
      });
    }
    segStart = end;
  }
  return out;
}

/** 자주 쓰는 시나리오 */
export const scenarios = {
  normal: (n = 10) => {
    const s = new MotionScript().still(1500);
    for (let i = 0; i < n; i++) s.squat().still(400);
    return s.still(1000);
  },
  slow: (n = 5) => {
    const s = new MotionScript().still(1500);
    for (let i = 0; i < n; i++) s.squat({ downMs: 2200, bottomMs: 600, upMs: 2000 }).still(600);
    return s.still(1000);
  },
  fast: (n = 10) => {
    const s = new MotionScript().still(1500);
    for (let i = 0; i < n; i++) s.squat({ depth: 0.3, downMs: 550, bottomMs: 0, upMs: 550 }).still(120);
    return s.still(1000);
  },
  /** 내려갔다가 끝까지 올라오지 않고 멈춤 / 얕게 내려갔다 올라옴 */
  stopped: () =>
    new MotionScript()
      .still(1500)
      .descend(0.35, 1000)
      .still(6500) // 최저 자세에서 너무 오래 멈춤 → 취소
      .ascend(0.35, 1000)
      .still(1000)
      .descend(0.03, 500) // 아주 얕은 움직임
      .ascend(0.03, 500)
      .still(1000),
  shake: () =>
    new MotionScript()
      .still(1500)
      .shake({ freqHz: 4, amplitude: 0.06, ms: 3000 })
      .still(800)
      .shake({ freqHz: 6, amplitude: 0.03, ms: 2000 })
      .still(800)
      .shake({ freqHz: 2.5, amplitude: 0.1, ms: 2000 })
      .still(800)
      .shake({ freqHz: 3, amplitude: 0.15, ms: 2000, lateral: true })
      .still(1000),
  rotate: () => new MotionScript().still(1500).rotate(70, 800).still(1000).rotate(-70, 600).still(1500),
  dropout: () =>
    new MotionScript()
      .still(1500)
      .squat()
      .still(400)
      .descend(0.35, 1000)
      .dropout(1500)
      .ascend(0.35, 1000)
      .still(600)
      .squat()
      .still(1000),
};
