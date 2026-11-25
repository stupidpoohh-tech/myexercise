import { DAILY_GOAL } from '../../core/storage/types';
import { dateKey, formatKorean } from '../../core/util/date';
import { DayBerry } from './graphics';

/**
 * 포도송이 모양 배치. 위에서부터 줄마다 놓을 알 수이며, 날짜 수(28~31)만큼 앞에서부터 채운다.
 * 합계 31 — 짧은 달은 아래쪽 끝이 줄어든다.
 */
const BUNCH_ROWS = [5, 6, 6, 5, 4, 3, 2];

export function bunchRows(days: number): number[][] {
  const rows: number[][] = [];
  let d = 1;
  for (const n of BUNCH_ROWS) {
    const row: number[] = [];
    for (let i = 0; i < n && d <= days; i++) row.push(d++);
    if (row.length) rows.push(row);
  }
  return rows;
}

/** 월간 포도송이 스티커판 (내 기록·공유 화면 공용) */
export function GrapeBunch({
  year,
  month0,
  repsOf,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month0: number;
  repsOf: (date: string) => number;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const rows = bunchRows(new Date(year, month0 + 1, 0).getDate());
  return (
    <div className="bunch">
      <svg className="bunch-top" viewBox="0 0 48 26" aria-hidden="true">
        <path d="M22 26 V12 C22 7 23.5 4 27 2" stroke="var(--stem)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M24 11 C28 3 39 2 44 7 C39 13 29 15 24 11Z" fill="var(--leaf)" />
      </svg>
      {rows.map((row, i) => (
        <div className="bunch-row" key={i}>
          {row.map((day) => {
            const k = dateKey(new Date(year, month0, day));
            const reps = repsOf(k);
            return (
              <button
                key={day}
                className="bunch-berry"
                onClick={() => onSelect(k)}
                aria-pressed={k === selected}
                aria-label={`${formatKorean(k)} ${reps}회${reps >= DAILY_GOAL ? ', 목표 달성' : ''}${k === today ? ', 오늘' : ''}`}
              >
                <DayBerry day={day} ratio={reps / DAILY_GOAL} today={k === today} selected={k === selected} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
