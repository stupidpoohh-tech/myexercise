import type { SensorSource } from '../sensor/SensorManager';
import type { MotionSample } from '../types';
import { MotionScript, renderScript, type SimulatorOptions } from './MotionSimulator';

/**
 * MotionScript 를 실시간으로 재생하는 센서 소스.
 * 개발 환경(PC 브라우저)에서 스쿼트 판정과 애니메이션 연동을 눈으로 확인하는 용도.
 */
export class SimulatedSource implements SensorSource {
  readonly kind = 'simulated' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: MotionSample[] = [];
  private onSample: ((s: MotionSample) => void) | null = null;
  private clock = 0;
  private lastWall = 0;
  private opts: Partial<SimulatorOptions>;
  private seed = 1;

  constructor(opts: Partial<SimulatorOptions> = {}) {
    this.opts = opts;
  }

  start(onSample: (s: MotionSample) => void): void {
    this.stop();
    this.onSample = onSample;
    this.lastWall = performance.now();
    this.clock = this.lastWall;
    this.timer = setInterval(() => this.tick(), 16);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onSample = null;
  }

  /** 대기열 끝에 스크립트를 이어 붙인다. 대기열이 비면 '가만히 서 있기' 샘플을 낸다. */
  play(script: MotionScript): void {
    const startT = Math.max(this.clock, this.queue.length ? this.queue[this.queue.length - 1].t + 16 : 0);
    this.queue.push(...renderScript(script, { ...this.opts, seed: this.seed++ }, startT));
  }

  clear(): void {
    this.queue = [];
  }

  get busy(): boolean {
    return this.queue.length > 0;
  }

  private tick(): void {
    const now = performance.now();
    this.clock = now;
    if (!this.onSample) return;
    if (this.queue.length === 0) {
      // 정지 상태 샘플로 채워 실시간 수신처럼 보이게 한다.
      const idle = renderScript(new MotionScript().still(now - this.lastWall), { ...this.opts, seed: this.seed++ }, this.lastWall);
      idle.forEach((s) => this.onSample?.(s));
    } else {
      while (this.queue.length && this.queue[0].t <= now) {
        const s = this.queue.shift()!;
        if (s.t >= this.lastWall - 1000) this.onSample(s);
      }
    }
    this.lastWall = now;
  }
}
