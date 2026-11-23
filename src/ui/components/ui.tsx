import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** 공통 UI 컴포넌트 — 스타일은 styles.css 의 디자인 토큰을 따른다 */

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export function Button({
  variant = 'primary',
  icon,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: ReactNode }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Card({ className = '', tone = 'white', children }: { className?: string; tone?: 'white' | 'pale'; children: ReactNode }) {
  return <section className={`card card-${tone} ${className}`}>{children}</section>;
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {right}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'error'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="notice-body">
        <strong>{title}</strong>
        {children}
      </div>
      {action}
    </div>
  );
}
