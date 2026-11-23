import { Emitter } from '../emitter';
import type { ProcessedSample } from '../sensor/SignalProcessor';
import { angleBetweenDeg } from '../sensor/SignalProcessor';
import type { MotionFrame, RejectReason, RepMetrics, SquatState, Vec3 } from '../types';
import { DEFAULT_CONFIG, type DetectorConfig } from './config';

export interface DetectorEvents extends Record<string, unknown> {
  frame: MotionFrame;
  state: { from: SquatState; to: SquatState; t: number };
  rep: RepMetrics;
  rejected: { reason: RejectReason; t: number; metrics: Partial<RepMetrics> };
}

/** 가속도 부호 전환을 셀 때 쓰는 히스테리시스 (m/s²) */
const ZC_HYSTERESIS = 0.6;

/**
 * 수직 속도 패턴으로 스쿼트 1회를 판정하는 상태 머신.
 *
 * IDLE → DESCENDING → BOTTOM → ASCENDING → COMPLETED → IDLE
 *
 * 임계값을 한 번 넘는 것으로는 카운트하지 않는다. 하강 구간과 상승 구간이
 * 순서대로 관찰되고, 시간·변위·대칭성·흔들림·회전 조건을 모두 통과했을 때만
 * 'rep' 이벤트를 발생시킨다.
 */
export class SquatDetector extends Emitter<DetectorEvents> {
  private cfg: DetectorConfig;
  private state: SquatState = 'IDLE';

  private candidateT: number | null = null;
  private repStart = 0;
  private descentStart = 0;
  private bottomStart = 0;
  private ascentStart = 0;
  private descentEnd = 0;
  private lastCompleteT = -Infinity;

  private depthDown = 0;
  private depthUp = 0;
  private peakVelDown = 0;
  private peakVelUp = 0;
  private peakAccel = 0;
  private maxShake = 0;
  private maxRot = 0;
  private maxTilt = 0;
  private zeroCrossings = 0;
  private accelSign = 0;
  private startUp: Vec3 | null = null;
  private progressAtBottom = 0;
  private lastFrame: MotionFrame;

  constructor(config: DetectorConfig = DEFAULT_CONFIG) {
    super();
    this.cfg = { ...config };
    this.lastFrame = { t: 0, state: 'IDLE', progress: this.cfg.expectedDepth ? 0 : null, velocity: 0, accel: 0, shake: 0 };
  }

  get config(): DetectorConfig {
    return this.cfg;
  }

  setConfig(config: DetectorConfig): void {
    this.cfg = { ...config };
  }

  get currentState(): SquatState {
    return this.state;
  }

  get frame(): MotionFrame {
    return this.lastFrame;
  }

  /** 진행 중인 반복을 버리고 대기 상태로 되돌린다 */
  reset(t = this.lastFrame.t): void {
    this.candidateT = null;
    this.resetAccumulators();
    this.setState('IDLE', t);
    this.emitFrame({ t, accel: 0, velocity: 0, shake: 0 });
  }

  process(s: ProcessedSample): MotionFrame {
    const c = this.cfg;
    const v = s.velocity;

    if (s.gap && this.state !== 'IDLE' && this.state !== 'COMPLETED') {
      this.reject('sensor-gap', s.t);
    }

    switch (this.state) {
      case 'IDLE':
      case 'COMPLETED': {
        if (this.state === 'COMPLETED' && s.t - this.lastCompleteT >= c.refractoryMs) {
          this.setState('IDLE', s.t);
        }
        if (v < -c.velStart) {
          if (this.candidateT === null) {
            this.candidateT = s.t;
            this.resetAccumulators();
            this.startUp = s.up;
          }
          this.track(s);
          this.depthDown += -v * s.dt;
          this.peakVelDown = Math.max(this.peakVelDown, -v);
          const held = s.t - this.candidateT >= c.startHoldMs;
          const refractoryOk = s.t - this.lastCompleteT >= c.refractoryMs;
          if (held && refractoryOk) {
            this.repStart = this.candidateT;
            this.descentStart = this.candidateT;
            this.setState('DESCENDING', s.t);
          }
        } else {
          this.candidateT = null;
        }
        break;
      }

      case 'DESCENDING': {
        this.track(s);
        if (v < 0) this.depthDown += -v * s.dt;
        this.peakVelDown = Math.max(this.peakVelDown, -v);
        if (-v < this.peakVelDown * c.velEndRatio) {
          this.descentEnd = s.t;
          if (s.t - this.descentStart < c.minPhaseMs) {
            this.reject('too-fast', s.t);
          } else {
            this.bottomStart = s.t;
            this.progressAtBottom = this.depthProgress(this.depthDown) ?? 1;
            this.candidateT = null;
            this.setState('BOTTOM', s.t);
          }
        } else if (s.t - this.descentStart > c.maxDescentMs) {
          this.reject('descent-timeout', s.t);
        }
        break;
      }

      case 'BOTTOM': {
        this.track(s);
        if (v > c.velStart) {
          if (this.candidateT === null) this.candidateT = s.t;
          this.depthUp += v * s.dt;
          this.peakVelUp = Math.max(this.peakVelUp, v);
          if (s.t - this.candidateT >= c.startHoldMs) {
            this.ascentStart = this.candidateT;
            this.candidateT = null;
            this.setState('ASCENDING', s.t);
          }
        } else if (v < -Math.max(c.velStart, this.peakVelDown * c.velEndRatio * 2)) {
          // 잠시 멈췄다가 더 내려가는 경우 — 하강을 이어서 누적한다.
          // 종료 임계값보다 충분히 큰 값을 요구해 경계에서 상태가 떨리지 않게 한다.
          this.candidateT = null;
          this.depthUp = 0;
          this.peakVelUp = 0;
          this.depthDown += -v * s.dt;
          this.setState('DESCENDING', s.t);
        } else {
          if (this.candidateT !== null) {
            this.candidateT = null;
            this.depthUp = 0;
            this.peakVelUp = 0;
          }
          if (s.t - this.bottomStart > c.maxBottomMs) this.reject('bottom-timeout', s.t);
        }
        break;
      }

      case 'ASCENDING': {
        this.track(s);
        if (v > 0) this.depthUp += v * s.dt;
        this.peakVelUp = Math.max(this.peakVelUp, v);
        if (v < this.peakVelUp * c.velEndRatio) {
          if (this.depthUp < this.depthDown * c.minSymmetry && s.t - this.bottomStart <= c.maxBottomMs) {
            // 충분히 올라오지 않고 멈춤 — 아직 최저 자세 부근으로 보고 진짜 상승을 기다린다.
            this.depthUp = 0;
            this.peakVelUp = 0;
            this.ascentStart = 0;
            this.candidateT = null;
            this.setState('BOTTOM', s.t);
          } else {
            this.finish(s.t);
          }
        } else if (s.t - this.ascentStart > c.maxAscentMs) {
          this.reject('ascent-timeout', s.t);
        }
        break;
      }
    }

    return this.emitFrame(s);
  }

  private finish(t: number): void {
    const c = this.cfg;
    const m = this.metrics(t);
    const total = t - this.repStart;
    const sym = m.depthDown > 0 ? m.depthUp / m.depthDown : 0;
    let reason: RejectReason | null = null;
    if (m.ascentMs < c.minPhaseMs || total < c.minRepMs) reason = 'too-fast';
    else if (total > c.maxRepMs) reason = 'too-slow';
    else if (m.depthDown < c.minDepth || m.depthUp < c.minDepth * 0.6) reason = 'too-shallow';
    else if (sym < c.minSymmetry || sym > c.maxSymmetry) reason = 'asymmetric';
    else if (m.maxShake > c.maxShake || m.peakAccel > c.maxAccel) reason = 'shake';
    else if (m.maxRot > c.maxRotation || m.tiltDeg > c.maxTiltDeg) reason = 'rotation';
    else if (m.zeroCrossings > c.maxZeroCrossings) reason = 'too-erratic';

    if (reason) {
      this.reject(reason, t, m);
      return;
    }
    this.lastCompleteT = t;
    this.candidateT = null;
    this.setState('COMPLETED', t);
    this.emit('rep', m);
    this.resetAccumulators();
  }

  private reject(reason: RejectReason, t: number, metrics?: Partial<RepMetrics>): void {
    const m = metrics ?? this.metrics(t);
    this.candidateT = null;
    this.resetAccumulators();
    this.setState('IDLE', t);
    this.emit('rejected', { reason, t, metrics: m });
  }

  private metrics(t: number): RepMetrics {
    const descentEnd = this.descentEnd || t;
    const ascentStart = this.ascentStart || t;
    return {
      startedAt: this.repStart,
      endedAt: t,
      descentMs: descentEnd - this.descentStart,
      bottomMs: Math.max(0, ascentStart - descentEnd),
      ascentMs: this.ascentStart ? t - this.ascentStart : 0,
      depthDown: this.depthDown,
      depthUp: this.depthUp,
      peakVelDown: this.peakVelDown,
      peakVelUp: this.peakVelUp,
      peakAccel: this.peakAccel,
      maxShake: this.maxShake,
      maxRot: this.maxRot,
      tiltDeg: this.maxTilt,
      zeroCrossings: this.zeroCrossings,
    };
  }

  private track(s: ProcessedSample): void {
    this.peakAccel = Math.max(this.peakAccel, Math.abs(s.accel));
    this.maxShake = Math.max(this.maxShake, s.shake);
    this.maxRot = Math.max(this.maxRot, s.rotation);
    if (this.startUp) this.maxTilt = Math.max(this.maxTilt, angleBetweenDeg(this.startUp, s.up));
    const sign = s.accel > ZC_HYSTERESIS ? 1 : s.accel < -ZC_HYSTERESIS ? -1 : 0;
    if (sign !== 0) {
      if (this.accelSign !== 0 && sign !== this.accelSign) this.zeroCrossings++;
      this.accelSign = sign;
    }
  }

  private resetAccumulators(): void {
    this.depthDown = 0;
    this.depthUp = 0;
    this.peakVelDown = 0;
    this.peakVelUp = 0;
    this.peakAccel = 0;
    this.maxShake = 0;
    this.maxRot = 0;
    this.maxTilt = 0;
    this.zeroCrossings = 0;
    this.accelSign = 0;
    this.startUp = null;
    this.descentEnd = 0;
    this.ascentStart = 0;
    this.progressAtBottom = 0;
  }

  private depthProgress(depth: number): number | null {
    const e = this.cfg.expectedDepth;
    if (!e) return null;
    return Math.max(0, Math.min(1, depth / e));
  }

  private computeProgress(shake: number): number | null {
    if (!this.cfg.expectedDepth) return null;
    // 흔들림이 큰 구간에서는 진행도를 추정하지 않는다.
    if (shake > this.cfg.maxShake * 0.8) return null;
    switch (this.state) {
      case 'IDLE':
      case 'COMPLETED':
        return 0;
      case 'DESCENDING':
        return this.depthProgress(this.depthDown);
      case 'BOTTOM':
        return this.progressAtBottom;
      case 'ASCENDING': {
        const ratio = this.depthDown > 0 ? Math.min(1, this.depthUp / this.depthDown) : 1;
        return Math.max(0, this.progressAtBottom * (1 - ratio));
      }
    }
  }

  private setState(next: SquatState, t: number): void {
    if (next === this.state) return;
    const from = this.state;
    this.state = next;
    this.emit('state', { from, to: next, t });
  }

  private emitFrame(s: { t: number; accel: number; velocity: number; shake: number }): MotionFrame {
    const frame: MotionFrame = {
      t: s.t,
      state: this.state,
      progress: this.computeProgress(s.shake),
      velocity: s.velocity,
      accel: s.accel,
      shake: s.shake,
    };
    this.lastFrame = frame;
    this.emit('frame', frame);
    return frame;
  }
}
