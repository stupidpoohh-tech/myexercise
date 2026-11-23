# 운동 포도알 — 스쿼트 트래킹 모바일 웹 (MVP)

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

## 디자인 시스템

모노크롬 · 타이포그래피 중심. 흰 바탕에 검정 텍스트와 1px 선, 직각에 가까운 모서리(4px)만 사용하고, 유채색은 캐릭터 에셋에만 남깁니다. 카드·파스텔 배경·그림자·장식 아이콘을 쓰지 않고 글자 크기와 굵기, 선으로 위계를 만듭니다.

- 주요 버튼: 검정 사각 버튼 / 보조 버튼: 흰 바탕 + 회색 1px 테두리
- 오늘 횟수: 64px 굵은 숫자 + 2px 진행선
- 포도알: 완료 = 검정 알(흰 숫자), 진행 = 회색으로 아래에서 차오름, 미실시 = 회색 테두리. 선택한 날 = 검정 링, 오늘 = 숫자 아래 점
- 토큰: `src/styles.css` 의 `:root` (색상·반경·여백·글꼴). 색 변경은 이곳에서만 합니다.
- 공통 컴포넌트: `src/ui/components/ui.tsx` (Button, Card, ProgressBar, SectionHeader, Notice), `Chrome.tsx` (헤더·화면 전환 버튼), `BottomSheet.tsx` (닫기 버튼·바깥 터치·Esc, 포커스 이동·순환), `SettingsSheet.tsx`, `graphics.tsx` (포도알)
- 글꼴: Pretendard (jsDelivr CDN), 아이콘: Lucide (stroke 1.6)
- 화면: **운동**(기본 화면) / **포도알**. 하단 탭 대신 우측 하단 원형 버튼으로 두 화면을 오가며, 버튼 아이콘은 이동할 화면을 나타냅니다. 헤더에는 서비스명만 둡니다. 이전 경로 `#/home`·`#/character` 는 운동 탭, `#/records` 는 포도알 탭으로 연결됩니다. 운동 중에는 전환 버튼을 숨겨 세션을 벗어나지 않게 합니다.
- 운동 탭: 헤더 · 날짜 · 오늘의 운동 카드(횟수·진행률·캐릭터·시작 버튼)를 스크롤 없이 한 화면에 배치하고, 전환 버튼 자리만큼 아래를 비워 겹치지 않게 합니다. 실제 보이는 높이(`--app-h`, visualViewport 기준)를 사용해 Safari 주소창·툴바 상태에 맞추고, 남는 높이는 캐릭터가 차지합니다. 높이 520px 미만에서만 스크롤을 허용합니다.
- 포도알 화면 (위계: 스티커판 → 핵심 통계 → 선택한 날짜)
  - 스티커판: 카드 없이 흰 배경에 포도송이 배치(해당 월 28~31알, 알마다 날짜). 송이 위에 가는 줄기 하나만 둡니다. 월 이동, '목표 달성 N일 / M일'. 포도알 크기는 화면 폭·높이에 맞춰 42~56px.
  - 미실시 = 빈 알, 1~99회 = 횟수만큼 아래에서 차오름, 100회 이상 = 검정 알. 오늘은 숫자 아래 점, 선택한 날은 검정 링.
  - 핵심 통계 한 줄: 선택한 달의 스쿼트 합계 · 현재 연속 달성일. '더보기'로 전체 누적 스쿼트 · 전체 목표 달성일 · 최장 연속 달성.
  - 선택한 날짜는 요약 한 줄(스쿼트 N회 · 목표 달성 여부)만 보이고, 누르면 하단 시트에서 세션별 시작 시각·횟수·자동/수동 보정을 보여 줍니다.
  - 헤더 우측 설정 아이콘 → 설정 시트: 데이터 내보내기·가져오기, 저장 방식 안내.
- 운동 화면의 캐릭터 아래에 성장 상태(`LV.1 · 다음 성장까지 100알`)를 표시합니다.
- 포도알 획득 알림: 오늘 100회를 넘기는 순간과 운동 결과 화면.

## 캐릭터

제공된 캐릭터 1·2·3은 **성장 단계**입니다. 사용자가 고르지 않고, 운동 기록에 따라 자동으로 바뀝니다.

- 규칙(`src/character/growth.ts` 의 `GROWTH_STAGES`): 지금까지 모은 포도알(하루 100회 달성일) 수 기준 — 0개 1단계, 100개 2단계, 200개 3단계. 기준 변경은 이 표만 고칩니다.
- 단계는 저장하지 않고 기록에서 매번 계산하므로, 새로고침·백업 가져오기 후에도 기록과 항상 일치합니다.
- 운동 중 단계가 오르면 즉시 캐릭터가 바뀌고 알림과 결과 화면에 표시됩니다. 운동 화면에 현재 단계와 다음 성장까지 남은 포도알을 보여 줍니다.

- 원본: `assets/character-src/` (`<번호>.png` 대기 자세, `<번호>excercise.png` 4열×2행 스쿼트 시트 — 1행 하강, 2행 상승)
- 변환: `python3 scripts/build-character.py` (Pillow, NumPy, SciPy 필요) → `public/character/<번호>/squat_0~7.webp, idle.webp`
  - 시트 칸 분리, 흰 배경 제거(3번 시트), 발 위치 기준 정렬, 공통 크기 캔버스 배치
- 렌더러: `src/character/SquatSpriteRenderer.ts`
  - 하강 중 1행 프레임, 상승 중 2행 프레임을 depth(0~1)에 따라 선택, 최저 자세는 1행 마지막 프레임
  - 서 있는 상태가 1.2초 이상 유지되면 대기 자세 이미지로 전환 (연속 반복 중 깜빡임 방지)
  - 카운트 확정 시 짧게 위로 튀는 효과
- 원본을 바꾸거나 단계를 추가할 때는 원본 교체 → 스크립트 실행 → `src/character/index.ts` 의 `CHARACTER_IDS` 와 `growth.ts` 의 `GROWTH_STAGES` 갱신만 하면 됩니다.

`assets/character-src/grape*.png` 는 참고 원본으로 보관 중이며, 화면의 포도알은 모노크롬 SVG 로 그립니다.

## 캐릭터 에셋 연결 (인터페이스)

`src/character/index.ts` 의 팩토리만 바꿉니다 (임시 도형 `PlaceholderRenderer` 는 개발용으로 남겨 두었습니다). 렌더러는 `CharacterRenderer` 를 구현합니다.

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
