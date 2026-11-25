import { ChevronDown, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeStats } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL, type WorkoutSession } from '../../core/storage/types';
import { dateKey, formatKorean, formatTime, parseKey } from '../../core/util/date';
import { storage } from '../../services';
import { BottomSheet } from '../components/BottomSheet';
import { PageHeader } from '../components/Chrome';
import { GrapeBunch } from '../components/GrapeBunch';
import { SettingsSheet } from '../components/SettingsSheet';
import { useDailyRecords, useToday } from '../hooks/useRecords';

const STATUS_TEXT: Record<WorkoutSession['status'], string> = {
  active: '진행 중',
  paused: '일시정지',
  completed: '',
  interrupted: '중단됨',
};

export function GrapesScreen() {
  const today = useToday();
  const { records } = useDailyRecords();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [selected, setSelected] = useState(today);
  const [moreStats, setMoreStats] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const map = useMemo(() => new Map(records.map((r) => [r.date, r])), [records]);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const stats = useMemo(() => computeStats(records, today, monthPrefix), [records, today, monthPrefix]);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    const k = dateKey(d);
    setSelected(today.startsWith(k.slice(0, 7)) ? today : k);
  };

  const selReps = map.get(selected)?.totalReps ?? 0;
  const closeDay = useCallback(() => setDayOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <main className="screen grapes-screen">
      <PageHeader
        title="포도알"
        right={
          <button className="icon-btn" aria-label="설정" onClick={() => setSettingsOpen(true)}>
            <Settings size={22} strokeWidth={2} />
          </button>
        }
      />

      {/* 1순위: 월간 포도알 스티커판 */}
      <section className="board" aria-label="월간 포도알">
        <div className="board-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="이전 달">
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <h2 className="board-month">
            {cursor.y}.{String(cursor.m + 1).padStart(2, '0')}
          </h2>
          <button className="icon-btn" onClick={() => move(1)} aria-label="다음 달">
            <ChevronRight size={20} strokeWidth={2} />
          </button>
        </div>
        <p className="board-count">
          목표 달성 <b>{stats.monthGoalDays}</b>
          <span>/{daysInMonth}일</span>
        </p>

        <GrapeBunch year={cursor.y} month0={cursor.m} repsOf={(k) => map.get(k)?.totalReps ?? 0} today={today} selected={selected} onSelect={setSelected} />
      </section>

      {/* 2순위: 핵심 통계 */}
      <section className="kstats" aria-label="운동 통계">
        <div className="kstats-line">
          <span>
            {cursor.m + 1}월 스쿼트 <b>{stats.monthReps.toLocaleString('ko-KR')}회</b>
          </span>
          <i className="kstats-sep" aria-hidden="true" />
          <span>
            연속 달성 <b>{stats.currentStreak}일</b>
          </span>
          <button className="kstats-more" aria-expanded={moreStats} aria-controls="more-stats" onClick={() => setMoreStats((v) => !v)}>
            {moreStats ? '접기' : '더보기'}
            <ChevronDown size={14} strokeWidth={2} className={moreStats ? 'rot' : ''} />
          </button>
        </div>
        {moreStats && (
          <dl id="more-stats" className="kstats-more-list">
            <div>
              <dt>전체 누적 스쿼트</dt>
              <dd>{stats.totalReps.toLocaleString('ko-KR')}회</dd>
            </div>
            <div>
              <dt>전체 목표 달성일</dt>
              <dd>{stats.totalGoalDays.toLocaleString('ko-KR')}일</dd>
            </div>
            <div>
              <dt>최장 연속 달성</dt>
              <dd>{stats.longestStreak}일</dd>
            </div>
          </dl>
        )}
      </section>

      {/* 3순위: 선택한 날짜 요약 → 상세는 하단 시트 */}
      <button className="day-summary" onClick={() => setDayOpen(true)} aria-haspopup="dialog">
        <span>
          <span className="day-summary-date">{formatKorean(selected)}</span>
          <span className="day-summary-text">
            {selReps > 0 ? (
              <>
                스쿼트 {selReps}회 · <span className={selReps >= DAILY_GOAL ? 'is-done' : ''}>{selReps >= DAILY_GOAL ? '목표 달성' : '목표 미달성'}</span>
              </>
            ) : selected > today ? (
              '아직 오지 않은 날'
            ) : (
              '운동 기록 없음'
            )}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={2} />
      </button>

      <DaySheet open={dayOpen} onClose={closeDay} date={selected} total={selReps} records={records} />
      <SettingsSheet open={settingsOpen} onClose={closeSettings} />
    </main>
  );
}

/** 날짜별 세션 상세 (기존 세션 기록을 조회만 한다) */
function DaySheet({ open, onClose, date, total, records }: { open: boolean; onClose: () => void; date: string; total: number; records: unknown }) {
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSessions(null);
    storage
      .getSessionsByDate(date)
      .then((s) => alive && setSessions(s))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [open, date, records]);

  const d = parseKey(date);
  const done = total >= DAILY_GOAL;
  return (
    <BottomSheet open={open} onClose={onClose} title={`${d.getMonth() + 1}월 ${d.getDate()}일 운동 기록`}>
      <div className="ds-total">
        <span>
          총 <b>{total}</b> / {DAILY_GOAL}회
        </span>
        <span className={`badge ${done ? 'badge-done' : ''}`}>{done ? '목표 달성' : total > 0 ? `목표까지 ${DAILY_GOAL - total}회` : '기록 없음'}</span>
      </div>
      {sessions === null ? (
        <p className="caption">불러오는 중</p>
      ) : sessions.length === 0 ? (
        <p className="caption ds-empty">이 날은 운동 기록이 없습니다.</p>
      ) : (
        <ul className="ds-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span className="ds-time">{formatTime(s.startedAt)}</span>
              <span className="ds-desc">
                {s.mode === 'manual' ? '수동 기록' : `자동 ${s.autoReps}회`}
                {s.mode === 'auto' && s.manualAdjustment !== 0 ? ` · 보정 ${s.manualAdjustment > 0 ? '+' : ''}${s.manualAdjustment}` : ''}
                {s.groupId !== s.id ? ' · 자정 이후 이어서' : ''}
                {STATUS_TEXT[s.status] ? ` · ${STATUS_TEXT[s.status]}` : ''}
              </span>
              <span className="ds-reps">{s.finalReps}회</span>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
