import { useEffect, useState } from 'react';
import { debugEnabled, storage, workout } from './services';
import { hashFor, routeFromHash, SwitchFab, type Route } from './ui/components/Chrome';
import { DebugPanel } from './ui/components/DebugPanel';
import { useWorkout } from './ui/hooks/useWorkout';
import { GrapesScreen } from './ui/screens/GrapesScreen';
import { SharedScreen } from './ui/screens/SharedScreen';
import { WorkoutScreen } from './ui/screens/WorkoutScreen';

/** 공유 링크 (#/s/:id) — 받은 사람이 보는 읽기 전용 화면 */
function sharedIdFromHash(hash: string): string | null {
  const m = /^#\/s\/([A-Za-z0-9]{10,32})/.exec(hash);
  return m ? m[1] : null;
}

export default function App() {
  const [sharedId, setSharedId] = useState(() => sharedIdFromHash(location.hash));
  useEffect(() => {
    const on = () => setSharedId(sharedIdFromHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (sharedId) return <div className="app"><SharedScreen id={sharedId} /></div>;
  return <OwnerApp />;
}

function OwnerApp() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(location.hash));
  const w = useWorkout();
  const active = w.phase !== 'idle';

  useEffect(() => {
    // 이전 경로(#/home, #/records 등)로 들어오면 새 경로로 정리
    const canonical = () => {
      const r = routeFromHash(location.hash);
      const want = hashFor(r);
      if (location.hash !== want && !(want === '#/' && location.hash === '')) {
        history.replaceState(null, '', `${location.pathname}${location.search}${want}`);
      }
      setRoute(r);
    };
    canonical();
    window.addEventListener('hashchange', canonical);
    // 이전 실행에서 정상 종료되지 않은 세션 정리 (횟수는 이미 저장되어 있음)
    void storage.closeDanglingSessions().catch(() => {});
    return () => window.removeEventListener('hashchange', canonical);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  // 운동 중에는 항상 운동 화면 (전환 버튼 숨김 — 실수로 세션을 벗어나지 않도록)
  const current: Route = active ? 'workout' : route;

  const go = (r: Route) => {
    if (location.hash !== hashFor(r)) location.hash = hashFor(r);
    setRoute(r);
  };

  const start = () => {
    // 사용자 클릭 이벤트 안에서 바로 호출해야 iOS 센서 권한 요청이 동작한다.
    void workout.start();
    go('workout');
  };

  return (
    <div className={`app ${active ? 'is-working' : ''}`}>
      {current === 'workout' && <WorkoutScreen onStart={start} onExit={() => go('workout')} />}
      {current === 'grapes' && <GrapesScreen />}
      {!active && <SwitchFab route={current} onNavigate={go} />}
      {debugEnabled && <DebugPanel />}
    </div>
  );
}
