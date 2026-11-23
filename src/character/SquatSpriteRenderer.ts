import type { CharacterEvent, CharacterPose, CharacterRenderer } from '../core/animation/types';

export interface SquatSpriteSet {
  /** 하강: 서 있음 → 최저 (depth 0 → 1) */
  descent: string[];
  /** 상승: 최저 → 서 있음 (depth 1 → 0) */
  ascent: string[];
  /** 대기 자세 */
  idle: string;
}

/** 대기 이미지로 바꾸기 전, 서 있는 상태가 유지되어야 하는 시간 (연속 반복 중 깜빡임 방지) */
const IDLE_DELAY_MS = 1200;

/**
 * 제공된 캐릭터 스쿼트 프레임 렌더러.
 * 센서 판정 상태로 하강/상승 시퀀스를 고르고, depth 로 프레임을 고른다.
 */
export class SquatSpriteRenderer implements CharacterRenderer {
  private img: HTMLImageElement | null = null;
  private root: HTMLDivElement | null = null;
  private current = '';
  private standingSince = 0;
  private lastSequence: 'descent' | 'ascent' = 'descent';
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private set: SquatSpriteSet, private alt = '캐릭터') {
    for (const src of [...set.descent, ...set.ascent, set.idle]) {
      const i = new Image();
      i.src = src;
      void i.decode?.().catch(() => {});
    }
  }

  mount(container: HTMLElement): void {
    this.root = document.createElement('div');
    this.root.className = 'sprite-character';
    this.img = document.createElement('img');
    this.img.alt = this.alt;
    this.img.draggable = false;
    this.root.appendChild(this.img);
    container.appendChild(this.root);
    this.show(this.set.idle);
  }

  render(p: CharacterPose): void {
    if (!this.img || !this.root) return;
    const { descent, ascent, idle } = this.set;
    const now = performance.now();
    let src: string;

    if (p.state === 'ASCENDING') this.lastSequence = 'ascent';
    else if (p.state === 'DESCENDING') this.lastSequence = 'descent';

    const standing = (p.state === 'IDLE' || p.state === 'COMPLETED') && p.depth < 0.05;
    if (standing) {
      if (!this.standingSince) this.standingSince = now;
    } else {
      this.standingSince = 0;
    }

    if (standing && now - this.standingSince > IDLE_DELAY_MS) {
      src = idle;
    } else if (p.state === 'BOTTOM') {
      src = descent[descent.length - 1];
    } else if (this.lastSequence === 'ascent' && p.state !== 'DESCENDING') {
      const i = Math.round((1 - p.depth) * (ascent.length - 1));
      src = ascent[clamp(i, 0, ascent.length - 1)];
    } else {
      const i = Math.round(p.depth * (descent.length - 1));
      src = descent[clamp(i, 0, descent.length - 1)];
    }
    // 아직 한 번도 움직이지 않았다면 대기 자세 유지
    if (standing && this.current === idle) src = idle;
    this.show(src);
    this.root.dataset.state = p.state;
    this.root.dataset.tracking = String(p.tracking);
  }

  onEvent(e: CharacterEvent): void {
    if (!this.root || (e.type !== 'rep' && e.type !== 'rejected')) return;
    const cls = e.type === 'rep' ? 'flash-ok' : 'flash-no';
    this.root.classList.remove('flash-ok', 'flash-no');
    void this.root.offsetWidth;
    this.root.classList.add(cls);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.root?.classList.remove(cls), 450);
  }

  destroy(): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.root?.remove();
    this.root = null;
    this.img = null;
  }

  private show(src: string): void {
    if (this.img && src !== this.current) {
      this.img.src = src;
      this.current = src;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
