import { Emitter } from '../emitter';
import type { MotionSample } from '../types';

export type SensorStatus =
  | 'idle' // 시작 전
  | 'requesting' // 권한 요청 중
  | 'waiting' // 수신 대기 (첫 데이터 전)
  | 'active' // 정상 수신
  | 'stalled' // 수신 중단 감지
  | 'denied' // 권한 거부
  | 'unsupported' // 미지원 기기/브라우저
  | 'insecure'; // HTTPS 아님

export interface SensorSource {
  readonly kind: 'device' | 'simulated';
  start(onSample: (s: MotionSample) => void): void;
  stop(): void;
}

interface SensorEvents extends Record<string, unknown> {
  sample: MotionSample;
  status: SensorStatus;
}

export interface SensorManagerOptions {
  /** 이 시간 동안 샘플이 없으면 stalled (ms) */
  stallMs: number;
  /** 시작 후 이 시간 안에 유효한 샘플이 없으면 unsupported (ms) */
  noDataMs: number;
}

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>;

function permissionApi(): PermissionFn | null {
  const DME = (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent as
    | { requestPermission?: PermissionFn }
    | undefined;
  return DME && typeof DME.requestPermission === 'function' ? DME.requestPermission.bind(DME) : null;
}

export function isMotionSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

/** iOS 13+ Safari 처럼 명시적 권한 요청이 필요한 환경인지 */
export function needsMotionPermission(): boolean {
  return permissionApi() !== null;
}

/** 실제 DeviceMotionEvent 를 MotionSample 로 변환하는 소스 */
export class DeviceMotionSource implements SensorSource {
  readonly kind = 'device' as const;
  private handler: ((e: DeviceMotionEvent) => void) | null = null;

  start(onSample: (s: MotionSample) => void): void {
    this.stop();
    this.handler = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      const g = e.accelerationIncludingGravity;
      const r = e.rotationRate;
      const acc = a && a.x != null && a.y != null && a.z != null ? { x: a.x, y: a.y, z: a.z } : null;
      const accG = g && g.x != null && g.y != null && g.z != null ? { x: g.x, y: g.y, z: g.z } : null;
      const rot =
        r && (r.alpha != null || r.beta != null || r.gamma != null)
          ? { alpha: r.alpha ?? 0, beta: r.beta ?? 0, gamma: r.gamma ?? 0 }
          : null;
      onSample({ t: performance.now(), acc, accG, rot });
    };
    window.addEventListener('devicemotion', this.handler);
  }

  stop(): void {
    if (this.handler) window.removeEventListener('devicemotion', this.handler);
    this.handler = null;
  }
}

/**
 * 센서 권한·지원 여부·수신 상태를 관리한다.
 * 데이터 해석은 하지 않는다 (SignalProcessor/SquatDetector 담당).
 */
export class SensorManager extends Emitter<SensorEvents> {
  private source: SensorSource;
  private opts: SensorManagerOptions;
  private _status: SensorStatus = 'idle';
  private startedAt = 0;
  private lastValidAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private rateWindow: number[] = [];

  constructor(source: SensorSource = new DeviceMotionSource(), opts: Partial<SensorManagerOptions> = {}) {
    super();
    this.source = source;
    this.opts = { stallMs: 1200, noDataMs: 3500, ...opts };
  }

  get status(): SensorStatus {
    return this._status;
  }

  get sourceKind(): SensorSource['kind'] {
    return this.source.kind;
  }

  /** 최근 샘플링 속도 (Hz) */
  get sampleRate(): number {
    const w = this.rateWindow;
    if (w.length < 2) return 0;
    return ((w.length - 1) * 1000) / (w[w.length - 1] - w[0]);
  }

  setSource(source: SensorSource): void {
    const running = this.watchdog !== null;
    this.stop();
    this.source = source;
    if (running) void this.start();
  }

  /**
   * 권한 요청 후 수신을 시작한다. iOS 에서는 반드시 사용자 제스처(버튼 클릭) 안에서 호출해야 한다.
   */
  async start(): Promise<SensorStatus> {
    if (this.source.kind === 'device') {
      if (typeof window !== 'undefined' && window.isSecureContext === false) return this.setStatus('insecure');
      if (!isMotionSupported()) return this.setStatus('unsupported');
      const request = permissionApi();
      if (request) {
        this.setStatus('requesting');
        try {
          const result = await request();
          if (result !== 'granted') return this.setStatus('denied');
        } catch {
          // 사용자 제스처 밖에서 호출되었거나 이미 거부된 경우
          return this.setStatus('denied');
        }
      }
    }

    this.startedAt = performance.now();
    this.lastValidAt = 0;
    this.rateWindow = [];
    this.setStatus('waiting');
    this.source.start((s) => this.onSample(s));
    this.startWatchdog();
    return this._status;
  }

  stop(): void {
    this.source.stop();
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this._status === 'active' || this._status === 'waiting' || this._status === 'stalled') this.setStatus('idle');
  }

  private onSample(s: MotionSample): void {
    if (!s.accG && !s.acc) return; // 데스크톱 등에서 null 로만 오는 이벤트
    this.lastValidAt = performance.now();
    this.rateWindow.push(s.t);
    if (this.rateWindow.length > 60) this.rateWindow.shift();
    if (this._status !== 'active') this.setStatus('active');
    this.emit('sample', s);
  }

  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      const now = performance.now();
      if (this.lastValidAt === 0) {
        if (now - this.startedAt > this.opts.noDataMs && this.source.kind === 'device') {
          this.setStatus('unsupported');
        }
        return;
      }
      if (now - this.lastValidAt > this.opts.stallMs) {
        if (this._status !== 'stalled') this.setStatus('stalled');
      }
    }, 250);
  }

  private setStatus(s: SensorStatus): SensorStatus {
    if (s !== this._status) {
      this._status = s;
      this.emit('status', s);
    }
    return s;
  }
}
