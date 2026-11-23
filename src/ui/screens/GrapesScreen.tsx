import { Check, ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeStats } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL, type WorkoutSession } from '../../core/storage/types';
import { dateKey, formatKorean, formatTime } from '../../core/util/date';
import { storage } from '../../services';
import { PageHeader } from '../components/Chrome';
import { DayBerry } from '../components/graphics';
import { Button, Card, Notice, ProgressBar, SectionHeader } from '../components/ui';
import { idleImage } from '../../character';
import { useGrowth } from '../hooks/useGrowth';
import { useDailyRecords, useToday } from '../hooks/useRecords';

const STATUS_TEXT: Record<WorkoutSession['status'], string> = {
  active: '진행 중',
  paused: '일시정지',
  completed: '완료',
  interrupted: '중단됨',
};

/**
 * 포도송이 모양 배치. 위에서부터 줄마다 놓을 알 수이며, 날짜 수(28~31)만큼 앞에서부터 채운다.
 * 합계 31 — 짧은 달은 아래쪽 끝이 줄어든다.
 */
const BUNCH_ROWS = [5, 6, 6, 5, 4, 3, 2];

function bunchRows(days: number): number[][] {
  const rows: number[][] = [];
  let d = 1;
  for (const n of BUNCH_ROWS) {
    const row: number[] = [];
    for (let i = 0; i < n && d <= days; i++) row.push(d++);
    if (row.length) rows.push(row);
  }
  return rows;
}

export function GrapesScreen() {
  const today = useToday();
  const { records, reload, error, loaded } = useDailyRecords();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [selected, setSelected] = useState(today);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const growth = useGrowth();

  const map = useMemo(() => new Map(records.map((r) => [r.date, r])), [records]);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const stats = useMemo(() => computeStats(records, today, monthPrefix), [records, today, monthPrefix]);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const rows = bunchRows(daysInMonth);
  const keyOf = (day: number) => dateKey(new Date(cursor.y, cursor.m, day));

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
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    // 이동한 달에 오늘이 있으면 오늘, 아니면 1일을 선택
    const k = dateKey(d);
    setSelected(today.startsWith(k.slice(0, 7)) ? today : k);
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
      const res = await storage.importData(JSON.parse(await file.text()));
      reload();
      setNotice({ tone: 'info', text: `가져오기 완료 · 세션 ${res.sessions}건, ${res.dates}일 반영 (중복 제외)` });
    } catch (e) {
      const msg = e instanceof SyntaxError ? 'JSON 형식이 아닙니다.' : e instanceof Error ? e.message : String(e);
      setNotice({ tone: 'error', text: `가져오기 실패: ${msg}` });
    }
  };

  const sel = map.get(selected);
  const selReps = sel?.totalReps ?? 0;
  const isFuture = selected > today;

  return (
    <main className="screen">
      <PageHeader title="포도알" />

      <Card tone="pale" className="bunch-card">
        <div className="bunch-head">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="이전 달">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
          <div className="bunch-title">
            <h2 className="section-title">
              {cursor.y}년 {cursor.m + 1}월
            </h2>
            <div className="bunch-count" aria-label={`목표 달성 ${stats.monthGoalDays}일, 총 ${daysInMonth}일`}>
              <b>{stats.monthGoalDays}</b> / {daysInMonth}
            </div>
          </div>
          <button className="icon-btn" onClick={() => move(1)} aria-label="다음 달">
            <ChevronRight size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="bunch" role="group" aria-label={`${cursor.m + 1}월 포도알`}>
          <svg className="bunch-stem" viewBox="0 0 80 40" aria-hidden="true">
            <path d="M40 40 C40 28 42 18 46 8" stroke="#6b4a2f" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M44 16 C52 2 70 2 76 10 C68 20 52 22 44 16Z" fill="#7cc45a" stroke="#4d9a35" strokeWidth="1.5" />
          </svg>
          {rows.map((row, i) => (
            <div className="bunch-row" key={i}>
              {row.map((day) => {
                const k = keyOf(day);
                const reps = map.get(k)?.totalReps ?? 0;
                return (
                  <button
                    key={day}
                    className="bunch-berry"
                    onClick={() => setSelected(k)}
                    aria-pressed={k === selected}
                    aria-label={`${formatKorean(k)} ${reps}회${reps >= DAILY_GOAL ? ', 목표 달성' : ''}`}
                  >
                    <DayBerry day={day} ratio={reps / DAILY_GOAL} today={k === today} selected={k === selected} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="bunch-legend">
          <span>
            <DayBerry day={0} ratio={1} /> 100회 이상
          </span>
          <span>
            <DayBerry day={0} ratio={0.5} /> 진행 중
          </span>
          <span>
            <DayBerry day={0} ratio={0} /> 미실시
          </span>
        </div>
      </Card>

      <Card className="day-card" aria-live="polite">
        <div className="day-head">
          <div className="card-title">{formatKorean(selected)}</div>
          <div className={`day-total ${selReps >= DAILY_GOAL ? 'is-done' : ''}`}>
            {selReps}
            <small> / {DAILY_GOAL}</small>
          </div>
        </div>
        <div className="day-status">
          {selReps >= DAILY_GOAL ? (
            <span className="badge badge-done">
              <Check size={14} strokeWidth={3} /> 목표 달성
            </span>
          ) : isFuture ? (
            <span className="badge">아직 오지 않은 날</span>
          ) : selReps > 0 ? (
            <span className="badge">목표까지 {DAILY_GOAL - selReps}회</span>
          ) : (
            <span className="badge">운동 기록 없음</span>
          )}
        </div>
        {sessions === null || !loaded ? (
          <p className="caption">불러오는 중</p>
        ) : sessions.length > 0 ? (
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
        ) : null}
      </Card>

      <Card className="growth-card" aria-label="캐릭터 성장">
        <img className="growth-avatar" src={idleImage(growth.character)} alt={`${growth.stage}단계 캐릭터`} draggable={false} />
        <div className="growth-body">
          <div className="growth-title">
            캐릭터 <b>{growth.stage}단계</b>
            <span className="caption"> · 모은 포도알 {growth.grapes.toLocaleString('ko-KR')}개</span>
          </div>
          {growth.next ? (
            <>
              <ProgressBar value={growth.next.progress * 100} max={100} />
              <div className="caption">
                {growth.next.stage}단계까지 포도알 {growth.next.remaining}개 남음
              </div>
            </>
          ) : (
            <div className="caption">마지막 단계까지 성장했어요</div>
          )}
        </div>
      </Card>

      <section>
        <SectionHeader title="누적 기록" />
        <Card tone="pale" className="stats">
          <Stat label={`${cursor.m + 1}월 달성일`} value={stats.monthGoalDays} unit="일" />
          <Stat label="누적 스쿼트" value={stats.totalReps} unit="회" />
          <Stat label="연속 달성" value={stats.currentStreak} unit="일" />
          <Stat label="최장 연속" value={stats.longestStreak} unit="일" />
        </Card>
      </section>

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
