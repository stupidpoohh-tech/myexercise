import { useEffect, useRef } from 'react';
import { createCharacterRenderer } from '../../character';
import { animation } from '../../services';

/** 캐릭터 표시 영역. 렌더러는 character/index.ts 의 팩토리로 생성한다 */
export function CharacterStage({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const renderer = createCharacterRenderer();
    renderer.mount(el);
    const detach = animation.attach(renderer);
    return () => {
      detach();
      renderer.destroy();
    };
  }, []);
  return <div ref={ref} className={`character-stage ${className}`} />;
}
