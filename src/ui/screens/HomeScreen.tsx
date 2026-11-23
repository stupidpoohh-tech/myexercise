import { ChevronRight, Play } from 'lucide-react';
import { computeStats, dayStatus, lastNDays } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL } from '../../core/storage/types';
import { formatKorean, parseKey, weekdayLabel } from '../../core/util/date';
import { CharacterStage } from '../components/CharacterStage';
import { AppHeader, type Route } from '../components/Chrome';
import { GrapeBerry, SquatIcon } from '../components/graphics';
import { GrapeBoard } from '../components/GrapeBoard';
import { Button, Card, ProgressBar, SectionHeader } from '../components/ui';
import { useDailyRecords, useToday } from '../hooks/useRecords';

export function HomeScreen({ onStart, onNavigate }: { onStart: () => void; onNavigate: (r: Route) => void }) {
  const today = useToday();
  const { records, error } = useDailyRecords();
  const map = new Map(records.map((r) => [r.date, r]));
  const todayReps = map.get(today)?.totalReps ?? 0;
  const d = parseKey(today);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const monthKey = today.slice(0, 7);
  const stats = computeStats(records, today, monthKey);

  return (
    <main className="screen">
      <AppHeader onNavigate={onNavigate} />

      <div className="date-row">
        <h1 className="date-title">{formatKorean(today)}</h1>
        <button className="link" onClick={() => onNavigate('records')}>
          기록 <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>

      <Card className="today-card">
        <div className="today-info">
          <div className="today-label">
            <span className="icon-tile">
              <SquatIcon size={26} />
            </span>
            <div>
              <div className="caption">오늘의 운동</div>
              <div className="card-title">스쿼트 {DAILY_GOAL}개</div>
            </div>
          </div>
          <div className="today-progress">
            <div className="reps">
              <span className="reps-now">{todayReps}</span>
              <span className="reps-goal"> / {DAILY_GOAL}</span>
            </div>
            <ProgressBar value={todayReps} max={DAILY_GOAL} />
          </div>
        </div>

        <div className="stage">
          <CharacterStage />
        </div>

        <Button icon={<Play size={20} fill="currentColor" strokeWidth={0} />} onClick={onStart}>
          {todayReps >= DAILY_GOAL ? '운동 더 하기' : '운동 시작'}
        </Button>
      </Card>

      <section>
        <SectionHeader
          title="이번 달 포도알"
          right={
            <button className="link count-link" onClick={() => onNavigate('records')} aria-label="이번 달 기록 보기">
              <b>{stats.monthGoalDays}</b>
              <span> / {daysInMonth}</span>
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          }
        />
        <Card tone="pale" className="board-card">
          <GrapeBoard filled={stats.monthGoalDays} total={daysInMonth} monthKey={monthKey} />
        </Card>
      </section>

      <section className="week" aria-label="최근 7일">
        {lastNDays(7, today).map((k) => {
          const st = dayStatus(map.get(k));
          return (
            <button key={k} className={`week-day ${k === today ? 'is-today' : ''}`} onClick={() => onNavigate('records')}>
              <span className="week-label">{weekdayLabel(k)}</span>
              <span className={`week-num st-${st}`}>{parseKey(k).getDate()}</span>
              <span className="week-mark">{st === 'done' ? <GrapeBerry filled size={12} label="목표 달성" /> : st === 'progress' ? <i className="dot" /> : null}</span>
            </button>
          );
        })}
      </section>
      {error && <p className="error-text">기록을 불러오지 못했습니다: {error}</p>}
    </main>
  );
}
