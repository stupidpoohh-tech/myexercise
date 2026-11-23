import { useEffect, useRef, useState } from 'react';
import { GrapeBerry } from './graphics';

/**
 * 이번 달 포도알 판. 목표 달성일 수만큼 앞에서부터 한 알씩 채운다.
 * 새로 늘어난 포도알에는 등장 효과를 준다.
 */
export function GrapeBoard({ filled, total, monthKey }: { filled: number; total: number; monthKey: string }) {
  const prev = useRef<{ key: string; filled: number } | null>(null);
  const [popFrom, setPopFrom] = useState<number | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p && p.key === monthKey && filled > p.filled) setPopFrom(p.filled);
    prev.current = { key: monthKey, filled };
  }, [filled, monthKey]);

  return (
    <div className="grape-board" aria-label={`이번 달 포도알 ${filled}개 / ${total}일`}>
      {Array.from({ length: total }, (_, i) => (
        <GrapeBerry key={i} filled={i < filled} pop={popFrom !== null && i >= popFrom && i < filled} size={30} />
      ))}
    </div>
  );
}
