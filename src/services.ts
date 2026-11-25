import { ShareService } from './core/share/ShareService';
import { AnimationController } from './core/animation/AnimationController';
import { WorkoutStorage } from './core/storage/WorkoutStorage';
import { WorkoutSessionManager } from './core/workout/WorkoutSessionManager';

/** 앱 전역 단일 인스턴스 */
export const storage = new WorkoutStorage();
export const workout = new WorkoutSessionManager({ storage });
export const animation = new AnimationController();
animation.connect(workout.feed);

export const debugEnabled =
  typeof location !== 'undefined' && (new URLSearchParams(location.search).has('debug') || location.hash.includes('debug'));


/** 포도알 공유 — 기록이 저장될 때마다 요약을 서버에 올린다 (공유를 켠 경우에만) */
export const share = new ShareService();

function syncShare(immediate = false): void {
  if (!share.state.enabled) return;
  void storage
    .getAllDaily()
    .then((records) => (immediate ? share.syncNow(records) : share.schedule(() => records)))
    .catch(() => {});
}

workout.on('saved', () => syncShare());
workout.on('change', (s) => {
  if (s.phase === 'ended' && !s.save.dirty) syncShare(true);
});
if (typeof window !== 'undefined') {
  // 앱을 열 때 · 다시 화면으로 돌아올 때 최신 상태로 맞춘다
  syncShare(true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncShare(true));
}
export const resyncShare = () => syncShare(true);
