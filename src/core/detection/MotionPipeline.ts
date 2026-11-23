import { SignalProcessor, type SignalProcessorOptions } from '../sensor/SignalProcessor';
import type { MotionFrame, MotionSample } from '../types';
import { DEFAULT_CONFIG, type DetectorConfig } from './config';
import { SquatDetector } from './SquatDetector';

/**
 * 신호 처리 + 스쿼트 판정 묶음. 실제 센서·시뮬레이터·테스트가 모두 이 경로를 쓴다.
 * 판정 상태에 따라 신호 처리기의 필터 모드를 바꾼다 (동작 중에는 신호 보존, 대기 중에는 드리프트 제거).
 */
export class MotionPipeline {
  readonly processor: SignalProcessor;
  readonly detector: SquatDetector;

  constructor(config: DetectorConfig = DEFAULT_CONFIG, signal: Partial<SignalProcessorOptions> = {}) {
    this.processor = new SignalProcessor(signal);
    this.detector = new SquatDetector(config);
    this.detector.on('state', ({ to }) => {
      this.processor.setMotionActive(to === 'DESCENDING' || to === 'BOTTOM' || to === 'ASCENDING');
    });
  }

  push(sample: MotionSample): MotionFrame | null {
    const p = this.processor.process(sample);
    return p ? this.detector.process(p) : null;
  }

  /** 진행 중 반복을 버리고 속도 적분을 초기화 */
  resetMotion(): void {
    this.processor.resetMotion();
    this.detector.reset();
  }

  resetAll(): void {
    this.processor.reset();
    this.detector.reset();
  }
}
