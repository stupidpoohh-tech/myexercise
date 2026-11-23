import type { RepMetrics } from '../types';
import { DEFAULT_CONFIG, type DetectorConfig } from './config';

export interface CalibrationProfile {
  version: 1;
  createdAt: string;
  reps: number;
  /** 보정 결과로 덮어쓸 값 */
  overrides: Pick<DetectorConfig, 'velStart' | 'minDepth' | 'expectedDepth' | 'maxShake' | 'maxAccel'> & Partial<Pick<DetectorConfig, 'startDepth'>>;
  /** 참고용 원시 통계 */
  stats: { medianDepth: number; medianPeakVel: number; medianDurationMs: number; medianShake: number };
}

/** 보정 중에 쓰는 느슨한 임계값 — 사용자의 실제 동작 크기를 먼저 관찰한다 */
export const CALIBRATION_CONFIG: DetectorConfig = {
  ...DEFAULT_CONFIG,
  velStart: 0.07,
  minDepth: 0.04,
  startDepth: 0.04,
  expectedDepth: null,
};

// v2: 신호 처리(편향 추정·정지 판정) 변경으로 이전 보정값은 쓰지 않는다
const STORAGE_KEY = 'squat.calibration.v2';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 처음 N회 스쿼트의 동작 크기를 관찰해 기기·사용자별 임계값을 정한다.
 * 기기마다 센서 민감도와 샘플링 속도가 다르고 사람마다 깊이·속도가 달라
 * 고정 임계값 하나로는 흔들기 구분이 어렵기 때문이다.
 */
export class CalibrationManager {
  readonly target: number;
  private samples: RepMetrics[] = [];

  constructor(target = 3) {
    this.target = target;
  }

  get count(): number {
    return this.samples.length;
  }

  get done(): boolean {
    return this.samples.length >= this.target;
  }

  reset(): void {
    this.samples = [];
  }

  add(m: RepMetrics): CalibrationProfile | null {
    if (this.done) return null;
    this.samples.push(m);
    return this.done ? CalibrationManager.build(this.samples) : null;
  }

  static build(reps: RepMetrics[]): CalibrationProfile {
    const depth = median(reps.map((r) => (r.depthDown + r.depthUp) / 2));
    const peakVel = median(reps.map((r) => Math.min(r.peakVelDown, r.peakVelUp)));
    const duration = median(reps.map((r) => r.endedAt - r.startedAt));
    const shake = median(reps.map((r) => r.maxShake));
    const accel = Math.max(...reps.map((r) => r.peakAccel));
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      reps: reps.length,
      overrides: {
        velStart: clamp(peakVel * 0.3, 0.05, 0.3),
        minDepth: clamp(depth * 0.5, 0.03, 0.35),
        startDepth: clamp(depth * 0.2, 0.03, 0.1),
        expectedDepth: clamp(depth, 0.05, 1),
        maxShake: clamp(Math.max(DEFAULT_CONFIG.maxShake, shake * 2.5), 0.5, 8),
        maxAccel: clamp(Math.max(DEFAULT_CONFIG.maxAccel, accel * 1.8), 2, 30),
      },
      stats: { medianDepth: depth, medianPeakVel: peakVel, medianDurationMs: duration, medianShake: shake },
    };
  }

  static apply(base: DetectorConfig, profile: CalibrationProfile | null): DetectorConfig {
    return profile ? { ...base, ...profile.overrides } : { ...base };
  }

  static load(): CalibrationProfile | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as CalibrationProfile;
      return p && p.version === 1 && p.overrides ? p : null;
    } catch {
      return null;
    }
  }

  static save(p: CalibrationProfile | null): void {
    try {
      if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 저장 불가 환경 — 다음 실행 때 다시 보정 */
    }
  }
}
