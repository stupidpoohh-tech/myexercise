import { useEffect, useMemo, useRef, useState } from 'react';
import { computeStats, dayStatus } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL, type WorkoutSession } from '../../core/storage/types';
import { formatKorean, formatTime, monthGrid, parseKey, WEEKDAYS } from '../../core/util/date';
import { storage } from '../../services';
import { Banner, StickerMark } from '../components/common';
import { useDailyRecords, useToday } from '../hooks/useRecords';

const STATUS_TEXT: Record<WorkoutSession['status'], string> = {
  active: '진행 중',
  paused: '일시정지',
  completed: '완료',
  interrupted: '중단됨',
};

export function RecordsScreen({ onBack }: { onBack: () => void }) {
  const today = useToday();
  const { records, reload, error } = useDailyRecords();
  const [cursor, setCursor] = useState(() => {
    const d = parseKey(today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const map = useMemo(() => new Map(records.map((r) => [r.date, r])), [records]);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const stats = useMemo(() => computeStats(records, today, monthPrefix), [records, today, monthPrefix]);
  const weeks = monthGrid(cursor.y, cursor.m);

  useEffect(() => {
    let alive = true;
    setSessions(null);
    storage
      .getSessionsByDate(selected)
      .then((s) => alive && setSessions(s))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [selected, records]);

  const move = (delta: number) => {
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const exportJson = async () => {
    try {
      const data = await storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `squat-records-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ tone: 'info', text: `기록 ${data.sessions.length}건을 내보냈습니다.` });
    } catch (e) {
      setNotice({ tone: 'error', text: `내보내기 실패: ${e instanceof Error ? e.message : e}` });
    }
  };

  const importJson = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const res = await storage.importData(json);
      reload();
      setNotice({ tone: 'info', text: `가져오기 완료 — 세션 ${res.sessions}건, ${res.dates}일 반영 (중복 제외)` });
    } catch (e) {
      const msg = e instanceof SyntaxError ? 'JSON 형식이 아닙니다.' : e instanceof Error ? e.message : String(e);
      setNotice({ tone: 'error', text: `가져오기 실패: ${msg}` });
    }
  };

  const sel = map.get(selected);

  return (
    <main className="screen records">
      <header className="rec-head">
        <button className="link-btn" onClick={onBack} aria-label="홈으로">
          <span aria-hidden>‹</span> 홈
        </button>
        <div className="rec-title">기록</div>
        <span />
      </header>

      <section className="stats" aria-label="통계">
        <Stat label="오늘" value={stats.todayReps} unit="회" />
        <Stat label={`${cursor.m + 1}월 달성`} value={stats.monthGoalDays} unit="일" />
        <Stat label="누적" value={stats.totalReps} unit="회" />
        <Stat label="연속 달성" value={stats.currentStreak} unit="일" />
        <Stat label="최장 연속" value={stats.longestStreak} unit="일" />
      </section>

      <section className="cal">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="이전 달">
            ‹
          </button>
          <div className="cal-month">
            {cursor.y}년 {cursor.m + 1}월
          </div>
          <button className="icon-btn" onClick={() => move(1)} aria-label="다음 달">
            ›
          </button>
        </div>
        <div className="cal-grid cal-week">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-wd">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div className="cal-grid" key={i}>
            {week.map((d, j) => {
              if (!d) return <div key={j} className="cal-cell empty" />;
              const r = map.get(d);
              const st = dayStatus(r);
              return (
                <button
                  key={d}
                  className={`cal-cell st-${st} ${d === selected ? 'is-selected' : ''} ${d === today ? 'is-today' : ''}`}
                  onClick={() => setSelected(d)}
                  aria-label={`${formatKorean(d)} ${r?.totalReps ?? 0}회`}
                >
                  <span className="cal-day">{parseKey(d).getDate()}</span>
                  {st === 'done' && <StickerMark size="sm" />}
                  {st === 'progress' && <span className="cal-reps">{r!.totalReps}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="cal-legend">
          <span><i className="lg lg-none" />미실시</span>
          <span><i className="lg lg-progress" />진행 (1~99)</span>
          <span><i className="lg lg-done" />완료 (100+)</span>
        </div>
      </section>

      <section className="day-detail">
        <div className="day-head">
          <div className="day-title">{formatKorean(selected)}</div>
          <div className={`day-total st-${dayStatus(sel)}`}>
            {sel?.totalReps ?? 0}
            <small> / {DAILY_GOAL}</small>
          </div>
        </div>
        {sessions === null ? (
          <p className="muted">불러오는 중…</p>
        ) : sessions.length === 0 ? (
          <p className="muted">운동 기록이 없습니다.</p>
        ) : (
          <ul className="sessions">
            {sessions.map((s) => (
              <li key={s.id}>
                <span className="s-time">
                  {formatTime(s.startedAt)}
                  {s.endedAt ? `–${formatTime(s.endedAt)}` : ''}
                </span>
                <span className="s-reps">{s.finalReps}회</span>
                <span className="s-meta">
                  {s.mode === 'manual' ? '수동' : `자동 ${s.autoReps}`}
                  {s.mode === 'auto' && s.manualAdjustment !== 0 ? ` · 보정 ${s.manualAdjustment > 0 ? '+' : ''}${s.manualAdjustment}` : ''}
                  {s.groupId !== s.id ? ' · 자정 이어서' : ''} · {STATUS_TEXT[s.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="backup">
        <div className="backup-title">백업</div>
        <p className="muted">기록은 이 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하면 사라지므로 주기적으로 내보내 두세요.</p>
        <div className="backup-row">
          <button className="btn-secondary" onClick={() => void exportJson()}>
            JSON 내보내기
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            JSON 가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importJson(f);
            }}
          />
        </div>
        {notice && <Banner tone={notice.tone === 'error' ? 'error' : 'info'}>{notice.text}</Banner>}
        {error && <Banner tone="error">기록을 불러오지 못했습니다: {error}</Banner>}
      </section>
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="stat">
      <div className="stat-value">
        {value.toLocaleString('ko-KR')}
        <small>{unit}</small>
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
