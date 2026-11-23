import type { SensorStatus } from '../../core/sensor/SensorManager';
import { Banner } from './common';

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const SENSOR_LABEL: Record<SensorStatus, string> = {
  idle: '센서 꺼짐',
  requesting: '권한 요청 중',
  waiting: '센서 연결 중',
  active: '센서 연결됨',
  stalled: '센서 신호 끊김',
  denied: '센서 권한 거부됨',
  unsupported: '센서 미지원',
  insecure: '보안 연결 필요',
};

/** 센서를 쓸 수 없을 때의 안내. 수동 카운트로 계속할 수 있음을 함께 알린다 */
export function SensorHelp({ status, onRetry }: { status: SensorStatus; onRetry: () => void }) {
  if (status === 'denied') {
    return (
      <Banner tone="warn" action={<button className="btn-small" onClick={onRetry}>다시 요청</button>}>
        <strong>동작 센서 권한이 거부되었습니다.</strong>
        {isIOS() ? (
          <p>
            Safari 를 완전히 종료한 뒤 다시 열고 '다시 요청'을 누르면 권한을 다시 묻습니다. 기기·iOS 버전에 따라 설정
            위치가 다를 수 있습니다.
          </p>
        ) : (
          <p>주소창의 사이트 정보(자물쇠) 아이콘 → 사이트 설정 → '동작 센서'를 허용한 뒤 '다시 요청'을 눌러 주세요.</p>
        )}
        <p>그동안 아래 +1 버튼으로 수동 기록할 수 있습니다.</p>
      </Banner>
    );
  }
  if (status === 'unsupported') {
    return (
      <Banner tone="warn" action={<button className="btn-small" onClick={onRetry}>다시 시도</button>}>
        <strong>이 기기·브라우저에서는 동작 센서 데이터를 받을 수 없습니다.</strong>
        <p>수동 카운트(+1)로 운동을 기록할 수 있습니다.</p>
      </Banner>
    );
  }
  if (status === 'insecure') {
    return (
      <Banner tone="warn">
        <strong>동작 센서는 HTTPS 주소에서만 사용할 수 있습니다.</strong>
        <p>배포된 https 주소로 접속해 주세요. 수동 카운트는 계속 사용할 수 있습니다.</p>
      </Banner>
    );
  }
  if (status === 'stalled') {
    return (
      <Banner tone="warn">
        <strong>센서 신호가 끊겼습니다.</strong>
        <p>화면이 꺼지거나 다른 앱으로 전환되면 센서가 멈춥니다. 신호가 돌아오면 자동으로 이어집니다.</p>
      </Banner>
    );
  }
  return null;
}
