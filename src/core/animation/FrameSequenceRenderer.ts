import type { CharacterPose, CharacterRenderer, CharacterEvent } from './types';

export interface FrameSequenceOptions {
  /** 서 있음(0) → 최저 자세(마지막) 순서의 이미지 URL 목록 */
  frames: string[];
  /** 대기(IDLE) 중 반복할 프레임 (선택) */
  idleFrames?: string[];
  idleFps?: number;
  alt?: string;
  onEvent?: (e: CharacterEvent) => void;
}

/**
 * 에셋 연결 예시: 깊이(depth)에 맞춰 이미지 시퀀스의 프레임을 고르는 범용 렌더러.
 * 캐릭터 에셋이 '앉는 동작 프레임 이미지' 형태로 제공되면 URL 목록만 넘기면 된다.
 * 스프라이트 시트·Lottie·Spine 등 다른 형식은 CharacterRenderer 를 같은 방식으로 구현한다.
 */
export class FrameSequenceRenderer implements CharacterRenderer {
  private img: HTMLImageElement | null = null;
  private current = '';
  private idleStart = 0;

  constructor(private opts: FrameSequenceOptions) {
    // 깜빡임 방지를 위해 미리 로드
    [...opts.frames, ...(opts.idleFrames ?? [])].forEach((src) => {
      const i = new Image();
      i.src = src;
    });
  }

  mount(container: HTMLElement): void {
    this.img = document.createElement('img');
    this.img.alt = this.opts.alt ?? '';
    this.img.className = 'frame-sequence';
    this.img.draggable = false;
    container.appendChild(this.img);
  }

  render(p: CharacterPose): void {
    if (!this.img) return;
    const { frames, idleFrames, idleFps = 8 } = this.opts;
    let src: string;
    if (p.state === 'IDLE' && p.depth < 0.02 && idleFrames?.length) {
      if (!this.idleStart) this.idleStart = performance.now();
      const i = Math.floor(((performance.now() - this.idleStart) / 1000) * idleFps) % idleFrames.length;
      src = idleFrames[i];
    } else {
      this.idleStart = 0;
      const i = Math.round(p.depth * (frames.length - 1));
      src = frames[Math.max(0, Math.min(frames.length - 1, i))];
    }
    if (src && src !== this.current) {
      this.img.src = src;
      this.current = src;
    }
  }

  onEvent(e: CharacterEvent): void {
    this.opts.onEvent?.(e);
  }

  destroy(): void {
    this.img?.remove();
    this.img = null;
  }
}
