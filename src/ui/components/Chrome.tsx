import { Dumbbell, Grape } from 'lucide-react';
import type { ReactNode } from 'react';
import { GrapeLogo } from './graphics';

export type Route = 'workout' | 'grapes';

export const ROUTES: Route[] = ['workout', 'grapes'];

export const BRAND = '운동 포도알';

/** 해시 경로 → 화면. 이전 경로(#/home, #/records, #/character)는 남은 화면으로 연결한다 */
export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split(/[?&]/)[0];
  if (h === 'grapes' || h === 'records') return 'grapes';
  return 'workout'; // '', 'home', 'workout', 'character' 및 알 수 없는 경로
}

export function hashFor(r: Route): string {
  return r === 'workout' ? '#/' : `#/${r}`;
}

/** 상단 헤더: 서비스명만 표시 */
export function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand">
        <GrapeLogo />
        <span>{BRAND}</span>
      </div>
    </header>
  );
}

/** 페이지 헤더 (포도알 화면 등) */
export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {right}
    </header>
  );
}

/**
 * 화면 전환 버튼 (우측 하단 원형). 운동 화면에서는 포도알로, 포도알 화면에서는 운동으로 이동한다.
 * 아이콘은 '이동할 화면'을 나타낸다.
 */
export function SwitchFab({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const to: Route = route === 'workout' ? 'grapes' : 'workout';
  const label = to === 'grapes' ? '포도알 기록 보기' : '운동 화면으로';
  return (
    <button className="switch-fab" aria-label={label} title={label} onClick={() => onNavigate(to)}>
      {to === 'grapes' ? <Grape size={26} strokeWidth={2} /> : <Dumbbell size={26} strokeWidth={2} />}
    </button>
  );
}
