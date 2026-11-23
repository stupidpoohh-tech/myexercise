import { useEffect, useRef, useState } from 'react';
import { CONFIG_LIMITS, type DetectorConfig } from '../../core/detection/config';
import { DeviceMotionSource } from '../../core/sensor/SensorManager';
import { scenarios } from '../../core/sim/MotionSimulator';
import { SimulatedSource } from '../../core/sim/SimulatedSource';
import type { MotionFrame, RepMetrics, SquatState } from '../../core/types';
import { workout } from '../../services';
import { useWorkout } from '../hooks/useWorkout';

const STATE_COLOR: Record<SquatState, string> = {
  IDLE: '#5b6b7d',
  DESCENDING: '#00b7ff',
  BOTTOM: '#6f36ff',
  ASCENDING: '#2870ff',
  COMPLETED: '#00DC84',
};

const sim = new SimulatedSource();
const device = new DeviceMotionSource();

/**
 * 개발·실기기 튜닝용 패널 (?debug=1).
 * 가상 움직임 주입, 실시간 신호 그래프, 임계값 조정을 제공한다.
 */
export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [useSim, setUseSim] = useState(workout.sensor.sourceKind === 'simulated');
  const [frame, setFrame] = useState<MotionFrame | null>(null);
  const [lastRep, setLastRep] = useState<RepMetrics | null>(null);
  const [lastReject, setLastReject] = useState<string>('');
  const [tuning, setTuning] = useState<Partial<DetectorConfig>>(workout.tuningOverrides);
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<MotionFrame[]>([]);
  const w = useWorkout();

  useEffect(() => {
    let raf = 0;
    const offFrame = workout.on('frame', (f) => {
      history.current.push(f);
      if (history.current.length > 360) history.current.shift();
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setFrame(f);
          draw(canvas.current, history.current);
        });
    });
    const offRep = workout.detector.on('rep', (m) => setLastRep(m));
    const offRej = workout.detector.on('rejected', (r) =>
      setLastReject(`${r.reason} (depth ${(r.metrics.depthDown ?? 0).toFixed(2)}, ${Math.round((r.metrics.endedAt ?? 0) - (r.metrics.startedAt ?? 0))}ms)`),
    );
    return () => {
      offFrame();
      offRep();
      offRej();
      cancelAnimationFrame(raf);
    };
  }, []);

  const toggleSim = () => {
    const next = !useSim;
    workout.sensor.setSource(next ? sim : device);
    setUseSim(next);
  };

  const cfg = workout.detector.config;
  const setKey = (k: keyof DetectorConfig, v: number) => {
    const t = { ...tuning, [k]: v };
    setTuning(t);
    workout.setTuning(t);
  };

  return (
    <>
      <button className="dbg-fab" onClick={() => setOpen((o) => !o)}>
        DEV
      </button>
      {open && (
        <div className="dbg">
          <div className="dbg-row">
            <label>
              <input type="checkbox" checked={useSim} onChange={toggleSim} /> 가상 센서 사용
            </label>
            <span>
              {w.phase} · {w.sensorStatus}
            </span>
          </div>
          {useSim && (
            <div className="dbg-row wrap">
              {(Object.keys(scenarios) as (keyof typeof scenarios)[]).map((k) => (
                <button key={k} className="btn-small" onClick={() => sim.play(scenarios[k]())}>
                  {k}
                </button>
              ))}
              <button className="btn-small" onClick={() => sim.clear()}>
                clear
              </button>
            </div>
          )}
          <canvas ref={canvas} width={340} height={110} className="dbg-canvas" />
          <div className="dbg-mono">
            state {frame?.state ?? '-'} · progress {frame?.progress == null ? 'null' : frame.progress.toFixed(2)}
            <br />v {frame?.velocity.toFixed(3) ?? '-'} m/s · a {frame?.accel.toFixed(2) ?? '-'} · shake {frame?.shake.toFixed(2) ?? '-'}
            <br />
            rep: {lastRep ? `${Math.round(lastRep.endedAt - lastRep.startedAt)}ms depth ${lastRep.depthDown.toFixed(2)}/${lastRep.depthUp.toFixed(2)} vmax ${lastRep.peakVelDown.toFixed(2)}/${lastRep.peakVelUp.toFixed(2)} zc ${lastRep.zeroCrossings}` : '-'}
            <br />
            rejected: {lastReject || '-'}
            <br />
            calibration: {workout.calibrationProfile ? JSON.stringify(roundObj(workout.calibrationProfile.overrides)) : '없음'}
          </div>
          <div className="dbg-row">
            <button className="btn-small" onClick={() => workout.clearCalibration()}>
              보정값 삭제
            </button>
            <button
              className="btn-small"
              onClick={() => {
                setTuning({});
                workout.setTuning({});
              }}
            >
              임계값 초기화
            </button>
          </div>
          <div className="dbg-sliders">
            {(Object.keys(CONFIG_LIMITS) as (keyof DetectorConfig)[]).map((k) => {
              const [min, max, step] = CONFIG_LIMITS[k]!;
              const v = (tuning[k] as number | undefined) ?? (cfg[k] as number);
              return (
                <label key={k} className={tuning[k] !== undefined ? 'is-set' : ''}>
                  <span>
                    {k} <b>{v}</b>
                  </span>
                  <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setKey(k, Number(e.target.value))} />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function roundObj(o: object): Record<string, number | null> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]));
}

function draw(c: HTMLCanvasElement | null, frames: MotionFrame[]) {
  const ctx = c?.getContext('2d');
  if (!c || !ctx || frames.length < 2) return;
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  const mid = H / 2;
  const scale = H / 2 / 1.0; // ±1 m/s
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(W, mid);
  ctx.stroke();
  const vs = workout.detector.config.velStart;
  ctx.setLineDash([3, 3]);
  [vs, -vs].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, mid - y * scale);
    ctx.lineTo(W, mid - y * scale);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  const dx = W / 360;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    ctx.strokeStyle = STATE_COLOR[b.state];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((i - 1) * dx, mid - a.velocity * scale);
    ctx.lineTo(i * dx, mid - b.velocity * scale);
    ctx.stroke();
    if (b.progress !== null) {
      ctx.fillStyle = 'rgba(0,220,132,0.5)';
      ctx.fillRect(i * dx, H - b.progress * 20, dx, b.progress * 20);
    }
  }
}
