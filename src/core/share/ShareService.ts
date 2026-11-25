import { computeGrowth } from '../../character/growth';
import { Emitter } from '../emitter';
import type { DailyRecord } from '../storage/types';
import { dateKey } from '../util/date';
import type { SharePayload } from './payload';

/**
 * 포도알 공유. 공유를 켜면 기기 기록의 '요약'(날짜별 횟수, 캐릭터 단계, 이름)을
 * 서버(/api/share/:id)에 올리고, 링크를 받은 사람은 그 요약을 읽기 전용으로 본다.
 * 수정·삭제는 이 기기에만 있는 비밀 키로만 가능하다.
 */
export interface ShareState {
  enabled: boolean;
  id: string | null;
  name: string;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'error';
  error: string | null;
}

interface StoredShare {
  id: string;
  secret: string;
  name: string;
  lastSyncedAt: string | null;
}

const KEY = 'squat.share.v1';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function buildPayload(records: DailyRecord[], name: string, now = new Date()): SharePayload {
  const daily: Record<string, number> = {};
  for (const r of records) if (r.totalReps > 0) daily[r.date] = r.totalReps;
  return { v: 1, name: name.trim().slice(0, 20), updatedAt: now.toISOString(), today: dateKey(now), daily, stage: computeGrowth(records).stage };
}

export function shareUrl(id: string): string {
  const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
  return `${base}#/s/${id}`;
}

function errorText(status: number, body: { error?: string } | null): string {
  if (status === 503 || body?.error === 'not-configured') return '공유 서버가 아직 설정되지 않았습니다.';
  if (status === 403) return '이 기기에서 만든 공유 링크가 아닙니다.';
  if (status === 404 && body === null) return '공유 서버에 연결할 수 없습니다.';
  return `공유 업데이트 실패 (${status})`;
}

export class ShareService extends Emitter<{ change: ShareState }> {
  private stored: StoredShare | null;
  private _state: ShareState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => SharePayload) | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
    private debounceMs = 2500,
  ) {
    super();
    this.stored = this.load();
    this._state = this.toState('idle', null);
  }

  get state(): ShareState {
    return this._state;
  }

  get link(): string | null {
    return this.stored ? shareUrl(this.stored.id) : null;
  }

  /** 공유 시작: 링크를 만들고 현재 기록을 즉시 올린다 */
  async enable(records: DailyRecord[], name: string): Promise<boolean> {
    const s: StoredShare = this.stored ?? { id: randomToken(12), secret: randomToken(32), name, lastSyncedAt: null };
    s.name = name.trim().slice(0, 20);
    this.stored = s;
    this.save();
    await this.push(buildPayload(records, s.name));
    if (this._state.status === 'error') {
      // 서버에 올리지 못했으면 링크도 만들지 않은 것으로 되돌린다
      if (!s.lastSyncedAt) {
        this.stored = null;
        this.save();
        this._state = { ...this.toState('error', this._state.error) };
        this.emit('change', this._state);
      }
      return false;
    }
    return true;
  }

  /** 공유 중지: 서버의 데이터를 지우고 이 기기의 링크 정보를 없앤다 */
  async disable(): Promise<boolean> {
    const s = this.stored;
    if (!s) return true;
    if (this.timer) clearTimeout(this.timer);
    this.pending = null;
    try {
      const res = await this.fetchFn(`/api/share/${s.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${s.secret}` } });
      if (!res.ok && res.status !== 404) throw new Error(errorText(res.status, await res.json().catch(() => null)));
    } catch (e) {
      this.set('error', e instanceof Error ? e.message : String(e));
      return false;
    }
    this.stored = null;
    this.save();
    this.set('idle', null);
    return true;
  }

  async rename(name: string, records: DailyRecord[]): Promise<void> {
    if (!this.stored) return;
    this.stored.name = name.trim().slice(0, 20);
    this.save();
    await this.push(buildPayload(records, this.stored.name));
  }

  /** 기록이 바뀔 때 호출 — 짧은 시간 안의 여러 변경은 한 번에 올린다 */
  schedule(getRecords: () => DailyRecord[]): void {
    if (!this.stored) return;
    this.pending = () => buildPayload(getRecords(), this.stored!.name);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const make = this.pending;
      this.pending = null;
      if (make && this.stored) void this.push(make());
    }, this.debounceMs);
  }

  /** 즉시 올리기 (앱 시작, 운동 종료 등) */
  async syncNow(records: DailyRecord[]): Promise<void> {
    if (!this.stored) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    await this.push(buildPayload(records, this.stored.name));
  }

  private async push(payload: SharePayload): Promise<void> {
    const s = this.stored;
    if (!s) return;
    if (this.inflight) await this.inflight.catch(() => {});
    this.set('syncing', null);
    this.inflight = (async () => {
      try {
        const res = await this.fetchFn(`/api/share/${s.id}`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${s.secret}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(errorText(res.status, await res.json().catch(() => null)));
        if (this.stored === s) {
          s.lastSyncedAt = payload.updatedAt;
          this.save();
        }
        this.set('idle', null);
      } catch (e) {
        this.set('error', e instanceof TypeError ? '네트워크에 연결할 수 없습니다.' : e instanceof Error ? e.message : String(e));
      }
    })();
    await this.inflight;
    this.inflight = null;
  }

  private toState(status: ShareState['status'], error: string | null): ShareState {
    const s = this.stored;
    return { enabled: !!s, id: s?.id ?? null, name: s?.name ?? '', lastSyncedAt: s?.lastSyncedAt ?? null, status, error };
  }

  private set(status: ShareState['status'], error: string | null): void {
    this._state = this.toState(status, error);
    this.emit('change', this._state);
  }

  private load(): StoredShare | null {
    try {
      const raw = this.storage?.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as StoredShare) : null;
      return s && typeof s.id === 'string' && typeof s.secret === 'string' ? s : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      if (this.stored) this.storage?.setItem(KEY, JSON.stringify(this.stored));
      else this.storage?.removeItem(KEY);
    } catch {
      /* noop */
    }
  }
}
