import { describe, expect, it } from 'vitest';
import { handleShare, type KVLike } from '../../server/share';
import type { DailyRecord } from '../storage/types';
import { ShareService } from './ShareService';

class MemKV implements KVLike {
  m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.m.set(k, v);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}

/** 실제 공유 API 핸들러에 연결한 fetch */
function server(kv: KVLike | undefined) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://app.test');
    const id = url.pathname.split('/').pop()!;
    return handleShare(new Request(url, init), { SHARE_KV: kv }, id);
  }) as typeof fetch;
}

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

const rec = (date: string, totalReps: number): DailyRecord => ({ date, totalReps, goalCompleted: totalReps >= 100, updatedAt: '' });

describe('ShareService', () => {
  it('공유를 켜면 요약이 올라가고, 링크로 같은 내용을 읽을 수 있다', async () => {
    const kv = new MemKV();
    const svc = new ShareService(server(kv), mem(), 0);
    expect(await svc.enable([rec('2026-11-24', 120), rec('2026-11-25', 30)], ' 하나 ')).toBe(true);
    expect(svc.state).toMatchObject({ enabled: true, name: '하나', status: 'idle' });
    expect(svc.link).toMatch(/#\/s\/[A-Za-z0-9]{12}$/);
    const res = await server(kv)(`/api/share/${svc.state.id}`);
    const body = await res.json();
    expect(body).toMatchObject({ name: '하나', daily: { '2026-11-24': 120, '2026-11-25': 30 }, stage: 1 });
    // 세션 등 세부 기록은 포함하지 않는다
    expect(Object.keys(body).sort()).toEqual(['daily', 'name', 'stage', 'today', 'updatedAt', 'v']);
  });

  it('기록이 바뀌면 여러 변경을 모아 한 번에 갱신', async () => {
    const kv = new MemKV();
    let puts = 0;
    const base = server(kv);
    const f = (async (i: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') puts++;
      return base(i, init);
    }) as typeof fetch;
    const svc = new ShareService(f, mem(), 20);
    let records = [rec('2026-11-25', 1)];
    await svc.enable(records, '');
    for (let i = 2; i <= 10; i++) {
      records = [rec('2026-11-25', i)];
      svc.schedule(() => records);
    }
    await new Promise((r) => setTimeout(r, 60));
    expect(puts).toBe(2);
    const body = (await (await base(`/api/share/${svc.state.id}`)).json()) as { daily: Record<string, number> };
    expect(body.daily['2026-11-25']).toBe(10);
  });

  it('새로 열어도(새로고침) 같은 링크를 유지하고, 공유 중지하면 링크가 사라진다', async () => {
    const kv = new MemKV();
    const store = mem();
    const a = new ShareService(server(kv), store, 0);
    await a.enable([rec('2026-11-25', 5)], '');
    const b = new ShareService(server(kv), store, 0);
    expect(b.state.id).toBe(a.state.id);
    expect(await b.disable()).toBe(true);
    expect(b.state.enabled).toBe(false);
    expect((await server(kv)(`/api/share/${a.state.id}`)).status).toBe(404);
  });

  it('서버가 설정되지 않았으면 링크를 만들지 않고 이유를 알려 준다', async () => {
    const svc = new ShareService(server(undefined), mem(), 0);
    expect(await svc.enable([], '')).toBe(false);
    expect(svc.state).toMatchObject({ enabled: false, status: 'error', error: '공유 서버가 아직 설정되지 않았습니다.' });
  });
});
