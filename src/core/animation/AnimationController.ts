import type { MotionFrame, SquatState } from '../types';
import type { CharacterEvent, CharacterPose, CharacterRenderer, MotionFeed } from './types';

export interface AnimationOptions {
  /** 진행도를 알 때 추종 시간상수 (ms) — 작을수록 지연이 적다 */
  followTauMs: number;
  /** 진행도를 모를 때 상태 기반 이동 속도 (depth/s) */
  stateSpeed: number;
  /** 상태 기반 하강 시 목표 depth — 모르는 깊이를 끝까지 과장하지 않는다 */
  unknownDescentTarget: number;
}

const DEFAULTS: AnimationOptions = {
  followTauMs: 50,
  stateSpeed: 2.2,
  unknownDescentTarget: 0.85,
};

type Raf = (cb: (t: number) => void) => number;
type Caf = (id: number) => void;

/**
 * 센서 분석 결과(MotionFrame)를 캐릭터 자세(CharacterPose)로 변환해 렌더러에 전달한다.
 * 센서 데이터를 직접 해석하지 않고, SquatDetector 가 만든 상태·진행도만 사용한다.
 */
export class AnimationController {
  private opts: AnimationOptions;
  private renderers = new Set<CharacterRenderer>();
  private frame: MotionFrame | null = null;
  private pose: CharacterPose = { state: 'IDLE', depth: 0, progress: null, progressKnown: false, reps: 0, tracking: false };
  private rafId: number | null = null;
  private lastTick: number | null = null;
  private unsub: (() => void)[] = [];
  private raf: Raf;
  private caf: Caf;

  constructor(opts: Partial<AnimationOptions> = {}, raf?: Raf, caf?: Caf) {
    this.opts = { ...DEFAULTS, ...opts };
    this.raf = raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = caf ?? ((id) => cancelAnimationFrame(id));
  }

  get currentPose(): CharacterPose {
    return this.pose;
  }

  connect(feed: MotionFeed): void {
    this.disconnect();
    this.unsub = [
      feed.onFrame((f) => this.setFrame(f)),
      feed.onRep((reps) => {
        this.pose = { ...this.pose, reps };
        this.broadcast({ type: 'rep', reps });
      }),
      feed.onRejected((reason) => this.broadcast({ type: 'rejected', reason })),
      feed.onTracking((tracking) => {
        this.pose = { ...this.pose, tracking };
        this.broadcast({ type: 'tracking', tracking });
        this.renderAll();
      }),
    ];
  }

  disconnect(): void {
    this.unsub.forEach((u) => u());
    this.unsub = [];
  }

  attach(renderer: CharacterRenderer): () => void {
    this.renderers.add(renderer);
    renderer.render(this.pose);
    this.ensureLoop();
    return () => {
      this.renderers.delete(renderer);
      if (this.renderers.size === 0) this.stopLoop();
    };
  }

  setReps(reps: number): void {
    this.pose = { ...this.pose, reps };
    this.renderAll();
  }

  /** 새 분석 프레임 입력. 상태 전환은 즉시 이벤트로 알린다 */
  setFrame(f: MotionFrame): void {
    const prev = this.frame?.state ?? 'IDLE';
    this.frame = f;
    if (f.state !== prev) this.broadcast({ type: 'state', from: prev, to: f.state });
    this.ensureLoop();
  }

  /** 한 스텝 진행 (테스트에서 직접 호출 가능) */
  step(dtMs: number): CharacterPose {
    const f = this.frame;
    const state: SquatState = f?.state ?? 'IDLE';
    const progress = f?.progress ?? null;
    let depth = this.pose.depth;
    if (progress !== null) {
      const k = 1 - Math.exp(-dtMs / this.opts.followTauMs);
      depth += (progress - depth) * k;
    } else {
      const target = stateTarget(state, this.opts.unknownDescentTarget, depth);
      const maxStep = (this.opts.stateSpeed * dtMs) / 1000;
      depth += Math.max(-maxStep, Math.min(maxStep, target - depth));
    }
    depth = Math.max(0, Math.min(1, depth));
    this.pose = { ...this.pose, state, progress, progressKnown: progress !== null, depth };
    return this.pose;
  }

  destroy(): void {
    this.disconnect();
    this.stopLoop();
    this.renderers.clear();
  }

  private ensureLoop(): void {
    if (this.rafId !== null || this.renderers.size === 0) return;
    const tick = (t: number) => {
      const dt = this.lastTick === null ? 16 : Math.min(100, t - this.lastTick);
      this.lastTick = t;
      this.step(dt);
      this.renderAll();
      this.rafId = this.raf(tick);
    };
    this.rafId = this.raf(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) this.caf(this.rafId);
    this.rafId = null;
    this.lastTick = null;
  }

  private renderAll(): void {
    this.renderers.forEach((r) => r.render(this.pose));
  }

  private broadcast(e: CharacterEvent): void {
    this.renderers.forEach((r) => r.onEvent?.(e));
  }
}

function stateTarget(state: SquatState, descentTarget: number, current: number): number {
  switch (state) {
    case 'DESCENDING':
      return descentTarget;
    case 'BOTTOM':
      // 진행도를 모르면 현재 위치를 유지 (억지로 끝까지 내리지 않음)
      return Math.max(current, descentTarget * 0.9);
    case 'ASCENDING':
    case 'COMPLETED':
    case 'IDLE':
      return 0;
  }
}
