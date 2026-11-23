import { useEffect, useState } from 'react';
import { debugEnabled, storage, workout } from './services';
import { DebugPanel } from './ui/components/DebugPanel';
import { useWorkout } from './ui/hooks/useWorkout';
import { HomeScreen } from './ui/screens/HomeScreen';
import { RecordsScreen } from './ui/screens/RecordsScreen';
import { WorkoutScreen } from './ui/screens/WorkoutScreen';

type Route = 'home' | 'workout' | 'records';

function readRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return h === 'records' ? 'records' : h === 'workout' ? 'workout' : 'home';
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

  // 운동 중이면 항상 운동 화면
  const current: Route = active ? 'workout' : route === 'workout' ? 'home' : route;

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
    <div className="app">
      {current === 'home' && <HomeScreen onStart={start} onRecords={() => go('records')} />}
      {current === 'workout' && <WorkoutScreen onExit={() => go('home')} />}
      {current === 'records' && <RecordsScreen onBack={() => go('home')} />}
      {debugEnabled && <DebugPanel />}
    </div>
  );
}
