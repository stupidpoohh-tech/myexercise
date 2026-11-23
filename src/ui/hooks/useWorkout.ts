import { useSyncExternalStore } from 'react';
import type { WorkoutSnapshot } from '../../core/workout/WorkoutSessionManager';
import { workout } from '../../services';

export function useWorkout(): WorkoutSnapshot {
  return useSyncExternalStore(
    (cb) => workout.on('change', cb),
    () => workout.snapshot,
  );
}
