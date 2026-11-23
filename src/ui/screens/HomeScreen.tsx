import { dayStatus, lastNDays } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL } from '../../core/storage/types';
import { formatKorean, parseKey, weekdayLabel } from '../../core/util/date';
import { CharacterStage } from '../components/CharacterStage';
import { GoalBar, StickerMark } from '../components/common';
import { useDailyRecords, useToday } from '../hooks/useRecords';

export function HomeScreen({ onStart, onRecords }: { onStart: () => void; onRecords: () => void }) {
  const today = useToday();
  const { records, error } = useDailyRecords();
  const map = new Map(records.map((r) => [r.date, r]));
  const todayReps = map.get(today)?.totalReps ?? 0;
  const done = todayReps >= DAILY_GOAL;

  return (
    <main className="screen home">
      <header className="home-head">
        <div className="home-date">{formatKorean(today)}</div>
        <button className="link-btn" onClick={onRecords}>
          기록 <span aria-hidden>›</span>
        </button>
      </header>

      <section className="home-stage">
        <CharacterStage />
      </section>

      <section className="home-count" aria-live="polite">
        <div className="count-line">
          <span className={`count-big ${done ? 'is-done' : ''}`}>{todayReps}</span>
          <span className="count-goal">/ {DAILY_GOAL}</span>
        </div>
        <GoalBar value={todayReps} />
        <div className="count-caption">{done ? '오늘 목표 달성' : `목표까지 ${DAILY_GOAL - todayReps}회`}</div>
      </section>

      <button className="btn-primary btn-start" onClick={onStart}>
        운동 시작
      </button>

      <section className="week" aria-label="최근 7일">
        {lastNDays(7, today).map((d) => {
          const r = map.get(d);
          const st = dayStatus(r);
          return (
            <div key={d} className={`week-day st-${st} ${d === today ? 'is-today' : ''}`}>
              <span className="week-label">{weekdayLabel(d)}</span>
              <span className="week-dot">{st === 'done' ? <StickerMark size="sm" /> : parseKey(d).getDate()}</span>
              <span className="week-reps">{r?.totalReps ? r.totalReps : ''}</span>
            </div>
          );
        })}
      </section>
      {error && <p className="error-text">기록을 불러오지 못했습니다: {error}</p>}
    </main>
  );
}
