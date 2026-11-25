import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { idleImage, type CharacterId } from '../../character';
import { GROWTH_STAGES } from '../../character/growth';
import type { SharePayload } from '../../core/share/payload';
import { computeStats } from '../../core/storage/DailyRecordService';
import { DAILY_GOAL, type DailyRecord } from '../../core/storage/types';
import { formatKorean } from '../../core/util/date';
import { BRAND } from '../components/Chrome';
import { GrapeBunch } from '../components/GrapeBunch';
import { ProgressBar } from '../components/ui';

/** 새로고침 주기 — 화면을 보고 있는 동안만 */
const POLL_MS = 20_000;

type Load = { kind: 'loading' } | { kind: 'ok'; data: SharePayload; fetchedAt: number } | { kind: 'gone' } | { kind: 'error'; message: string };

/**
 * 공유 링크로 들어온 사람이 보는 읽기 전용 화면 (#/s/:id).
 * 소유자 기기가 올린 요약만 읽으며, 이 기기에는 아무것도 저장하지 않는다.
 */
export function SharedScreen({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [, tick] = useState(0);

  const fetchNow = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.status === 404 || res.status === 400) return setLoad({ kind: 'gone' });
      if (!res.ok) return setLoad((l) => (l.kind === 'ok' ? l : { kind: 'error', message: res.status === 503 ? '공유 서버가 준비되지 않았어요.' : '잠시 후 다시 시도해 주세요.' }));
      const data = (await res.json()) as SharePayload;
      setLoad({ kind: 'ok', data, fetchedAt: Date.now() });
    } catch {
      setLoad((l) => (l.kind === 'ok' ? l : { kind: 'error', message: '네트워크에 연결할 수 없어요.' }));
    }
  }, [id]);

  useEffect(() => {
    void fetchNow();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchNow();
      tick((x) => x + 1);
    }, POLL_MS);
    const onVis = () => document.visibilityState === 'visible' && void fetchNow();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchNow]);

  const data = load.kind === 'ok' ? load.data : null;
  const records: DailyRecord[] = useMemo(
    () => (data ? Object.entries(data.daily).map(([date, totalReps]) => ({ date, totalReps, goalCompleted: totalReps >= DAILY_GOAL, updatedAt: '' })) : []),
    [data],
  );

  // 처음 받은 데이터 기준으로 소유자의 '오늘'이 있는 달을 보여 준다
  useEffect(() => {
    if (data && !cursor) {
      const [y, m] = data.today.split('-').map(Number);
      setCursor({ y, m: m - 1 });
      setSelected(data.today);
    }
  }, [data, cursor]);

  if (load.kind === 'loading') return <SharedShell><p className="caption shared-center">불러오는 중…</p></SharedShell>;
  if (load.kind === 'gone')
    return (
      <SharedShell>
        <div className="shared-center">
          <p className="shared-empty-title">볼 수 없는 링크예요</p>
          <p className="caption">공유가 중지되었거나 잘못된 링크입니다.</p>
        </div>
      </SharedShell>
    );
  if (load.kind === 'error' || !data || !cursor)
    return (
      <SharedShell>
        <div className="shared-center">
          <p className="shared-empty-title">불러오지 못했어요</p>
          <p className="caption">{load.kind === 'error' ? load.message : ''}</p>
        </div>
      </SharedShell>
    );

  const map = new Map(Object.entries(data.daily));
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const stats = computeStats(records, data.today, monthPrefix);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayReps = data.daily[data.today] ?? 0;
  const stage = GROWTH_STAGES.find((s) => s.stage === data.stage) ?? GROWTH_STAGES[0];
  const sel = selected ?? data.today;
  const selReps = map.get(sel) ?? 0;

  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <SharedShell updatedAt={data.updatedAt}>
      <section className="shared-hero">
        <img className="shared-avatar" src={idleImage(stage.character as CharacterId)} alt={`${data.stage}단계 캐릭터`} draggable={false} />
        <div className="shared-hero-body">
          <h1 className="shared-title">{data.name ? `${data.name}의 포도알` : '포도알'}</h1>
          <div className="shared-today">
            <span>{formatKorean(data.today)}</span>
            <b>
              {todayReps}
              <small>/{DAILY_GOAL}</small>
            </b>
          </div>
          <ProgressBar value={todayReps} max={DAILY_GOAL} />
          <div className="caption">
            LV.{data.stage} · 모은 포도알 {stats.totalGoalDays}개
          </div>
        </div>
      </section>

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
        <GrapeBunch year={cursor.y} month0={cursor.m} repsOf={(k) => map.get(k) ?? 0} today={data.today} selected={sel} onSelect={setSelected} />
      </section>

      <section className="kstats" aria-label="운동 통계">
        <div className="kstats-line">
          <span>
            {formatKorean(sel).replace(/ \(.\)$/, '')} <b>{selReps}회</b>
          </span>
          <i className="kstats-sep" aria-hidden="true" />
          <span>
            연속 달성 <b>{stats.currentStreak}일</b>
          </span>
          <i className="kstats-sep" aria-hidden="true" />
          <span>
            누적 <b>{stats.totalReps.toLocaleString('ko-KR')}회</b>
          </span>
        </div>
      </section>
    </SharedShell>
  );
}

function SharedShell({ children, updatedAt }: { children: ReactNode; updatedAt?: string }) {
  return (
    <main className="screen shared-screen">
      <header className="app-header">
        <a className="wordmark" href="#/">
          {BRAND}
        </a>
        {updatedAt && <span className="top-date">{ago(updatedAt)}</span>}
      </header>
      {children}
      {updatedAt && <p className="caption shared-foot">보기 전용 · 화면을 열어 두면 자동으로 새로고침돼요</p>}
    </main>
  );
}

function ago(iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return '방금 업데이트';
  if (min < 60) return `${min}분 전 업데이트`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 전 업데이트` : `${Math.floor(h / 24)}일 전 업데이트`;
}
