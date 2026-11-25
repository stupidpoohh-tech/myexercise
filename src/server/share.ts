import { MAX_PAYLOAD_BYTES, SHARE_ID_RE, SHARE_SECRET_RE, sanitizePayload, type SharePayload } from '../core/share/payload';

/** Cloudflare KV 중 사용하는 부분만 정의 (테스트에서 메모리 구현으로 대체) */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  SHARE_KV?: KVLike;
}

interface StoredRecord {
  secretHash: string;
  payload: SharePayload;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '');
  return m && SHARE_SECRET_RE.test(m[1]) ? m[1] : null;
}

/**
 * GET    /api/share/:id   — 누구나 조회 (요약 데이터만)
 * PUT    /api/share/:id   — 소유자만 갱신 (Authorization: Bearer <secret>). 처음 PUT 이 소유 키를 정한다
 * DELETE /api/share/:id   — 소유자만 삭제 (공유 중지)
 */
export async function handleShare(req: Request, env: Env, id: string): Promise<Response> {
  if (!SHARE_ID_RE.test(id)) return json(400, { error: 'bad-id' });
  const kv = env.SHARE_KV;
  if (!kv) return json(503, { error: 'not-configured' });
  const key = `share:${id}`;

  if (req.method === 'GET') {
    const raw = await kv.get(key);
    if (!raw) return json(404, { error: 'not-found' });
    const rec = JSON.parse(raw) as StoredRecord;
    return json(200, rec.payload);
  }

  if (req.method === 'PUT' || req.method === 'DELETE') {
    const secret = bearer(req);
    if (!secret) return json(401, { error: 'unauthorized' });
    const hash = await sha256(secret);
    const raw = await kv.get(key);
    const existing = raw ? (JSON.parse(raw) as StoredRecord) : null;
    if (existing && existing.secretHash !== hash) return json(403, { error: 'forbidden' });

    if (req.method === 'DELETE') {
      if (existing) await kv.delete(key);
      return json(200, { ok: true });
    }

    const text = await req.text();
    if (text.length > MAX_PAYLOAD_BYTES) return json(413, { error: 'too-large' });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'bad-json' });
    }
    const payload = sanitizePayload(body);
    if (!payload) return json(400, { error: 'bad-payload' });
    await kv.put(key, JSON.stringify({ secretHash: hash, payload } satisfies StoredRecord));
    return json(200, { ok: true });
  }

  return json(405, { error: 'method-not-allowed' });
}
