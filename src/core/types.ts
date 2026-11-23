export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RotationRate {
  alpha: number;
  beta: number;
  gamma: number;
}

/**
 * 센서 한 샘플. 실제 DeviceMotionEvent 와 시뮬레이터가 모두 이 형태로 변환되어
 * 동일한 파이프라인에 주입된다.
 */
export interface MotionSample {
  /** ms 단위 단조 증가 시각 */
  t: number;
  /** 중력 제외 가속도 (m/s²). 기기가 제공하지 않으면 null */
  acc: Vec3 | null;
  /** 중력 포함 가속도 (m/s²) */
  accG: Vec3 | null;
  /** 회전 속도 (deg/s) */
  rot: RotationRate | null;
}

/** 동작 인식 상태 */
export type SquatState = 'IDLE' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING' | 'COMPLETED';

/**
 * 센서 분석 결과 한 프레임. 카운트와 애니메이션이 모두 이 값 하나만 사용한다.
 */
export interface MotionFrame {
  t: number;
  state: SquatState;
  /**
   * 동작 진행도 0(서 있음) ~ 1(최저 자세).
   * 보정 전이거나 추정이 불확실하면 null — 렌더러는 상태만으로 표현해야 한다.
   */
  progress: number | null;
  /** 필터링된 수직 속도 추정값 (m/s, 위쪽 +) — 디버그용 */
  velocity: number;
  /** 필터링된 수직 가속도 (m/s²) — 디버그용 */
  accel: number;
  /** 손떨림/흔들기 에너지 지표 — 디버그용 */
  shake: number;
}

export type RejectReason =
  | 'too-fast'
  | 'too-slow'
  | 'too-shallow'
  | 'asymmetric'
  | 'shake'
  | 'rotation'
  | 'bottom-timeout'
  | 'descent-timeout'
  | 'ascent-timeout'
  | 'sensor-gap'
  | 'too-erratic'
  /** 확정 전 작은 움직임 — 사용자에게 알리지 않는다 */
  | 'noise';

export interface RepMetrics {
  startedAt: number;
  endedAt: number;
  descentMs: number;
  bottomMs: number;
  ascentMs: number;
  /** 하강 변위 추정치 (상대값, 대략 m) */
  depthDown: number;
  depthUp: number;
  peakVelDown: number;
  peakVelUp: number;
  peakAccel: number;
  maxShake: number;
  maxRot: number;
  tiltDeg: number;
  zeroCrossings: number;
}
