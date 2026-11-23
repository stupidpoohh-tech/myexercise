import { ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeStats, dayStatus } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL, type WorkoutSession } from '../../core/storage/types';
import { formatKorean, formatTime, monthGrid, parseKey, WEEKDAYS } from '../../core/util/date';
import { storage } from '../../services';
import { PageHeader } from '../components/Chrome';
import { GrapeBerry } from '../components/graphics';
import { Button, Card, Notice, SectionHeader } from '../components/ui';
import { useDailyRecords, useToday } from '../hooks/useRecords';

const STATUS_TEXT: Record<WorkoutSession['status'], string> = {
  active: '진행 중',
  paused: '일시정지',
  completed: '완료',
  interrupted: '중단됨',
};

export function RecordsScreen() {
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

  const move = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

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
      const res = await storage.importData(JSON.parse(await file.text()));
      reload();
      setNotice({ tone: 'info', text: `가져오기 완료 · 세션 ${res.sessions}건, ${res.dates}일 반영 (중복 제외)` });
    } catch (e) {
      const msg = e instanceof SyntaxError ? 'JSON 형식이 아닙니다.' : e instanceof Error ? e.message : String(e);
      setNotice({ tone: 'error', text: `가져오기 실패: ${msg}` });
    }
  };

  const sel = map.get(selected);

  return (
    <main className="screen">
      <PageHeader title="기록" />

      <Card tone="pale" className="stats">
        <Stat label="오늘" value={stats.todayReps} unit="회" />
        <Stat label={`${cursor.m + 1}월 포도알`} value={stats.monthGoalDays} unit="알" />
        <Stat label="누적" value={stats.totalReps} unit="회" />
        <Stat label="연속 달성" value={stats.currentStreak} unit="일" />
        <Stat label="최장 연속" value={stats.longestStreak} unit="일" />
      </Card>

      <section className="calendar">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="이전 달">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
          <h2 className="section-title">
            {cursor.y}년 {cursor.m + 1}월
          </h2>
          <button className="icon-btn" onClick={() => move(1)} aria-label="다음 달">
            <ChevronRight size={22} strokeWidth={2} />
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-wd">
              {w}
            </div>
          ))}
          {weeks.flat().map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const r = map.get(d);
            const st = dayStatus(r);
            return (
              <button
                key={d}
                className={`cal-cell st-${st} ${d === selected ? 'is-selected' : ''} ${d === today ? 'is-today' : ''}`}
                onClick={() => setSelected(d)}
                aria-label={`${formatKorean(d)} ${r?.totalReps ?? 0}회${st === 'done' ? ', 목표 달성' : ''}`}
                aria-pressed={d === selected}
              >
                {st === 'done' ? (
                  <GrapeBerry filled size={34} />
                ) : (
                  <span className="cal-day">{parseKey(d).getDate()}</span>
                )}
                {st === 'progress' && <span className="cal-reps">{r!.totalReps}</span>}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span>
            <GrapeBerry filled size={14} /> 완료 100회 이상
          </span>
          <span>
            <i className="dot" /> 진행 1~99회
          </span>
          <span>
            <i className="dot dot-empty" /> 미실시
          </span>
        </div>
      </section>

      <Card className="day-card">
        <div className="day-head">
          <div className="card-title">{formatKorean(selected)}</div>
          <div className={`day-total ${dayStatus(sel) === 'done' ? 'is-done' : ''}`}>
            {sel?.totalReps ?? 0}
            <small> / {DAILY_GOAL}</small>
          </div>
        </div>
        {sessions === null ? (
          <p className="caption">불러오는 중</p>
        ) : sessions.length === 0 ? (
          <p className="caption">운동 기록이 없습니다.</p>
        ) : (
          <ul className="sessions">
            {sessions.map((s) => (
              <li key={s.id}>
                <div>
                  <div className="s-time">
                    {formatTime(s.startedAt)}
                    {s.endedAt ? ` – ${formatTime(s.endedAt)}` : ''}
                  </div>
                  <div className="caption">
                    {s.mode === 'manual' ? '수동 기록' : `자동 ${s.autoReps}`}
                    {s.mode === 'auto' && s.manualAdjustment !== 0 ? ` · 보정 ${s.manualAdjustment > 0 ? '+' : ''}${s.manualAdjustment}` : ''}
                    {s.groupId !== s.id ? ' · 자정 이후 이어서' : ''} · {STATUS_TEXT[s.status]}
                  </div>
                </div>
                <div className="s-reps">{s.finalReps}회</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section>
        <SectionHeader title="백업" />
        <p className="caption backup-desc">기록은 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 함께 사라지므로 가끔 파일로 내보내 두세요.</p>
        <div className="backup-row">
          <Button variant="secondary" icon={<Download size={18} />} onClick={() => void exportJson()}>
            내보내기
          </Button>
          <Button variant="secondary" icon={<Upload size={18} />} onClick={() => fileRef.current?.click()}>
            가져오기
          </Button>
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
        {notice && <Notice tone={notice.tone === 'error' ? 'error' : 'info'} title={notice.text} />}
        {error && <Notice tone="error" title={`기록을 불러오지 못했습니다: ${error}`} />}
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
