/**
 * 공유용 요약 데이터. 서버(Cloudflare Pages Functions)와 앱이 함께 쓴다.
 * 날짜별 총 횟수와 캐릭터 단계만 담고, 세션 시각 등 세부 기록은 보내지 않는다.
 */
export interface SharePayload {
  v: 1;
  /** 보는 사람에게 보여 줄 이름 (선택) */
  name: string;
  /** 소유자 기기에서 마지막으로 갱신한 시각 (ISO) */
  updatedAt: string;
  /** 소유자 기기의 오늘 날짜 (YYYY-MM-DD) */
  today: string;
  /** 날짜별 총 스쿼트 횟수 */
  daily: Record<string, number>;
  /** 캐릭터 성장 단계 */
  stage: number;
}

export const SHARE_ID_RE = /^[A-Za-z0-9]{10,32}$/;
export const SHARE_SECRET_RE = /^[A-Za-z0-9]{24,64}$/;
export const MAX_PAYLOAD_BYTES = 64 * 1024;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 형식 검증 후 정규화한 값을 돌려준다. 잘못되면 null */
export function sanitizePayload(raw: unknown): SharePayload | null {
  const p = raw as Partial<SharePayload> | null;
  if (!p || typeof p !== 'object' || p.v !== 1) return null;
  if (typeof p.updatedAt !== 'string' || Number.isNaN(Date.parse(p.updatedAt))) return null;
  if (typeof p.today !== 'string' || !DATE_RE.test(p.today)) return null;
  if (!p.daily || typeof p.daily !== 'object') return null;
  const daily: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.daily)) {
    if (!DATE_RE.test(k) || typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100000) return null;
    if (v > 0) daily[k] = v;
  }
  const stage = typeof p.stage === 'number' && Number.isInteger(p.stage) && p.stage >= 1 && p.stage <= 10 ? p.stage : 1;
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, 20) : '';
  return { v: 1, name, updatedAt: p.updatedAt, today: p.today, daily, stage };
}
