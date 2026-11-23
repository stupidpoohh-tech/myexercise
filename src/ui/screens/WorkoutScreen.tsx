import { useEffect, useState } from 'react';
import type { RejectReason } from '../../core/types';
import { DAILY_GOAL } from '../../core/storage/types';
import { workout } from '../../services';
import { CharacterStage } from '../components/CharacterStage';
import { Banner, GoalBar } from '../components/common';
import { SENSOR_LABEL, SensorHelp } from '../components/SensorHelp';
import { useWorkout } from '../hooks/useWorkout';

const REJECT_TEXT: Record<RejectReason, string> = {
  'too-fast': '너무 빨라요',
  'too-slow': '너무 느려요',
  'too-shallow': '조금 더 깊게',
  asymmetric: '끝까지 일어나 주세요',
  shake: '흔들림 감지',
  rotation: '휴대폰 방향을 유지해 주세요',
  'bottom-timeout': '동작 취소됨',
  'descent-timeout': '동작 취소됨',
  'ascent-timeout': '동작 취소됨',
  'sensor-gap': '센서 신호 끊김',
  'too-erratic': '불규칙한 움직임',
};

export function WorkoutScreen({ onExit }: { onExit: () => void }) {
  const w = useWorkout();
  const [, force] = useState(0);

  // 자정 경계·수신 속도 표시 갱신
  useEffect(() => {
    const id = setInterval(() => {
      workout.tick();
      workout.refreshSensorInfo();
      force((x) => x + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const paused = w.phase === 'paused';
  const ended = w.phase === 'ended';
  const sensorUsable = w.mode === 'auto' && (w.sensorStatus === 'active' || w.sensorStatus === 'waiting');
  const feedback =
    w.lastRejected && w.lastRejected.significant && Date.now() - w.lastRejected.at < 1600 && !paused
      ? REJECT_TEXT[w.lastRejected.reason]
      : null;
  const repFlash = Date.now() - w.lastRepAt < 400;

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
      <section className="wo-top" aria-live="polite">
        <div className="wo-label">오늘</div>
        <div className="count-line">
          <span key={w.todayReps} className={`count-huge ${w.todayReps >= DAILY_GOAL ? 'is-done' : ''} ${repFlash ? 'pop' : ''}`}>
            {w.todayReps}
          </span>
          <span className="count-goal">/ {DAILY_GOAL}</span>
        </div>
        <GoalBar value={w.todayReps} />
        <div className="wo-sub">이번 운동 {w.sessionReps}회</div>
      </section>

      <section className="wo-stage">
        <CharacterStage />
        <div className="wo-overlay">
          {w.phase === 'starting' && <div className="chip">준비 중…</div>}
          {w.phase === 'calibrating' && w.calibration && (
            <div className="calib">
              <div className="calib-title">
                움직임 보정 {w.calibration.done}/{w.calibration.target}
              </div>
              <p>휴대폰을 양손으로 가슴 앞에 들고 평소처럼 스쿼트해 주세요.</p>
              <button className="btn-ghost btn-small" onClick={() => workout.skipCalibration()}>
                건너뛰기
              </button>
            </div>
          )}
          {paused && <div className="chip chip-strong">일시정지</div>}
          {feedback && <div className="chip chip-warn">{feedback}</div>}
        </div>
      </section>

      <section className="wo-banners">
        {w.mode === 'auto' && <SensorHelp status={w.sensorStatus} onRetry={() => void workout.retrySensor()} />}
        {w.save.status === 'error' && (
          <Banner tone="error" action={<button className="btn-small" onClick={() => void workout.retrySave()}>다시 저장</button>}>
            <strong>기록 저장에 실패했습니다.</strong>
            <p>{w.save.error} — 횟수는 화면에 유지되고 있습니다.</p>
          </Banner>
        )}
      </section>

      <section className="wo-controls">
        <div className={`sensor-pill ${sensorUsable && w.sensorStatus === 'active' ? 'ok' : w.mode === 'manual' ? 'manual' : 'bad'}`}>
          <span className="dot" />
          {w.mode === 'manual' ? '수동 모드' : SENSOR_LABEL[w.sensorStatus]}
          {w.mode === 'auto' && w.sensorStatus === 'active' && w.sampleRate > 0 && <span className="muted"> · {w.sampleRate}Hz</span>}
          {w.wakeLock === 'active' && <span className="muted"> · 화면 켜짐 유지</span>}
        </div>
        <div className="ctrl-row">
          <button className="btn-round" aria-label="1회 빼기" onClick={() => workout.adjust(-1)} disabled={ended}>
            −1
          </button>
          {paused ? (
            <button className="btn-primary btn-wide" onClick={() => workout.resume()}>
              재개
            </button>
          ) : (
            <button className="btn-secondary btn-wide" onClick={() => workout.pause()} disabled={ended || w.phase === 'starting'}>
              일시정지
            </button>
          )}
          <button className="btn-round btn-round-plus" aria-label="1회 더하기" onClick={() => workout.adjust(1)} disabled={ended}>
            +1
          </button>
        </div>
        <button className="btn-end" onClick={() => void end()} disabled={ended}>
          운동 종료
        </button>
      </section>

      {ended && (
        <div className="sheet-backdrop">
          <div className="sheet" role="dialog" aria-label="운동 결과">
            <div className="sheet-title">운동 완료</div>
            <div className="sheet-big">{w.sessionReps}회</div>
            <div className="sheet-sub">
              오늘 {w.todayReps} / {DAILY_GOAL}
              {w.todayReps >= DAILY_GOAL ? ' · 목표 달성' : ''}
            </div>
            {w.save.dirty ? (
              <>
                <p className="error-text">
                  {w.save.status === 'error' ? `저장 실패: ${w.save.error}` : '저장 중…'}
                </p>
                <button className="btn-primary" onClick={() => void workout.retrySave()} disabled={w.save.status === 'saving'}>
                  다시 저장
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={close}>
                확인
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
