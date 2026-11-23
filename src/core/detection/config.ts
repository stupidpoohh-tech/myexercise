/**
 * 스쿼트 판정 임계값. 실제 기기 테스트 결과에 따라 조정할 수 있도록 한 곳에 모았다.
 * 디버그 패널(?debug=1)에서 실시간으로 바꿔볼 수 있고, 보정(calibration) 결과가
 * 일부 값을 기기·사용자별로 덮어쓴다.
 */
export interface DetectorConfig {
  /** 하강/상승 시작으로 볼 최소 수직 속도 (m/s) */
  velStart: number;
  /** 상승/하강 종료로 볼 속도 비율 (해당 구간 최고 속도 대비) */
  velEndRatio: number;
  /** 시작 속도가 이 시간 이상 유지되어야 동작 시작으로 인정 (ms) */
  startHoldMs: number;
  /** 이만큼(m, 상대값) 내려가야 하강으로 확정 — 서 있을 때의 흔들림 제외 */
  startDepth: number;
  /** 하강·상승 각 구간 최소 시간 (ms) — 짧은 흔들기 제외 */
  minPhaseMs: number;
  /** 하강 구간 최대 시간 (ms) */
  maxDescentMs: number;
  /** 상승 구간 최대 시간 (ms) */
  maxAscentMs: number;
  /** 최저 자세 최대 유지 시간 (ms). 초과하면 반복 취소 */
  maxBottomMs: number;
  /** 1회 전체 최소/최대 시간 (ms) */
  minRepMs: number;
  maxRepMs: number;
  /** 최소 하강 변위 추정치 (m, 상대값) */
  minDepth: number;
  /** 상승/하강 변위 비율 허용 범위 */
  minSymmetry: number;
  maxSymmetry: number;
  /** 흔들기 에너지 상한 (고주파 가속도 RMS, m/s²) */
  maxShake: number;
  /** 필터 후 수직 가속도 상한 (m/s²) */
  maxAccel: number;
  /** 회전 속도 상한 (deg/s) — 휴대폰을 돌리는 동작 제외 */
  maxRotation: number;
  /** 반복 중 기기 기울기 변화 상한 (deg) */
  maxTiltDeg: number;
  /** 1회 반복 중 가속도 부호 전환 최대 횟수 */
  maxZeroCrossings: number;
  /** 연속 카운트 사이 최소 간격 (ms) — 중복 카운트 방지 */
  refractoryMs: number;
  /** 이 시간 이상 샘플이 끊기면 진행 중인 반복을 취소 (ms) */
  maxSampleGapMs: number;
  /** 진행도 계산 기준 깊이 (m, 보정 시 설정). null 이면 진행도 미제공 */
  expectedDepth: number | null;
}

export const DEFAULT_CONFIG: DetectorConfig = {
  velStart: 0.1,
  velEndRatio: 0.25,
  startHoldMs: 90,
  startDepth: 0.05,
  minPhaseMs: 250,
  maxDescentMs: 3500,
  maxAscentMs: 3500,
  maxBottomMs: 5000,
  minRepMs: 700,
  maxRepMs: 9000,
  minDepth: 0.06,
  minSymmetry: 0.3,
  maxSymmetry: 4.5,
  maxShake: 2.2,
  maxAccel: 9,
  maxRotation: 260,
  maxTiltDeg: 75,
  maxZeroCrossings: 7,
  refractoryMs: 350,
  maxSampleGapMs: 400,
  expectedDepth: null,
};

export const CONFIG_LIMITS: Partial<Record<keyof DetectorConfig, [number, number, number]>> = {
  // [min, max, step]
  velStart: [0.02, 0.5, 0.01],
  velEndRatio: [0.05, 0.6, 0.01],
  startHoldMs: [0, 400, 10],
  startDepth: [0.01, 0.2, 0.01],
  minPhaseMs: [50, 1000, 10],
  minRepMs: [200, 3000, 50],
  maxRepMs: [2000, 20000, 500],
  maxBottomMs: [500, 15000, 250],
  minDepth: [0.01, 0.5, 0.01],
  minSymmetry: [0.1, 1, 0.05],
  maxSymmetry: [1, 5, 0.1],
  maxShake: [0.3, 8, 0.1],
  maxAccel: [2, 30, 0.5],
  maxRotation: [20, 600, 10],
  maxTiltDeg: [5, 90, 1],
  maxZeroCrossings: [2, 20, 1],
  refractoryMs: [0, 2000, 50],
};

export function mergeConfig(base: DetectorConfig, patch: Partial<DetectorConfig> | null | undefined): DetectorConfig {
  if (!patch) return { ...base };
  const out: DetectorConfig = { ...base };
  for (const key of Object.keys(base) as (keyof DetectorConfig)[]) {
    const v = patch[key];
    if (key === 'expectedDepth') {
      if (v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)) out.expectedDepth = v as number | null;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      (out[key] as number) = v;
    }
  }
  return out;
}
