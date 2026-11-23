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
