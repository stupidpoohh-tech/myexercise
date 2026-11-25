import { useSyncExternalStore } from 'react';
import type { ShareState } from '../../core/share/ShareService';
import { share } from '../../services';

export function useShare(): ShareState {
  return useSyncExternalStore(
    (cb) => share.on('change', cb),
    () => share.state,
  );
}
