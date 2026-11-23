import { useEffect, useRef } from 'react';
import { createCharacterRenderer } from '../../character';
import type { CharacterId } from '../../character';
import { useGrowth } from '../hooks/useGrowth';
import { animation } from '../../services';

/** 캐릭터 표시 영역. 렌더러는 character/index.ts 의 팩토리로 생성한다 */
/** character 를 주지 않으면 현재 성장 단계의 캐릭터를 보여 준다 */
export function CharacterStage({ className = '', character }: { className?: string; character?: CharacterId }) {
  const ref = useRef<HTMLDivElement>(null);
  const growth = useGrowth();
  const id = character ?? growth.character;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const renderer = createCharacterRenderer(id);
    renderer.mount(el);
    const detach = animation.attach(renderer);
    return () => {
      detach();
      renderer.destroy();
    };
  }, [id]);
  return <div ref={ref} className={`character-stage ${className}`} />;
}
