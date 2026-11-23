import { useId } from 'react';

/** 서비스 그래픽 요소: 포도알 스티커, 로고, 운동 아이콘 */

/** 포도알 스티커. filled=false 는 빈 자리 */
export function GrapeBerry({ filled, size = 40, pop = false, label }: { filled: boolean; size?: number; pop?: boolean; label?: string }) {
  return (
    <svg
      className={`berry ${filled ? 'is-filled' : 'is-empty'} ${pop ? 'pop-in' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {filled ? (
        <>
          <circle cx="20" cy="20" r="18" fill="var(--berry)" stroke="var(--berry-edge)" strokeWidth="1.5" />
          <ellipse cx="13.5" cy="12.5" rx="5" ry="3.4" transform="rotate(-35 13.5 12.5)" fill="#fff" opacity="0.75" />
          <circle cx="25" cy="10.5" r="1.6" fill="#fff" opacity="0.5" />
        </>
      ) : (
        <circle cx="20" cy="20" r="18" fill="#fff" stroke="var(--berry-empty)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** 헤더용 블루 포도 아이콘 */
export function GrapeLogo({ size = 30 }: { size?: number }) {
  const berries: [number, number][] = [
    [11, 13], [19, 12], [27, 13], [15, 20], [23, 20], [19, 27],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 38 36" aria-hidden="true">
      <path d="M19 9 C19 6 20 4 22 2" stroke="#6b4a2f" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M21 6 C24 1 31 1 33 4 C30 8 24 9 21 6Z" fill="#6cc04a" stroke="#3f8a2c" strokeWidth="1" />
      {berries.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5.6" fill="var(--berry)" stroke="var(--deep)" strokeWidth="1.1" />
          <circle cx={x - 2} cy={y - 2} r="1.4" fill="#fff" opacity="0.8" />
        </g>
      ))}
    </svg>
  );
}

/** 스쿼트 선형 아이콘 (Lucide 규격: 24px, stroke 2) */
export function SquatIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4" r="2" />
      <path d="M11 7.5 9.5 12.5h5" />
      <path d="M11 9h6" />
      <path d="M9.5 12.5 14 15l-1.5 5" />
      <path d="M9.5 12.5 8 17l-1.5 3" />
      <path d="M11 20.5h3" />
    </svg>
  );
}

/**
 * 날짜 포도알. 미실시 = 빈 알, 1~99회 = 아래에서부터 진행률만큼 차오름, 100회 이상 = 완성된 알.
 */
export function DayBerry({ day, ratio, today, selected, pop }: { day: number; ratio: number; today?: boolean; selected?: boolean; pop?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const done = ratio >= 1;
  const partial = ratio > 0 && !done;
  const h = 36 * Math.min(1, Math.max(0, ratio));
  return (
    <svg className={`day-berry ${done ? 'is-done' : partial ? 'is-partial' : 'is-empty'} ${pop ? 'pop-in' : ''}`} viewBox="0 0 44 44" aria-hidden="true">
      {(selected || today) && (
        <circle cx="22" cy="22" r="21" fill="none" stroke={selected ? 'var(--deep)' : 'var(--soft)'} strokeWidth={selected ? 2 : 2.5} />
      )}
      <circle cx="22" cy="22" r="18" fill="#fff" stroke={done ? 'var(--berry-edge)' : 'var(--berry-empty)'} strokeWidth="1.5" />
      {partial && (
        <>
          <clipPath id={`c${uid}`}>
            <rect x="0" y={40 - h} width="44" height={h} />
          </clipPath>
          <circle cx="22" cy="22" r="17.2" fill="var(--berry-partial)" clipPath={`url(#c${uid})`} />
        </>
      )}
      {done && (
        <>
          <circle cx="22" cy="22" r="18" fill="var(--berry)" stroke="var(--berry-edge)" strokeWidth="1.5" />
          <ellipse cx="12.5" cy="12" rx="3.6" ry="2.3" transform="rotate(-40 12.5 12)" fill="#fff" opacity="0.8" />
        </>
      )}
      {day > 0 && (
        <text x="22" y="22" dy="0.36em" textAnchor="middle" className="day-berry-num">
          {day}
        </text>
      )}
    </svg>
  );
}
