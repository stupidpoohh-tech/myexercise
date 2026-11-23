import type { CharacterEvent, CharacterPose, CharacterRenderer } from './types';

const NS = 'http://www.w3.org/2000/svg';

/**
 * 개발용 임시 도형 렌더러. 실제 캐릭터가 아니며, 센서 상태와 애니메이션이
 * 실시간으로 연동되는지 확인하는 용도로만 쓴다. 에셋 제공 후 교체 대상.
 *
 * 원(머리) + 사각형(몸통) + 관절선(다리)의 기하 도형만 사용한다.
 */
export class PlaceholderRenderer implements CharacterRenderer {
  private svg: SVGSVGElement | null = null;
  private head!: SVGCircleElement;
  private torso!: SVGRectElement;
  private legs!: SVGPolylineElement[];
  private ground!: SVGLineElement;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  mount(container: HTMLElement): void {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 240');
    svg.setAttribute('class', 'placeholder-figure');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '임시 동작 표시');

    this.ground = el('line', { x1: 30, x2: 170, y1: 226, y2: 226, class: 'ph-ground' });
    this.legs = [el('polyline', { class: 'ph-limb' }), el('polyline', { class: 'ph-limb ph-limb-back' })];
    this.torso = el('rect', { width: 36, height: 70, rx: 10, class: 'ph-body' });
    this.head = el('circle', { r: 18, class: 'ph-body' });
    const label = el('text', { x: 100, y: 16, 'text-anchor': 'middle', class: 'ph-label' });
    label.textContent = 'PLACEHOLDER';

    svg.append(this.ground, this.legs[1], this.legs[0], this.torso, this.head, label);
    container.appendChild(svg);
    this.svg = svg;
  }

  render(p: CharacterPose): void {
    if (!this.svg) return;
    const d = p.depth;
    // 간단한 기하: 발 고정, 엉덩이가 내려가며 뒤로 빠지고 무릎이 앞으로 나온다.
    const footY = 224;
    const leg = 92; // 허벅지+정강이
    const hipDrop = d * 58;
    const hipY = footY - leg + hipDrop;
    const hipX = 100 - d * 22;
    const kneeX = 100 + d * 26;
    const kneeY = footY - leg / 2 + hipDrop * 0.35;
    const lean = d * 22; // 몸통 기울기 (deg)

    this.legs[0].setAttribute('points', `${hipX},${hipY} ${kneeX},${kneeY} 104,${footY}`);
    this.legs[1].setAttribute('points', `${hipX + 6},${hipY} ${kneeX + 6},${kneeY} 110,${footY}`);
    this.torso.setAttribute('x', String(hipX - 18));
    this.torso.setAttribute('y', String(hipY - 70));
    this.torso.setAttribute('transform', `rotate(${lean} ${hipX} ${hipY})`);
    const rad = (lean * Math.PI) / 180;
    this.head.setAttribute('cx', String(hipX + Math.sin(rad) * 92));
    this.head.setAttribute('cy', String(hipY - Math.cos(rad) * 92));

    this.svg.dataset.state = p.state;
    this.svg.dataset.tracking = String(p.tracking);
    this.svg.dataset.known = String(p.progressKnown);
  }

  onEvent(e: CharacterEvent): void {
    if (!this.svg) return;
    if (e.type === 'rep' || e.type === 'rejected') {
      const cls = e.type === 'rep' ? 'ph-flash-ok' : 'ph-flash-no';
      this.svg.classList.remove('ph-flash-ok', 'ph-flash-no');
      void this.svg.getBoundingClientRect();
      this.svg.classList.add(cls);
      if (this.flashTimer) clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => this.svg?.classList.remove(cls), 450);
    }
  }

  destroy(): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.svg?.remove();
    this.svg = null;
  }
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
