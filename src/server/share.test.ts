import { beforeEach, describe, expect, it } from 'vitest';
import { handleShare, type KVLike } from './share';

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

const ID = 'AbCdEf123456';
const SECRET = 'S'.repeat(32);
const payload = { v: 1, name: '하나', updatedAt: '2026-11-25T10:00:00.000Z', today: '2026-11-25', daily: { '2026-11-24': 100, '2026-11-25': 40 }, stage: 1 };
const req = (method: string, body?: unknown, secret?: string) =>
  new Request(`https://x/api/share/${ID}`, {
    method,
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let kv: MemKV;
beforeEach(() => {
  kv = new MemKV();
});

describe('공유 API', () => {
  it('KV 바인딩이 없으면 503 (설정 안내용)', async () => {
    expect((await handleShare(req('GET'), {}, ID)).status).toBe(503);
  });

  it('처음 PUT 으로 생성, 누구나 GET 으로 조회 (비밀 키는 노출되지 않음)', async () => {
    expect((await handleShare(req('GET'), { SHARE_KV: kv }, ID)).status).toBe(404);
    expect((await handleShare(req('PUT', payload, SECRET), { SHARE_KV: kv }, ID)).status).toBe(200);
    const res = await handleShare(req('GET'), { SHARE_KV: kv }, ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual(payload);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect([...kv.m.values()][0]).not.toContain(SECRET);
  });

  it('다른 키로는 수정·삭제할 수 없다', async () => {
    await handleShare(req('PUT', payload, SECRET), { SHARE_KV: kv }, ID);
    const other = 'X'.repeat(32);
    expect((await handleShare(req('PUT', { ...payload, name: '침입' }, other), { SHARE_KV: kv }, ID)).status).toBe(403);
    expect((await handleShare(req('DELETE', undefined, other), { SHARE_KV: kv }, ID)).status).toBe(403);
    expect((await handleShare(req('PUT', payload), { SHARE_KV: kv }, ID)).status).toBe(401);
    expect(((await (await handleShare(req('GET'), { SHARE_KV: kv }, ID)).json()) as { name: string }).name).toBe('하나');
  });

  it('소유자는 갱신·삭제(공유 중지)할 수 있다', async () => {
    await handleShare(req('PUT', payload, SECRET), { SHARE_KV: kv }, ID);
    await handleShare(req('PUT', { ...payload, daily: { '2026-11-25': 100 } }, SECRET), { SHARE_KV: kv }, ID);
    expect(((await (await handleShare(req('GET'), { SHARE_KV: kv }, ID)).json()) as { daily: object }).daily).toEqual({ '2026-11-25': 100 });
    expect((await handleShare(req('DELETE', undefined, SECRET), { SHARE_KV: kv }, ID)).status).toBe(200);
    expect((await handleShare(req('GET'), { SHARE_KV: kv }, ID)).status).toBe(404);
  });

  it('잘못된 ID·형식은 거부하고, 이름은 20자로 자른다', async () => {
    expect((await handleShare(req('GET'), { SHARE_KV: kv }, '../etc')).status).toBe(400);
    expect((await handleShare(req('PUT', { ...payload, daily: { bad: 1 } }, SECRET), { SHARE_KV: kv }, ID)).status).toBe(400);
    expect((await handleShare(req('PUT', { ...payload, v: 2 }, SECRET), { SHARE_KV: kv }, ID)).status).toBe(400);
    await handleShare(req('PUT', { ...payload, name: '가'.repeat(40), extra: 'x' }, SECRET), { SHARE_KV: kv }, ID);
    const body = (await (await handleShare(req('GET'), { SHARE_KV: kv }, ID)).json()) as Record<string, unknown>;
    expect((body.name as string).length).toBe(20);
    expect(body.extra).toBeUndefined();
  });
});
