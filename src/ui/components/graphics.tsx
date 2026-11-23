import { useId } from 'react';

/** 서비스 그래픽 요소: 포도알 스티커 */

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
      <circle cx="20" cy="20" r="18.5" fill={filled ? 'var(--berry)' : 'var(--berry-empty)'} />
    </svg>
  );
}

/**
 * 날짜 포도알. 미실시 = 빈 알, 1~99회 = 아래에서부터 진행률만큼 차오름, 100회 이상 = 완성된 알.
 * 선택한 날은 바깥 링, 오늘은 날짜 숫자 아래 점으로 구분한다.
 */
export function DayBerry({ day, ratio, today, selected, pop }: { day: number; ratio: number; today?: boolean; selected?: boolean; pop?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const done = ratio >= 1;
  const partial = ratio > 0 && !done;
  const h = 37 * Math.min(1, Math.max(0, ratio));
  return (
    <svg className={`day-berry ${done ? 'is-done' : partial ? 'is-partial' : 'is-empty'} ${pop ? 'pop-in' : ''}`} viewBox="0 0 44 44" aria-hidden="true">
      {selected && <circle cx="22" cy="22" r="21" fill="none" stroke="var(--berry-select)" strokeWidth="2" />}
      <circle cx="22" cy="22" r="18.5" fill={done ? 'var(--berry)' : 'var(--berry-empty)'} />
      {partial && (
        <>
          <clipPath id={`c${uid}`}>
            <rect x="0" y={40.5 - h} width="44" height={h} />
          </clipPath>
          <circle cx="22" cy="22" r="18.5" fill="var(--berry-partial)" clipPath={`url(#c${uid})`} />
        </>
      )}
      {day > 0 && (
        <text x="22" y="22" dy="0.36em" textAnchor="middle" className="day-berry-num">
          {day}
        </text>
      )}
      {today && <circle cx="22" cy="31" r="1.6" className="day-berry-today" />}
    </svg>
  );
}
