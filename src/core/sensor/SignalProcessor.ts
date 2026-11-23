import type { MotionSample, Vec3 } from '../types';

export interface ProcessedSample {
  t: number;
  /** 직전 샘플과의 간격 (s) */
  dt: number;
  /** 샘플 간격이 비정상적으로 벌어졌는지 */
  gap: boolean;
  /** 저역통과 필터를 거친 수직 선형 가속도 (m/s², 위 +) */
  accel: number;
  /** 누설 적분으로 구한 수직 속도 추정 (m/s, 위 +) */
  velocity: number;
  /** 고주파 가속도 RMS — 손 흔들기/떨림 지표 */
  shake: number;
  /** 회전 속도 크기 (deg/s) */
  rotation: number;
  /** 중력 방향 단위 벡터 (기기 좌표계, '위' 방향) */
  up: Vec3;
}

export interface SignalProcessorOptions {
  /** 수직 가속도 저역통과 시간상수 (s). 약 4Hz 차단 */
  accelTau: number;
  /** 가속도 편향 추정 시간상수 (s) */
  biasTau: number;
  /** 속도 누설 적분 시간상수 (s) — 적분 드리프트 억제 */
  velocityTau: number;
  /** acc(중력 제외)가 없을 때 중력 추정 저역통과 시간상수 (s) */
  gravityTau: number;
  /** 흔들기 에너지 포락선 시간상수 (s) */
  shakeTau: number;
  /** 이 간격(s)을 넘으면 gap 으로 본다 */
  gapSec: number;
  /** 이 회전 속도(deg/s) 이상이면 속도 추정을 빠르게 감쇠 */
  rotationResetDegPerSec: number;
  /** 정지 판정 중 속도 누설 시간상수 (s) — 편향으로 쌓인 속도를 빠르게 지운다 */
  idleVelocityTau: number;
  /** 정지 판정 중 편향 보정 시간상수 (s) */
  restBiasTau: number;
  /** 정지 판정: 가속도 포락선 상한 (m/s²), 속도 상한 (m/s), 유지 시간 (s) */
  restVelocity: number;
  restAccel: number;
  restHoldSec: number;
  /** acc 가 없을 때 중력 크기 초기 추정 샘플 수 */
  warmupSamples: number;
}

export const DEFAULT_SIGNAL_OPTIONS: SignalProcessorOptions = {
  accelTau: 0.04,
  biasTau: 30,
  velocityTau: 4,
  gravityTau: 1.2,
  shakeTau: 0.25,
  gapSec: 0.4,
  rotationResetDegPerSec: 90,
  idleVelocityTau: 0.6,
  restBiasTau: 1.5,
  restVelocity: 0.25,
  restAccel: 0.14,
  restHoldSec: 0.4,
  warmupSamples: 60,
};

const G = 9.80665;

function alpha(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

/**
 * 원시 센서 샘플을 '수직 방향' 1차원 신호로 변환한다.
 *
 * - 중력 방향은 accG - acc (둘 다 있을 때) 또는 accG 저역통과로 추정한다.
 * - 선형 가속도를 중력 방향에 투영하므로 휴대폰을 어느 방향으로 들어도 동작한다.
 * - 플랫폼마다 부호 규약이 달라도(accG·acc 가 함께 뒤집혀도) 투영 결과의 부호는 같다.
 */
export class SignalProcessor {
  private opts: SignalProcessorOptions;
  private lastT: number | null = null;
  private gravity: Vec3 | null = null;
  private bias = 0;
  private accelLP = 0;
  private velocity = 0;
  private shakeSq = 0;
  private rotLP = 0;
  private warm = 0;
  private accEnv = 0;
  private steady = 0;
  private motionActive = false;

  constructor(opts: Partial<SignalProcessorOptions> = {}) {
    this.opts = { ...DEFAULT_SIGNAL_OPTIONS, ...opts };
  }

  reset(): void {
    this.lastT = null;
    this.gravity = null;
    this.bias = 0;
    this.accelLP = 0;
    this.velocity = 0;
    this.shakeSq = 0;
    this.rotLP = 0;
    this.warm = 0;
    this.accEnv = 0;
    this.steady = 0;
  }

  /**
   * 반복 동작 진행 중 여부. 진행 중에는 편향 추적과 속도 누설을 느리게 해
   * 동작 신호를 보존하고, 대기 중에는 빠르게 해 드리프트를 지운다.
   */
  setMotionActive(active: boolean): void {
    this.motionActive = active;
  }

  /** 속도 적분만 0으로 되돌린다 (일시정지 재개 등) */
  resetMotion(): void {
    this.velocity = 0;
    this.accelLP = 0;
  }

  process(s: MotionSample): ProcessedSample | null {
    if (!s.accG && !s.acc) return null;
    const o = this.opts;
    let dt = this.lastT === null ? 1 / 60 : (s.t - this.lastT) / 1000;
    this.lastT = s.t;
    const gap = dt > o.gapSec || dt <= 0;
    if (gap) {
      // 수신 중단 후에는 적분 상태를 초기화한다.
      dt = 1 / 60;
      this.velocity = 0;
      this.accelLP = 0;
    }
    dt = Math.min(dt, 0.1);

    // 1) 중력 방향 추정
    // acc(중력 제외)가 있으면 중력 = accG - acc 로 정확히 구한다.
    // 없으면 accG 저역통과로 '방향'만 추정한다. 수직 운동은 중력과 같은 축이라
    // 방향을 거의 바꾸지 않으므로, 크기(≈9.8)는 아래의 편향 필터가 제거한다.
    let vertical: number;
    if (s.accG && s.acc) {
      const rawGravity = { x: s.accG.x - s.acc.x, y: s.accG.y - s.acc.y, z: s.accG.z - s.acc.z };
      const a = this.gravity ? alpha(dt, 0.08) : 1;
      this.gravity = lerpVec(this.gravity ?? rawGravity, rawGravity, a);
      vertical = dot(s.acc, unit(this.gravity));
    } else if (s.accG) {
      const a = this.gravity ? alpha(dt, o.gravityTau) : 1;
      this.gravity = lerpVec(this.gravity ?? s.accG, s.accG, a);
      vertical = dot(s.accG, unit(this.gravity));
    } else {
      // acc 만 있는 경우: 중력 방향을 알 수 없으므로 기기 y축(세로 방향)을 위로 가정
      this.gravity = this.gravity ?? { x: 0, y: G, z: 0 };
      vertical = dot(s.acc!, unit(this.gravity));
    }
    const up = unit(this.gravity);

    // 3) 편향 제거. 센서 편향은 거의 변하지 않으므로 아주 느리게 추적한다.
    //    (빠르게 추적하면 스쿼트 가속도 자체를 편향으로 오인해 속도 추정이 왜곡된다)
    //    - acc(OS 가 중력을 제거한 값)가 있으면 편향이 거의 0이므로 0에서 시작한다.
    //      시작 버튼을 누르는 순간의 손 움직임을 편향으로 잘못 굳히지 않기 위해서다.
    //    - acc 가 없으면 중력 크기가 섞여 있으므로 처음 약 1초를 누적 평균으로 수렴시킨다.
    this.warm++;
    const linear = !!s.acc;
    if (linear && this.warm === 1) this.bias = 0;
    const biasA = !linear && this.warm <= o.warmupSamples ? 1 / this.warm : alpha(dt, o.biasTau);
    this.bias += (vertical - this.bias) * biasA;
    const centered = vertical - this.bias;

    // 4) 노이즈 저역통과
    this.accelLP += (centered - this.accelLP) * alpha(dt, o.accelTau);

    // 5) 고주파 성분 = 흔들기/손떨림 지표
    const hf = centered - this.accelLP;
    this.shakeSq += (hf * hf - this.shakeSq) * alpha(dt, o.shakeTau);

    // 6) 회전
    const rot = s.rot ? Math.hypot(s.rot.alpha || 0, s.rot.beta || 0, s.rot.gamma || 0) : 0;
    this.rotLP += (rot - this.rotLP) * alpha(dt, 0.1);

    // 7) 누설 적분 → 수직 속도. 기기를 크게 돌리는 중에는 투영이 왜곡되므로 빠르게 0으로 감쇠한다.
    //    정지 판정은 '가속도가 일정 시간 잔잔한가'로 한다. 속도 추정값으로 판정하면
    //    편향 때문에 속도가 떠 있을 때 영영 보정되지 않는다.
    this.accEnv += (Math.abs(this.accelLP) - this.accEnv) * alpha(dt, 0.3);
    if (!this.motionActive && this.accEnv < o.restAccel && Math.abs(this.velocity) < o.restVelocity) this.steady += dt;
    else this.steady = 0;
    const resting = this.steady >= o.restHoldSec && (linear || this.warm > o.warmupSamples);
    if (resting) {
      // 정지 중 남아 있는 속도는 대부분 편향 오차(e·τ)이므로 편향 추정에 되돌려 준다.
      this.bias += (this.velocity / o.velocityTau) * alpha(dt, o.restBiasTau);
    }
    const tau =
      this.rotLP > o.rotationResetDegPerSec ? 0.2 : resting ? o.idleVelocityTau : o.velocityTau;
    this.velocity = this.velocity * Math.exp(-dt / tau) + this.accelLP * dt;

    return {
      t: s.t,
      dt,
      gap,
      accel: this.accelLP,
      velocity: this.velocity,
      shake: Math.sqrt(this.shakeSq),
      rotation: this.rotLP,
      up,
    };
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function unit(a: Vec3): Vec3 {
  const n = norm(a);
  return n > 1e-3 ? scale(a, 1 / n) : { x: 0, y: 1, z: 0 };
}
function norm(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const c = dot(a, b) / ((norm(a) || 1) * (norm(b) || 1));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
