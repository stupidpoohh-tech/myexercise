import type { DetectorConfig } from '../detection/config';
import type { MotionSample, RejectReason, RepMetrics, SquatState } from '../types';

/**
 * 실기기 센서 기록. 문제가 생긴 운동의 원시 센서값과 판정 이벤트를 파일로 내보내,
 * 개발 환경에서 같은 파이프라인으로 재생해 원인을 찾는 데 쓴다.
 * 기록에는 센서 수치와 판정 결과만 들어가며 개인 정보는 포함하지 않는다.
 */
export interface SensorLogFile {
  app: 'squat-tracker';
  kind: 'sensor-log';
  version: 1;
  createdAt: string;
  userAgent: string;
  config: DetectorConfig;
  calibrated: boolean;
  /** [t, ax, ay, az, gx, gy, gz, ra, rb, rg] — 값이 없으면 null */
  samples: (number | null)[][];
  events: SensorLogEvent[];
}

export type SensorLogEvent =
  | { t: number; type: 'state'; from: SquatState; to: SquatState }
  | { t: number; type: 'rep'; metrics: RepMetrics }
  | { t: number; type: 'rejected'; reason: RejectReason; metrics: Partial<RepMetrics> }
  | { t: number; type: 'mark'; label: string };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function encodeSample(s: MotionSample): (number | null)[] {
  return [
    Math.round(s.t * 10) / 10,
    s.acc ? r3(s.acc.x) : null,
    s.acc ? r3(s.acc.y) : null,
    s.acc ? r3(s.acc.z) : null,
    s.accG ? r3(s.accG.x) : null,
    s.accG ? r3(s.accG.y) : null,
    s.accG ? r3(s.accG.z) : null,
    s.rot ? r3(s.rot.alpha) : null,
    s.rot ? r3(s.rot.beta) : null,
    s.rot ? r3(s.rot.gamma) : null,
  ];
}

export function decodeSample(a: (number | null)[]): MotionSample {
  const v = (i: number) => a[i] as number;
  return {
    t: v(0),
    acc: a[1] == null ? null : { x: v(1), y: v(2), z: v(3) },
    accG: a[4] == null ? null : { x: v(4), y: v(5), z: v(6) },
    rot: a[7] == null ? null : { alpha: v(7), beta: v(8), gamma: v(9) },
  };
}

/** 최근 N분만 보관하는 링 버퍼 */
export class SensorRecorder {
  private samples: (number | null)[][] = [];
  private events: SensorLogEvent[] = [];
  constructor(private maxSamples = 60 * 60 * 5) {}

  sample(s: MotionSample): void {
    this.samples.push(encodeSample(s));
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
  }

  event(e: SensorLogEvent): void {
    this.events.push(e);
    const first = this.samples[0]?.[0] as number | undefined;
    if (first !== undefined && this.events.length > 2000) this.events = this.events.filter((x) => x.t >= first);
  }

  get size(): number {
    return this.samples.length;
  }

  clear(): void {
    this.samples = [];
    this.events = [];
  }

  export(config: DetectorConfig, calibrated: boolean): SensorLogFile {
    const first = (this.samples[0]?.[0] as number | undefined) ?? 0;
    return {
      app: 'squat-tracker',
      kind: 'sensor-log',
      version: 1,
      createdAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      config,
      calibrated,
      samples: [...this.samples],
      events: this.events.filter((e) => e.t >= first),
    };
  }
}
