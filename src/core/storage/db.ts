const DB_NAME = 'squat-tracker';
const DB_VERSION = 1;

export const STORES = {
  sessions: 'sessions',
  daily: 'daily',
} as const;

const connections = new Map<string, Promise<IDBDatabase>>();

export function openDb(name = DB_NAME): Promise<IDBDatabase> {
  const cached = connections.get(name);
  if (cached) return cached;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 를 사용할 수 없는 환경입니다.'));
      return;
    }
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const s = db.createObjectStore(STORES.sessions, { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains(STORES.daily)) {
        db.createObjectStore(STORES.daily, { keyPath: 'date' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        connections.delete(name);
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('DB 열기 실패'));
    req.onblocked = () => reject(new Error('다른 탭에서 DB 를 사용 중입니다.'));
  }).catch((e) => {
    connections.delete(name);
    throw e;
  });
  connections.set(name, p);
  return p;
}

/** 테스트용: 열린 연결 초기화 */
export async function closeDb(): Promise<void> {
  const all = [...connections.values()];
  connections.clear();
  for (const p of all) {
    try {
      (await p).close();
    } catch {
      /* noop */
    }
  }
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('트랜잭션 실패'));
    tx.onabort = () => reject(tx.error ?? new Error('트랜잭션 중단'));
  });
}
