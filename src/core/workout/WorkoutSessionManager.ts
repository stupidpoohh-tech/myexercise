import { CalibrationManager, CALIBRATION_CONFIG, type CalibrationProfile } from '../detection/CalibrationManager';
import { DEFAULT_CONFIG, mergeConfig, type DetectorConfig } from '../detection/config';
import { MotionPipeline } from '../detection/MotionPipeline';
import type { SquatDetector } from '../detection/SquatDetector';
import { Emitter } from '../emitter';
import type { MotionFeed } from '../animation/types';
import { SensorManager, type SensorStatus } from '../sensor/SensorManager';
import { WorkoutStorage } from '../storage/WorkoutStorage';
import { computeFinalReps, type DailyRecord, type WorkoutSession } from '../storage/types';
import type { MotionFrame, MotionSample, RejectReason, RepMetrics } from '../types';
import { dateKey } from '../util/date';
import { WakeLockController, type WakeLockState } from './WakeLock';
import { SensorRecorder, type SensorLogFile } from '../sim/SensorLog';

export type WorkoutPhase = 'idle' | 'starting' | 'calibrating' | 'running' | 'paused' | 'ended';

export interface SaveState {
  status: 'idle' | 'saving' | 'error';
  error?: string;
  /** 저장되지 않은 변경이 있는지 */
  dirty: boolean;
}

export interface WorkoutSnapshot {
  phase: WorkoutPhase;
  mode: 'auto' | 'manual';
  sensorStatus: SensorStatus;
  /** 오늘(현재 세션 날짜) 총 횟수 = 다른 세션 + 이번 세션 */
  todayReps: number;
  /** 이번 운동에서 수행한 횟수 (자정 분할 포함 합계) */
  sessionReps: number;
  autoReps: number;
  manualAdjustment: number;
  date: string;
  calibration: { target: number; done: number } | null;
  calibrated: boolean;
  /** 최근 제외된 동작. significant: 실제 스쿼트 시도로 볼 만큼 컸는지 (작은 흔들림 안내 억제용) */
  lastRejected: { reason: RejectReason; at: number; significant: boolean } | null;
  lastRepAt: number;
  save: SaveState;
  wakeLock: WakeLockState;
  sampleRate: number;
}

interface ManagerEvents extends Record<string, unknown> {
  change: WorkoutSnapshot;
  frame: MotionFrame;
  rep: { reps: number; metrics: RepMetrics | null };
  rejected: RejectReason;
  tracking: boolean;
  saved: DailyRecord;
}

export interface WorkoutManagerDeps {
  sensor?: SensorManager;
  storage?: WorkoutStorage;
  now?: () => Date;
  wakeLock?: WakeLockController | null;
  /** 보정 중 인식한 횟수도 카운트할지 (기본 true — 실제로 수행한 스쿼트이므로) */
  countCalibrationReps?: boolean;
  calibrationReps?: number;
  /** 저장 실패 시 자동 재시도 횟수 */
  autoRetries?: number;
}

const TUNING_KEY = 'squat.tuning.v1';

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 운동 세션 오케스트레이터.
 * 센서 → 신호처리 → 스쿼트 판정을 연결하고, 판정 결과를 카운트·저장·애니메이션에 배포한다.
 * 판정은 한 곳(SquatDetector)에서만 이뤄지며 카운트와 애니메이션은 같은 결과를 공유한다.
 */
export class WorkoutSessionManager extends Emitter<ManagerEvents> {
  readonly sensor: SensorManager;
  readonly storage: WorkoutStorage;
  readonly detector: SquatDetector;
  private pipeline: MotionPipeline;
  private calibration: CalibrationManager;
  private profile: CalibrationProfile | null;
  private tuning: Partial<DetectorConfig>;
  private now: () => Date;
  private wake: WakeLockController | null;
  private countCalibrationReps: boolean;
  private autoRetries: number;

  private session: WorkoutSession | null = null;
  /** 같은 운동(자정 분할 전 세그먼트)에서 이미 확정된 횟수 */
  private previousSegmentsReps = 0;
  /** 현재 날짜의 다른 세션 합계 */
  private otherTodayReps = 0;
  private snap: WorkoutSnapshot;
  private saveChain: Promise<void> = Promise.resolve();
  private pendingSave = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: (() => void)[] = [];
  private tracking = false;
  /** 최근 운동의 센서 기록 (실기기 문제 진단용, 메모리에만 보관) */
  readonly recorder = new SensorRecorder();

  constructor(deps: WorkoutManagerDeps = {}) {
    super();
    this.sensor = deps.sensor ?? new SensorManager();
    this.storage = deps.storage ?? new WorkoutStorage();
    this.now = deps.now ?? (() => new Date());
    this.countCalibrationReps = deps.countCalibrationReps ?? true;
    this.autoRetries = deps.autoRetries ?? 3;
    this.calibration = new CalibrationManager(deps.calibrationReps ?? 3);
    this.profile = CalibrationManager.load();
    this.tuning = loadTuning();
    this.pipeline = new MotionPipeline(this.effectiveConfig());
    this.detector = this.pipeline.detector;
    this.wake =
      deps.wakeLock === undefined
        ? typeof document !== 'undefined'
          ? new WakeLockController((s) => this.patch({ wakeLock: s }))
          : null
        : deps.wakeLock;

    this.snap = {
      phase: 'idle',
      mode: 'auto',
      sensorStatus: this.sensor.status,
      todayReps: 0,
      sessionReps: 0,
      autoReps: 0,
      manualAdjustment: 0,
      date: dateKey(this.now()),
      calibration: null,
      calibrated: this.profile !== null,
      lastRejected: null,
      lastRepAt: 0,
      save: { status: 'idle', dirty: false },
      wakeLock: this.wake?.state ?? 'unsupported',
      sampleRate: 0,
    };

    this.unsubs.push(
      this.sensor.on('sample', (s) => this.onSample(s)),
      this.sensor.on('status', (s) => this.onSensorStatus(s)),
      this.detector.on('frame', (f) => this.emit('frame', f)),
      this.detector.on('state', (e) => this.recorder.event({ t: e.t, type: 'state', from: e.from, to: e.to })),
      this.detector.on('rep', (m) => this.recorder.event({ t: m.endedAt, type: 'rep', metrics: m })),
      this.detector.on('rejected', (r) => this.recorder.event({ t: r.t, type: 'rejected', reason: r.reason, metrics: r.metrics })),
      this.detector.on('rep', (m) => this.onDetectedRep(m)),
      this.detector.on('rejected', (r) => {
        const depth = r.metrics.depthDown ?? 0;
        const significant = r.reason !== 'noise' && (depth >= this.detector.config.minDepth * 0.6 || r.reason === 'sensor-gap');
        this.patch({ lastRejected: { reason: r.reason, at: Date.now(), significant } });
        this.emit('rejected', r.reason);
      }),
    );
  }

  get snapshot(): WorkoutSnapshot {
    return this.snap;
  }

  get calibrationProfile(): CalibrationProfile | null {
    return this.profile;
  }

  get isActive(): boolean {
    return this.session !== null;
  }

  /** 애니메이션 컨트롤러용 입력 피드 */
  readonly feed: MotionFeed = {
    onFrame: (fn) => this.on('frame', fn),
    onRep: (fn) => this.on('rep', (e) => fn(e.reps)),
    onRejected: (fn) => this.on('rejected', fn),
    onTracking: (fn) => this.on('tracking', fn),
  };

  // ---------------------------------------------------------------- 수명 주기

  /**
   * 운동 시작. 'auto' 는 센서 권한을 요청하므로 사용자 클릭 핸들러 안에서 호출해야 한다.
   * 센서를 쓸 수 없으면 수동 카운트로 계속할 수 있다.
   */
  async start(opts: { mode?: 'auto' | 'manual'; recalibrate?: boolean } = {}): Promise<WorkoutSnapshot> {
    if (this.session) return this.snap;
    const mode = opts.mode ?? 'auto';
    const nowD = this.now();
    const date = dateKey(nowD);
    const id = uid();
    this.session = {
      id,
      startedAt: nowD.toISOString(),
      endedAt: null,
      date,
      autoReps: 0,
      manualAdjustment: 0,
      finalReps: 0,
      status: 'active',
      groupId: id,
      mode,
      updatedAt: nowD.toISOString(),
    };
    this.previousSegmentsReps = 0;
    this.otherTodayReps = 0;
    if (opts.recalibrate) this.setProfile(null);
    this.recorder.clear();
    this.patch({
      phase: 'starting',
      mode,
      date,
      todayReps: 0,
      sessionReps: 0,
      autoReps: 0,
      manualAdjustment: 0,
      lastRejected: null,
      calibration: null,
    });

    // 센서 권한 요청은 사용자 제스처 직후 가장 먼저 수행해야 iOS 에서 거부되지 않는다.
    const sensorPromise = mode === 'auto' ? this.sensor.start() : Promise.resolve(this.sensor.status);
    void this.wake?.enable();

    void this.storage
      .getDaily(date)
      .then((r) => {
        if (this.session?.date === date) {
          this.otherTodayReps = r?.totalReps ?? 0;
          this.patch({ todayReps: this.otherTodayReps + this.currentFinal() });
        }
      })
      .catch(() => {});
    this.persist();

    const sensorStatus = await sensorPromise;
    if (!this.session) return this.snap;
    this.pipeline.resetAll();
    this.calibration.reset();
    const sensorOk = sensorStatus === 'waiting' || sensorStatus === 'active';
    const needCalibration = mode === 'auto' && sensorOk && !this.profile;
    this.detector.setConfig(needCalibration ? mergeConfig(CALIBRATION_CONFIG, this.tuningWithout()) : this.effectiveConfig());
    this.detector.reset();
    this.patch({
      phase: needCalibration ? 'calibrating' : 'running',
      calibration: needCalibration ? { target: this.calibration.target, done: 0 } : null,
    });
    this.updateTracking();
    return this.snap;
  }

  pause(): void {
    if (!this.session || (this.snap.phase !== 'running' && this.snap.phase !== 'calibrating')) return;
    this.resumePhase = this.snap.phase;
    this.pipeline.resetMotion();
    this.session = { ...this.session, status: 'paused', updatedAt: this.now().toISOString() };
    this.patch({ phase: 'paused' });
    this.updateTracking();
    this.persist();
  }
  private resumePhase: WorkoutPhase = 'running';

  resume(): void {
    if (!this.session || this.snap.phase !== 'paused') return;
    this.pipeline.resetMotion();
    this.session = { ...this.session, status: 'active', updatedAt: this.now().toISOString() };
    this.patch({ phase: this.resumePhase });
    this.updateTracking();
    this.persist();
  }

  /** 운동 종료. 저장 완료까지 기다린다 (실패해도 세션 상태는 메모리에 남아 재시도 가능) */
  async end(): Promise<void> {
    if (!this.session) return;
    const t = this.now().toISOString();
    this.session = { ...this.session, status: 'completed', endedAt: t, updatedAt: t };
    this.sensor.stop();
    void this.wake?.disable();
    this.detector.reset();
    this.patch({ phase: 'ended', calibration: null });
    this.updateTracking();
    this.persist();
    await this.flush();
    if (!this.snap.save.dirty) this.session = null;
  }

  /** 종료 화면을 닫고 초기 상태로 */
  reset(): void {
    if (this.session && this.snap.phase !== 'ended') return;
    if (this.snap.save.dirty) return; // 저장 전 데이터 보존
    this.session = null;
    this.patch({ phase: 'idle', sessionReps: 0, autoReps: 0, manualAdjustment: 0, calibration: null });
  }

  /** 센서 권한 재요청 (거부 후 설정 변경 시) */
  async retrySensor(): Promise<SensorStatus> {
    const s = await this.sensor.start();
    if (s === 'waiting' || s === 'active') {
      this.patch({ mode: 'auto' });
      if (this.session && this.session.mode === 'manual') this.session = { ...this.session, mode: 'auto' };
      if (this.snap.phase === 'running' && !this.profile) {
        this.calibration.reset();
        this.detector.setConfig(mergeConfig(CALIBRATION_CONFIG, this.tuningWithout()));
        this.patch({ phase: 'calibrating', calibration: { target: this.calibration.target, done: 0 } });
      }
    }
    this.updateTracking();
    return s;
  }

  /** 보정 건너뛰기 — 기본 임계값 사용 (진행도는 제공하지 않음) */
  skipCalibration(): void {
    if (this.snap.phase !== 'calibrating') return;
    this.detector.setConfig(this.effectiveConfig());
    this.patch({ phase: 'running', calibration: null });
  }

  /** 저장된 보정값 삭제 */
  clearCalibration(): void {
    this.setProfile(null);
  }

  // ---------------------------------------------------------------- 카운트

  adjust(delta: 1 | -1): void {
    if (!this.session || this.snap.phase === 'ended' || this.snap.phase === 'idle') return;
    this.rolloverIfNeeded();
    const s = this.session;
    const next = s.manualAdjustment + delta;
    if (computeFinalReps(s.autoReps, next) === computeFinalReps(s.autoReps, s.manualAdjustment) && delta < 0) return;
    this.session = { ...s, manualAdjustment: next, updatedAt: this.now().toISOString() };
    if (typeof performance !== 'undefined') this.mark(delta > 0 ? 'manual+1' : 'manual-1');
    this.afterCountChange(null, delta > 0);
  }

  private onDetectedRep(m: RepMetrics): void {
    if (!this.session) return;
    if (this.snap.phase === 'calibrating') {
      const profile = this.calibration.add(m);
      this.patch({ calibration: { target: this.calibration.target, done: this.calibration.count } });
      if (profile) {
        this.setProfile(profile);
        this.detector.setConfig(this.effectiveConfig());
        this.patch({ phase: 'running', calibration: null });
      }
      if (!this.countCalibrationReps) return;
    } else if (this.snap.phase !== 'running') {
      return;
    }
    this.rolloverIfNeeded();
    this.session = { ...this.session, autoReps: this.session.autoReps + 1, updatedAt: this.now().toISOString() };
    this.afterCountChange(m, true);
  }

  private afterCountChange(metrics: RepMetrics | null, isIncrement: boolean): void {
    const s = this.session!;
    const final = computeFinalReps(s.autoReps, s.manualAdjustment);
    this.patch({
      autoReps: s.autoReps,
      manualAdjustment: s.manualAdjustment,
      sessionReps: this.previousSegmentsReps + final,
      todayReps: this.otherTodayReps + final,
      lastRepAt: isIncrement ? Date.now() : this.snap.lastRepAt,
    });
    if (isIncrement || metrics) this.emit('rep', { reps: this.snap.sessionReps, metrics });
    this.persist();
  }

  /**
   * 자정 경계 처리: 현재 시각의 현지 날짜가 세션 날짜와 다르면 현재 세그먼트를 닫고
   * 같은 groupId 로 새 날짜 세그먼트를 연다. 이후 확정되는 횟수는 새 날짜에 기록된다.
   */
  private rolloverIfNeeded(): void {
    const s = this.session;
    if (!s) return;
    const nowD = this.now();
    const today = dateKey(nowD);
    if (today === s.date) return;
    const iso = nowD.toISOString();
    const closed: WorkoutSession = { ...s, status: 'completed', endedAt: iso, updatedAt: iso };
    this.session = closed;
    this.persist();
    this.previousSegmentsReps += computeFinalReps(s.autoReps, s.manualAdjustment);
    this.session = {
      id: uid(),
      startedAt: iso,
      endedAt: null,
      date: today,
      autoReps: 0,
      manualAdjustment: 0,
      finalReps: 0,
      status: s.status === 'paused' ? 'paused' : 'active',
      groupId: s.groupId,
      mode: s.mode,
      updatedAt: iso,
    };
    this.otherTodayReps = 0;
    this.patch({ date: today, todayReps: 0, autoReps: 0, manualAdjustment: 0 });
    void this.storage
      .getDaily(today)
      .then((r) => {
        if (this.session?.date === today) {
          this.otherTodayReps = Math.max(0, (r?.totalReps ?? 0) - this.currentFinal());
          this.patch({ todayReps: this.otherTodayReps + this.currentFinal() });
        }
      })
      .catch(() => {});
  }

  /** 자정이 지났는지 주기적으로 확인 (UI 에서 1분 간격 호출) */
  tick(): void {
    if (this.session && this.snap.phase !== 'ended') {
      const before = this.session.date;
      this.rolloverIfNeeded();
      if (before !== this.session.date) this.persist();
    }
  }

  // ---------------------------------------------------------------- 저장

  /**
   * 현재 세션 상태 전체를 저장한다. 저장은 직렬화되며, 진행 중이면 끝난 뒤
   * 최신 상태로 한 번 더 저장한다. 전체 상태를 덮어쓰므로 재시도해도 중복 집계되지 않는다.
   */
  private persist(): void {
    if (!this.session) return;
    this.pendingQueue.set(this.session.id, { ...this.session });
    this.patch({ save: { ...this.snap.save, dirty: true } });
    if (this.pendingSave) return;
    this.pendingSave = true;
    this.saveChain = this.saveChain.then(() => this.drain());
  }
  private pendingQueue = new Map<string, WorkoutSession>();

  private async drain(): Promise<void> {
    let failures = 0;
    while (this.pendingQueue.size) {
      const [id, s] = this.pendingQueue.entries().next().value as [string, WorkoutSession];
      this.patch({ save: { status: 'saving', dirty: true } });
      try {
        const record = await this.storage.saveSession(s);
        // 저장 중에 같은 세션이 다시 바뀌었으면 큐에 새 값이 있다.
        if (this.pendingQueue.get(id) === s) this.pendingQueue.delete(id);
        this.emit('saved', record);
        failures = 0;
      } catch (e) {
        failures++;
        if (failures > this.autoRetries) {
          this.pendingSave = false;
          this.patch({ save: { status: 'error', dirty: true, error: errorMessage(e) } });
          return;
        }
        await new Promise((r) => (this.retryTimer = setTimeout(r, 300 * 2 ** failures)));
      }
    }
    this.pendingSave = false;
    this.patch({ save: { status: 'idle', dirty: false } });
  }

  /** 저장 실패 후 사용자가 누르는 '다시 시도' */
  retrySave(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (!this.pendingSave && this.pendingQueue.size) {
      this.pendingSave = true;
      this.saveChain = this.saveChain.then(() => this.drain());
    }
    return this.flush();
  }

  flush(): Promise<void> {
    return this.saveChain;
  }

  // ---------------------------------------------------------------- 센서

  private onSample(s: MotionSample): void {
    const phase = this.snap.phase;
    if (phase !== 'running' && phase !== 'calibrating') return;
    this.recorder.sample(s);
    this.pipeline.push(s);
  }

  private onSensorStatus(status: SensorStatus): void {
    if (status === 'stalled') {
      this.detector.reset();
    }
    this.patch({ sensorStatus: status, sampleRate: Math.round(this.sensor.sampleRate) });
    this.updateTracking();
  }

  private updateTracking(): void {
    const t =
      (this.snap.phase === 'running' || this.snap.phase === 'calibrating') &&
      this.sensor.status === 'active' &&
      this.snap.mode === 'auto';
    if (t !== this.tracking) {
      this.tracking = t;
      this.emit('tracking', t);
    }
  }

  /** 수신 속도 표시 갱신 (UI 에서 주기 호출) */
  refreshSensorInfo(): void {
    const r = Math.round(this.sensor.sampleRate);
    if (r !== this.snap.sampleRate) this.patch({ sampleRate: r });
  }

  /** 센서 기록 내보내기 (설정 > 문제 진단) */
  exportSensorLog(): SensorLogFile {
    return this.recorder.export(this.detector.config, this.profile !== null);
  }

  /** 수동 보정 등 사용자가 '인식이 틀렸다'고 알려 준 시점을 기록에 표시 */
  private mark(label: string): void {
    this.recorder.event({ t: performance.now(), type: 'mark', label });
  }

  // ---------------------------------------------------------------- 임계값

  effectiveConfig(): DetectorConfig {
    return mergeConfig(CalibrationManager.apply(DEFAULT_CONFIG, this.profile), this.tuning);
  }

  get tuningOverrides(): Partial<DetectorConfig> {
    return { ...this.tuning };
  }

  /** 디버그 패널에서 임계값 조정 (localStorage 에 저장) */
  setTuning(patch: Partial<DetectorConfig>): void {
    this.tuning = { ...patch };
    saveTuning(this.tuning);
    if (this.snap.phase !== 'calibrating') this.detector.setConfig(this.effectiveConfig());
  }

  private tuningWithout(): Partial<DetectorConfig> {
    // 보정 중에는 보정값 관련 키는 적용하지 않는다
    const { velStart: _v, minDepth: _m, expectedDepth: _e, ...rest } = this.tuning;
    return rest;
  }

  private setProfile(p: CalibrationProfile | null): void {
    this.profile = p;
    CalibrationManager.save(p);
    this.patch({ calibrated: p !== null });
  }

  private currentFinal(): number {
    return this.session ? computeFinalReps(this.session.autoReps, this.session.manualAdjustment) : 0;
  }

  private patch(p: Partial<WorkoutSnapshot>): void {
    this.snap = { ...this.snap, ...p };
    this.emit('change', this.snap);
  }

  destroy(): void {
    this.sensor.stop();
    void this.wake?.disable();
    this.unsubs.forEach((u) => u());
    this.clear();
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'QuotaExceededError') return '저장 공간이 부족합니다.';
    return e.message || '알 수 없는 오류';
  }
  return String(e);
}

function loadTuning(): Partial<DetectorConfig> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TUNING_KEY) : null;
    return raw ? (JSON.parse(raw) as Partial<DetectorConfig>) : {};
  } catch {
    return {};
  }
}

function saveTuning(t: Partial<DetectorConfig>): void {
  try {
    if (Object.keys(t).length) localStorage.setItem(TUNING_KEY, JSON.stringify(t));
    else localStorage.removeItem(TUNING_KEY);
  } catch {
    /* noop */
  }
}
