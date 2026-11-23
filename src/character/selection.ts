import { useSyncExternalStore } from 'react';
import { CHARACTER_IDS, type CharacterId } from './index';

const KEY = 'squat.character.v1';
const listeners = new Set<() => void>();

function read(): CharacterId {
  try {
    const v = localStorage.getItem(KEY);
    return (CHARACTER_IDS as readonly string[]).includes(v ?? '') ? (v as CharacterId) : '1';
  } catch {
    return '1';
  }
}

let current: CharacterId = read();

export function setCharacter(id: CharacterId): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l());
}

export function useCharacter(): CharacterId {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
