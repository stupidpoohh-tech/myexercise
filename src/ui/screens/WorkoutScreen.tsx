import { Minus, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DAILY_GOAL } from '../../core/storage/types';
import type { RejectReason } from '../../core/types';
import { workout } from '../../services';
import { formatKorean } from '../../core/util/date';
import { CharacterStage } from '../components/CharacterStage';
import { AppHeader } from '../components/Chrome';
import { GrapeBerry, SquatIcon } from '../components/graphics';
import { SENSOR_LABEL, SensorHelp } from '../components/SensorHelp';
import { Button, Card, Notice, ProgressBar } from '../components/ui';
import { useDailyRecords, useToday } from '../hooks/useRecords';
import { useGrowth } from '../hooks/useGrowth';
import { useWorkout } from '../hooks/useWorkout';

const REJECT_TEXT: Record<RejectReason, string> = {
  'too-fast': '조금 천천히 해 주세요',
  'too-slow': '동작이 너무 느려요',
  'too-shallow': '조금 더 앉아 주세요',
  asymmetric: '끝까지 일어나 주세요',
  shake: '흔들림이 감지됐어요',
  rotation: '휴대폰 방향을 유지해 주세요',
  'bottom-timeout': '동작이 취소됐어요',
  'descent-timeout': '동작이 취소됐어요',
  'ascent-timeout': '동작이 취소됐어요',
  'sensor-gap': '센서 신호가 끊겼어요',
  'too-erratic': '움직임이 불규칙해요',
};

/**
 * 운동 탭 (메인 화면). 운동 전에는 오늘의 스쿼트 · 캐릭터 · 시작 버튼만 한 화면에 보여 주고,
 * 운동 중에는 카운트 화면으로 전환한다.
 */
export function WorkoutScreen({ onStart, onExit }: { onStart: () => void; onExit: () => void }) {
  const w = useWorkout();
  return w.phase === 'idle' ? <ReadyView onStart={onStart} /> : <ActiveView onExit={onExit} />;
}

function ReadyView({ onStart }: { onStart: () => void }) {
  const today = useToday();
  const { records, error } = useDailyRecords();
  const reps = records.find((r) => r.date === today)?.totalReps ?? 0;
  return (
    <main className="screen screen-fit">
      <AppHeader />
      <h1 className="date-title">{formatKorean(today)}</h1>

      <Card className="today-card fit-card">
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
              <span className="reps-now">{reps}</span>
              <span className="reps-goal"> / {DAILY_GOAL}</span>
            </div>
            <ProgressBar value={reps} max={DAILY_GOAL} />
          </div>
        </div>

        <div className="stage stage-fit">
          <CharacterStage />
        </div>
        <GrowthTag />

        <Button icon={<Play size={20} fill="currentColor" strokeWidth={0} />} onClick={onStart}>
          {reps >= DAILY_GOAL ? '운동 더 하기' : '운동 시작'}
        </Button>
      </Card>
      {error && <p className="error-text">기록을 불러오지 못했습니다: {error}</p>}
    </main>
  );
}

/** 캐릭터 성장 상태 (성장 규칙은 character/growth.ts) */
function GrowthTag() {
  const g = useGrowth();
  if (!g.loaded) return null;
  return (
    <div className="growth-tag" aria-label={g.next ? `레벨 ${g.stage}, 다음 성장까지 포도알 ${g.next.remaining}개` : `레벨 ${g.stage}, 최종 단계`}>
      <b>LV.{g.stage}</b>
      <span>{g.next ? `다음 성장까지 ${g.next.remaining}알` : '최종 단계'}</span>
    </div>
  );
}

function ActiveView({ onExit }: { onExit: () => void }) {
  const w = useWorkout();
  const [, force] = useState(0);
  const [grapeToast, setGrapeToast] = useState(false);
  const prevToday = useRef(w.todayReps);
  const growth = useGrowth();
  const startStage = useRef<number | null>(null);
  const [grew, setGrew] = useState(false);
  const [growToast, setGrowToast] = useState(false);

  // 이번 운동 중 성장 단계가 올라가면 알림 (기록이 저장되면 단계가 다시 계산된다)
  useEffect(() => {
    if (!growth.loaded) return;
    if (startStage.current === null) {
      startStage.current = growth.stage;
      return;
    }
    if (growth.stage > startStage.current && !grew) {
      setGrew(true);
      setGrowToast(true);
      const t = setTimeout(() => setGrowToast(false), 2600);
      return () => clearTimeout(t);
    }
  }, [growth.loaded, growth.stage, grew]);

  useEffect(() => {
    const id = setInterval(() => {
      workout.tick();
      workout.refreshSensorInfo();
      force((x) => x + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 오늘 100회를 넘는 순간 포도알 획득 알림
  useEffect(() => {
    if (prevToday.current < DAILY_GOAL && w.todayReps >= DAILY_GOAL) {
      setGrapeToast(true);
      const t = setTimeout(() => setGrapeToast(false), 2400);
      prevToday.current = w.todayReps;
      return () => clearTimeout(t);
    }
    prevToday.current = w.todayReps;
  }, [w.todayReps]);

  const paused = w.phase === 'paused';
  const ended = w.phase === 'ended';
  const done = w.todayReps >= DAILY_GOAL;
  const feedback =
    w.lastRejected && w.lastRejected.significant && Date.now() - w.lastRejected.at < 1600 && !paused
      ? REJECT_TEXT[w.lastRejected.reason]
      : null;
  const repPulse = Date.now() - w.lastRepAt < 400;
  const sensorOk = w.mode === 'auto' && w.sensorStatus === 'active';

  const end = async () => {
    if (!window.confirm('운동을 종료할까요?')) return;
    await workout.end();
  };
  const close = () => {
    workout.reset();
    if (!workout.snapshot.save.dirty) onExit();
  };

  return (
    <main className={`screen workout ${paused ? 'is-paused' : ''}`}>
      <header className="wo-header">
        <div className="wo-title">
          <SquatIcon size={22} />
          스쿼트
        </div>
        <div className={`status-pill ${sensorOk ? 'ok' : w.mode === 'manual' ? 'manual' : 'bad'}`}>
          <i className="dot" />
          {w.mode === 'manual' ? '수동 기록' : SENSOR_LABEL[w.sensorStatus]}
        </div>
      </header>

      <Card className="today-card wo-card">
        <div className="wo-count" aria-live="polite">
          <div className="caption">오늘</div>
          <div className="reps">
            <span key={w.todayReps} className={`reps-now ${repPulse ? 'bump' : ''}`}>
              {w.todayReps}
            </span>
            <span className="reps-goal"> / {DAILY_GOAL}</span>
          </div>
          <ProgressBar value={w.todayReps} max={DAILY_GOAL} />
          <div className="caption">
            이번 운동 {w.sessionReps}회{done ? ' · 오늘 목표 달성' : ''}
          </div>
        </div>
        <div className="stage">
          <CharacterStage />
          <div className="stage-msg" aria-live="polite">
            {w.phase === 'starting' && <span className="msg">준비 중</span>}
            {paused && <span className="msg">일시정지</span>}
            {feedback && <span className="msg msg-warn">{feedback}</span>}
            {growToast ? (
              <span className="msg msg-grape">캐릭터가 {growth.stage}단계로 성장했어요</span>
            ) : grapeToast && (
              <span className="msg msg-grape">
                <GrapeBerry filled size={18} pop /> 오늘의 포도알을 모았어요
              </span>
            )}
          </div>
        </div>
      </Card>

      {w.phase === 'calibrating' && w.calibration && (
        <Notice
          title={`움직임 보정 ${w.calibration.done} / ${w.calibration.target}`}
          action={
            <Button variant="secondary" className="btn-sm" onClick={() => workout.skipCalibration()}>
              건너뛰기
            </Button>
          }
        >
          <p>휴대폰을 양손으로 가슴 앞에 들고 평소처럼 스쿼트해 주세요.</p>
        </Notice>
      )}
      {w.mode === 'auto' && <SensorHelp status={w.sensorStatus} onRetry={() => void workout.retrySensor()} />}
      {w.save.status === 'error' && (
        <Notice
          tone="error"
          title="기록 저장에 실패했습니다"
          action={
            <Button variant="secondary" className="btn-sm" onClick={() => void workout.retrySave()}>
              다시 저장
            </Button>
          }
        >
          <p>{w.save.error} · 횟수는 화면에 유지되고 있습니다.</p>
        </Notice>
      )}

      <div className="wo-controls">
        <Button variant="secondary" className="btn-square" aria-label="1회 빼기" onClick={() => workout.adjust(-1)} disabled={ended} icon={<Minus size={22} />}>
          1
        </Button>
        {paused ? (
          <Button onClick={() => workout.resume()} icon={<Play size={18} fill="currentColor" strokeWidth={0} />}>
            재개
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => workout.pause()} disabled={ended || w.phase === 'starting'} icon={<Pause size={18} />}>
            일시정지
          </Button>
        )}
        <Button variant="secondary" className="btn-square" aria-label="1회 더하기" onClick={() => workout.adjust(1)} disabled={ended} icon={<Plus size={22} />}>
          1
        </Button>
      </div>
      <div className="wo-meta">
        {w.mode === 'auto' && w.sensorStatus === 'active' && w.sampleRate > 0 && <span>센서 {w.sampleRate}Hz</span>}
        {w.wakeLock === 'active' && <span>화면 켜짐 유지 중</span>}
      </div>
      <Button variant="text" className="btn-end" onClick={() => void end()} disabled={ended}>
        운동 종료
      </Button>

      {ended && (
        <div className="sheet-backdrop">
          <div className="sheet result" role="dialog" aria-label="운동 결과">
            <div className="caption">운동 완료</div>
            <div className="result-reps">
              {w.sessionReps}
              <small>회</small>
            </div>
            <div className="result-today">
              오늘 {w.todayReps} / {DAILY_GOAL}
            </div>
            {done && (
              <div className="result-grape">
                <GrapeBerry filled size={44} pop />
                <span>오늘의 포도알을 모았어요</span>
              </div>
            )}
            {grew && (
              <div className="result-grow">
                캐릭터가 <b>{growth.stage}단계</b>로 성장했어요
              </div>
            )}
            {w.save.dirty ? (
              <>
                <p className="error-text">{w.save.status === 'error' ? `저장 실패: ${w.save.error}` : '저장 중…'}</p>
                <Button onClick={() => void workout.retrySave()} disabled={w.save.status === 'saving'}>
                  다시 저장
                </Button>
              </>
            ) : (
              <Button onClick={close}>확인</Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
