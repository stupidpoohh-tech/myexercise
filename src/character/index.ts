import { PlaceholderRenderer } from '../core/animation/PlaceholderRenderer';
import type { CharacterRendererFactory } from '../core/animation/types';

/**
 * 캐릭터 렌더러 교체 지점.
 *
 * 캐릭터 에셋이 제공되면 이 팩토리만 바꾼다. 센서·카운트·기록 로직은 수정할 필요가 없다.
 * 예) 이미지 시퀀스 에셋:
 *   import { FrameSequenceRenderer } from '../core/animation/FrameSequenceRenderer';
 *   const frames = Array.from({ length: 12 }, (_, i) => `/character/squat_${i}.png`);
 *   export const createCharacterRenderer = () => new FrameSequenceRenderer({ frames });
 */
export const createCharacterRenderer: CharacterRendererFactory = () => new PlaceholderRenderer();
