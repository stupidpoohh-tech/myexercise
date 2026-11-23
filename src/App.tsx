import { useEffect, useState } from 'react';
import { debugEnabled, storage, workout } from './services';
import { BottomNav, type Route } from './ui/components/Chrome';
import { DebugPanel } from './ui/components/DebugPanel';
import { useWorkout } from './ui/hooks/useWorkout';
import { CharacterScreen } from './ui/screens/CharacterScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { RecordsScreen } from './ui/screens/RecordsScreen';
import { WorkoutScreen } from './ui/screens/WorkoutScreen';

const ROUTES: Route[] = ['home', 'workout', 'records', 'character'];

function readRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : 'home';
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const w = useWorkout();
  const active = w.phase !== 'idle';

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    // 이전 실행에서 정상 종료되지 않은 세션 정리 (횟수는 이미 저장되어 있음)
    void storage.closeDanglingSessions().catch(() => {});
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  // 운동 중에는 항상 운동 화면 (하단 탭 숨김 — 실수로 이탈하지 않도록)
  const current: Route = active ? 'workout' : route;

  const go = (r: Route) => {
    location.hash = r === 'home' ? '/' : `/${r}`;
    setRoute(r);
  };

  const start = () => {
    // 사용자 클릭 이벤트 안에서 바로 호출해야 iOS 센서 권한 요청이 동작한다.
    void workout.start();
    go('workout');
  };

  return (
    <div className={`app ${active ? 'is-working' : ''}`}>
      {current === 'home' && <HomeScreen onStart={start} onNavigate={go} />}
      {current === 'workout' && <WorkoutScreen onStart={start} onExit={() => go('home')} />}
      {current === 'records' && <RecordsScreen />}
      {current === 'character' && <CharacterScreen />}
      {!active && <BottomNav route={current} onNavigate={go} />}
      {debugEnabled && <DebugPanel />}
    </div>
  );
}
