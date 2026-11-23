# 스쿼트 100 — 스쿼트 트래킹 모바일 웹 (MVP)

스마트폰을 양손으로 가슴 앞에 들고 스쿼트하면 센서로 횟수를 추정해 자동 카운트하고, 같은 판정 결과로 캐릭터(현재는 임시 도형)를 움직이며, 날짜별 기록을 IndexedDB에 저장합니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173 (?debug=1 로 개발 패널)
npm test           # 판정·저장·세션·애니메이션 단위 테스트
npm run build      # dist/ 생성
```

동작 센서는 **HTTPS**에서만 동작합니다. 실기기 테스트는 Cloudflare Pages 배포 주소(또는 HTTPS 터널)로 접속합니다.

### Cloudflare Pages 배포
- Build command: `npm run build`
- Output directory: `dist`
- `public/_headers` 에 센서·Wake Lock 권한 정책 헤더가 포함되어 있습니다. 해시 라우팅(`#/records`)을 쓰므로 별도 리다이렉트 설정은 필요 없습니다.

## 구조

```
src/core/                       UI와 무관한 핵심 로직 (단위 테스트 대상)
  sensor/SensorManager.ts       권한(iOS requestPermission)·지원 여부·수신 중단 감지·샘플링 속도
  sensor/SignalProcessor.ts     원시 가속도 → 중력 방향 투영 수직 가속도 → 노이즈 필터 → 수직 속도 추정
  detection/SquatDetector.ts    IDLE → DESCENDING → BOTTOM → ASCENDING → COMPLETED 상태 머신 + 검증
  detection/MotionPipeline.ts   신호처리 + 판정 묶음 (실센서·시뮬레이터·테스트 공통 경로)
  detection/CalibrationManager  처음 3회로 기기·사용자별 임계값과 기준 깊이 산출 (localStorage 저장)
  detection/config.ts           모든 임계값 (실기기 튜닝 대상)
  animation/types.ts            CharacterPose / CharacterRenderer — 에셋 연결 인터페이스
  animation/AnimationController 판정 결과(MotionFrame)를 렌더러용 자세로 보간·전달
  animation/PlaceholderRenderer 임시 도형 렌더러 (교체 대상)
  animation/FrameSequenceRenderer 이미지 시퀀스 에셋용 범용 렌더러 예시
  workout/WorkoutSessionManager 세션 수명주기, 카운트, 수동 보정, 자정 분할, 저장 큐·재시도
  workout/WakeLock.ts           화면 꺼짐 방지
  storage/WorkoutStorage.ts     IndexedDB (세션·일별 기록), JSON 내보내기/가져오기
  storage/DailyRecordService.ts 통계·연속 달성 계산
  sim/                          가상 움직임 생성기·실시간 재생 소스
src/character/index.ts          ★ 캐릭터 렌더러 교체 지점
src/ui/                         화면(홈·운동·기록), 개발 패널
```

판정은 `SquatDetector` 한 곳에서만 하며, 카운트와 애니메이션은 같은 `MotionFrame` / `rep` 이벤트를 구독합니다.

## 캐릭터 에셋 연결

`src/character/index.ts` 의 팩토리만 바꿉니다. 렌더러는 `CharacterRenderer` 를 구현합니다.

```ts
interface CharacterRenderer {
  mount(container: HTMLElement): void;
  render(pose: CharacterPose): void;      // 매 프레임: state, depth(0~1), progress|null, reps, tracking
  onEvent?(e: CharacterEvent): void;      // state 전환, rep, rejected, tracking
  destroy(): void;
}
```

- `pose.depth` 는 보간된 앉은 정도(0 서 있음 ~ 1 최저 자세)입니다.
- `pose.progressKnown === false` 이면 보정 전이거나 흔들림이 커서 진행도를 추정하지 않은 상태이며, depth 는 상태 기반 근사값입니다(최저 자세까지 과장하지 않음).
- 이미지 시퀀스라면 `FrameSequenceRenderer({ frames: [...] })` 를 그대로 쓸 수 있습니다. 스프라이트 시트·Lottie·Spine 등은 같은 인터페이스로 구현합니다.

## 판정 방식 요약

1. 중력 방향(`accelerationIncludingGravity − acceleration`, 없으면 저역통과)으로 선형 가속도를 투영 → 휴대폰을 어떤 각도로 들어도 수직 성분을 얻고, 플랫폼별 부호 규약 차이에도 영향을 받지 않습니다.
2. 4Hz 저역통과로 노이즈 제거, 고주파 성분은 흔들기 지표로 사용합니다.
3. 누설 적분으로 수직 속도를 추정하고, 정지 구간에서 남은 속도를 센서 편향 보정에 되돌려 드리프트를 줄입니다.
4. 하강 → 최저 → 상승이 순서대로 관찰되고 다음 조건을 모두 통과할 때만 1회 카운트합니다: 구간별 최소 시간(빠른 흔들기 제외), 1회 최소·최대 시간, 최소 변위, 하강·상승 대칭성, 흔들림·가속도 상한, 회전 속도·기울기 변화 상한(방향 바꾸기 제외), 가속도 부호 전환 횟수, 연속 카운트 최소 간격.
5. 센서 샘플이 0.4초 이상 끊기면 진행 중인 반복은 버립니다.

## 실기기 튜닝

`?debug=1` 로 접속하면 DEV 버튼이 생깁니다.
- 실시간 수직 속도 그래프(상태별 색)·시작 임계선·진행도
- 마지막 인식/제외된 반복의 지표(시간, 깊이, 최고 속도, 제외 사유)
- 모든 임계값 슬라이더 (localStorage 저장), 보정값 삭제
- 가상 센서 모드와 시나리오(normal/slow/fast/stopped/shake/rotate/dropout) 재생

## 검증 범위

`npm test` (76개): 기기 변형 6종(중력 제외 가속도 미제공, 부호 반전, 민감도·샘플링 차이, 큰 잡음)마다 정상·느린·빠른 스쿼트, 중간 멈춤, 흔들기, 방향 변경, 센서 중단 시나리오를 시뮬레이션으로 검증합니다. 저장(합산, 100회 초과, 중복 저장, 재접속 후 유지, 날짜 분리, 수동 보정, 내보내기·가져오기), 자정 분할, 저장 실패 후 재시도, 애니메이션 상태 일치도 포함합니다.

**시뮬레이션은 단순화된 물리 모델이며, 실제 기기에서의 인식 정확도를 검증한 것이 아닙니다.** 실기기 테스트로 임계값을 조정해야 합니다.

### 알려진 한계
- 휴대폰 센서는 몸 전체가 내려가는 것과 팔만 내려가는 것을 구분할 수 없습니다. 스쿼트와 비슷한 크기(±10cm 이상)·속도(1Hz 이하)로 휴대폰을 위아래로 움직이면 카운트될 수 있습니다(테스트에 한계 사례로 명시). 보정 후에는 보정 깊이의 절반 미만 움직임은 제외됩니다.
- 화면이 꺼지거나 백그라운드로 가면 브라우저가 센서 이벤트를 멈춥니다. Wake Lock 미지원 브라우저에서는 화면 자동 꺼짐 설정에 영향을 받습니다.
- 기록은 해당 브라우저의 IndexedDB 에만 저장됩니다. 브라우저 데이터 삭제 전 JSON 으로 내보내 두어야 합니다.
