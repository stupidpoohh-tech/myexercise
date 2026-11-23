import { CalendarDays, Dumbbell, Grape, Menu, UserRound, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { GrapeLogo } from './graphics';

export type Route = 'workout' | 'grapes' | 'character';

export const ROUTES: Route[] = ['workout', 'grapes', 'character'];

/** 해시 경로 → 탭. 이전 4탭 구조의 경로(#/, #/home, #/records)는 새 탭으로 연결한다 */
export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split(/[?&]/)[0];
  if (h === 'grapes' || h === 'records') return 'grapes';
  if (h === 'character') return 'character';
  return 'workout'; // '', 'home', 'workout' 및 알 수 없는 경로
}

export function hashFor(r: Route): string {
  return r === 'workout' ? '#/' : `#/${r}`;
}

export const BRAND = '운동 포도알';

/** 상단 헤더: 메뉴 · 서비스명 · 캘린더 */
export function AppHeader({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <header className="app-header">
        <button className="icon-btn" aria-label="메뉴" onClick={() => setMenu(true)}>
          <Menu size={24} strokeWidth={2} />
        </button>
        <div className="brand">
          <GrapeLogo />
          <span>{BRAND}</span>
        </div>
        <button className="icon-btn" aria-label="포도알 기록" onClick={() => onNavigate('grapes')}>
          <CalendarDays size={24} strokeWidth={2} />
        </button>
      </header>
      {menu && <MenuSheet onClose={() => setMenu(false)} onNavigate={(r) => (setMenu(false), onNavigate(r))} />}
    </>
  );
}

/** 페이지 헤더 (기록·내 캐릭터 등) */
export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {right}
    </header>
  );
}

function MenuSheet({ onClose, onNavigate }: { onClose: () => void; onNavigate: (r: Route) => void }) {
  const items: [Route, string][] = [
    ['workout', '운동'],
    ['grapes', '포도알 · 기록 백업'],
    ['character', '내 캐릭터'],
  ];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <nav className="sheet menu-sheet" onClick={(e) => e.stopPropagation()} aria-label="메뉴">
        <div className="sheet-head">
          <div className="brand">
            <GrapeLogo />
            <span>{BRAND}</span>
          </div>
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            <X size={22} strokeWidth={2} />
          </button>
        </div>
        {items.map(([r, label]) => (
          <button key={r} className="menu-item" onClick={() => onNavigate(r)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

const TABS: { route: Route; label: string; Icon: typeof Dumbbell }[] = [
  { route: 'workout', label: '운동', Icon: Dumbbell },
  { route: 'grapes', label: '포도알', Icon: Grape },
  { route: 'character', label: '내 캐릭터', Icon: UserRound },
];

export function BottomNav({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {TABS.map(({ route: r, label, Icon }) => (
        <button key={r} className={`tab ${r === route ? 'is-active' : ''}`} aria-current={r === route ? 'page' : undefined} onClick={() => onNavigate(r)}>
          <Icon size={23} strokeWidth={r === route ? 2 : 1.75} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
