import type { MotionFrame, RejectReason, SquatState } from '../types';

/**
 * 렌더러에 전달되는 캐릭터 자세.
 * 센서·카운트 로직과 렌더러 사이의 유일한 계약이므로, 에셋을 교체할 때는
 * 이 타입을 받는 CharacterRenderer 만 새로 구현하면 된다.
 */
export interface CharacterPose {
  /** 인식된 동작 상태 (SquatDetector 와 동일한 값) */
  state: SquatState;
  /**
   * 화면에 그릴 앉은 정도 0(서 있음)~1(최저 자세). 프레임 간 보간된 값.
   * 진행도를 모를 때는 상태만으로 만든 근사값이다.
   */
  depth: number;
  /** 센서가 추정한 원본 진행도. 불확실하면 null */
  progress: number | null;
  /** depth 가 실제 진행도 기반인지(true) 상태 기반 근사인지(false) */
  progressKnown: boolean;
  /** 이번 세션 누적 횟수 */
  reps: number;
  /** 센서 추적 중인지 (일시정지·수신중단이면 false) */
  tracking: boolean;
}

export type CharacterEvent =
  | { type: 'state'; from: SquatState; to: SquatState }
  | { type: 'rep'; reps: number }
  | { type: 'rejected'; reason: RejectReason }
  | { type: 'tracking'; tracking: boolean };

/**
 * 캐릭터 에셋 연결 인터페이스.
 * 임시 도형 렌더러(PlaceholderRenderer)를 추후 제공될 에셋 렌더러로 교체한다.
 */
export interface CharacterRenderer {
  mount(container: HTMLElement): void;
  /** 매 애니메이션 프레임마다(값이 바뀔 때) 호출 */
  render(pose: CharacterPose): void;
  /** 상태 전환·카운트 등 일회성 이벤트 */
  onEvent?(event: CharacterEvent): void;
  destroy(): void;
}

export type CharacterRendererFactory = () => CharacterRenderer;

/** 애니메이션 컨트롤러가 구독하는 입력 — 센서 분석 결과 하나뿐이다 */
export interface MotionFeed {
  onFrame(fn: (f: MotionFrame) => void): () => void;
  onRep(fn: (reps: number) => void): () => void;
  onRejected(fn: (reason: RejectReason) => void): () => void;
  onTracking(fn: (tracking: boolean) => void): () => void;
}
