import type { CharacterRendererFactory } from '../core/animation/types';
import { SquatSpriteRenderer, type SquatSpriteSet } from './SquatSpriteRenderer';

/**
 * 캐릭터 렌더러 교체 지점.
 * 에셋 원본: assets/character-src → `python3 scripts/build-character.py` 로 public/character/ 생성.
 * 센서·카운트·기록 로직은 이 파일과 무관하다.
 * 1·2·3 은 성장 단계별 캐릭터이며, 어느 단계를 보여 줄지는 growth.ts 가 기록으로 정한다.
 */

export const CHARACTER_IDS = ['1', '2', '3'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

const base = import.meta.env.BASE_URL;

export function spriteSet(id: CharacterId): SquatSpriteSet {
  const dir = `${base}character/${id}/`;
  const f = (i: number) => `${dir}squat_${i}.webp`;
  return {
    descent: [0, 1, 2, 3].map(f),
    ascent: [4, 5, 6, 7].map(f),
    idle: `${dir}idle.webp`,
  };
}

export function idleImage(id: CharacterId): string {
  return spriteSet(id).idle;
}

export const createCharacterRenderer = (id: CharacterId): ReturnType<CharacterRendererFactory> =>
  new SquatSpriteRenderer(spriteSet(id));
