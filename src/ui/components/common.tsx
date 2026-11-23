import type { ReactNode } from 'react';
import { DAILY_GOAL } from '../../core/storage/types';

export function GoalBar({ value, goal = DAILY_GOAL }: { value: number; goal?: number }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div className={`goal-bar ${value >= goal ? 'is-done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={value}>
      <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Banner({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="banner-body">{children}</div>
      {action && <div className="banner-action">{action}</div>}
    </div>
  );
}

/** 완료 날짜 임시 스티커 표시 — 실제 스티커 그래픽은 추후 결정 */
export function StickerMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={`sticker sticker-${size}`} aria-label="목표 달성">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
