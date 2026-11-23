import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig } from '../detection/config';
import { MotionPipeline } from '../detection/MotionPipeline';
import { decodeSample, type SensorLogFile } from './SensorLog';

/**
 * sensor-logs/*.json (실기기에서 내보낸 센서 기록)을 현재 판정 로직으로 재생한다.
 * 파일이 없으면 건너뛴다. `npm run replay` 로 실행.
 */
const dir = join(process.cwd(), 'sensor-logs');
let files: string[] = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.json'));
} catch {
  files = [];
}

describe.skipIf(files.length === 0)('실기기 센서 기록 재생', () => {
  for (const f of files) {
    it(f, () => {
      const log = JSON.parse(readFileSync(join(dir, f), 'utf8')) as SensorLogFile;
      expect(log.kind).toBe('sensor-log');
      const pipe = new MotionPipeline(mergeConfig(DEFAULT_CONFIG, log.config));
      let reps = 0;
      let descents = 0;
      const rejected: Record<string, number> = {};
      pipe.detector.on('rep', () => reps++);
      pipe.detector.on('state', (e) => e.to === 'DESCENDING' && e.from !== 'BOTTOM' && descents++);
      pipe.detector.on('rejected', (r) => (rejected[r.reason] = (rejected[r.reason] ?? 0) + 1));
      for (const a of log.samples) pipe.push(decodeSample(a));
      const recordedReps = log.events.filter((e) => e.type === 'rep').length;
      const marks = log.events.filter((e) => e.type === 'mark').map((e) => (e as { label: string }).label);
      const secs = log.samples.length ? ((log.samples[log.samples.length - 1][0] as number) - (log.samples[0][0] as number)) / 1000 : 0;
      console.log(
        `[replay] ${f}: ${secs.toFixed(0)}s, ${log.samples.length} samples · 기록 당시 ${recordedReps}회 → 현재 ${reps}회 · 하강 시작 ${descents}회 · 제외 ${JSON.stringify(rejected)} · 수동 보정 ${marks.join(',') || '없음'}`,
      );
    });
  }
});
