# 케어톡 (CareTalk) 배포 가이드

강원 사투리 쓰는 AI 어르신과 먼저 연습하는 요양보호사 AI 실기 실습실.
누구나 접속할 수 있는 공개 사이트로 올리는 방법입니다. 15분이면 됩니다.

## 구조

```
caretalk-site/
├── index.html      ← 화면 전체 (소개 · 실습 · 채점 리포트 · 기관 대시보드)
├── api/ai.js       ← 서버 함수. Anthropic API 키를 숨기고 AI를 대신 호출
└── package.json
```

- 음성 인식(말하기)과 어르신 목소리는 브라우저 기능을 씁니다. 크롬에서 가장 잘 됩니다.
- 기관 대시보드 기록은 그 기기의 브라우저에만 저장됩니다 (시제품 단계).
- AI 서버가 연결되지 않으면 자동으로 "대본 모드"로 바뀌어 시연이 멈추지 않습니다.

## 1. Anthropic API 키 만들기

1. https://console.anthropic.com 가입
2. Billing에서 카드 등록 후 소액 충전 (해커톤 시연은 1만 원 안쪽이면 충분)
3. API Keys → Create Key → 복사해 두기 (다시 볼 수 없음)

## 2. Vercel에 올리기 (무료)

### 방법 A: 드래그 앤 드롭 (가장 쉬움)

1. https://vercel.com 가입 (GitHub 계정으로 로그인 추천)
2. 터미널에서:
   ```bash
   npm i -g vercel
   cd caretalk-site
   vercel
   ```
   질문에는 전부 엔터. 끝나면 주소가 나옵니다.

### 방법 B: GitHub 연결

1. GitHub에 새 저장소를 만들고 이 폴더를 올립니다.
2. Vercel → Add New → Project → 저장소 선택 → Deploy

## 3. 환경 변수 넣기 (필수)

Vercel → 프로젝트 → Settings → Environment Variables

| 이름 | 값 | 필수 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 1번에서 복사한 키 | 필수 |
| `ACCESS_CODE` | 예: `just2026` | 권장. 설정하면 처음 들어올 때 코드를 물어봐서 아무나 API를 쓰지 못합니다 |
| `MODEL_MAIN` | 비워 두면 `claude-sonnet-5-5` | 선택 |
| `MODEL_FAST` | 비워 두면 `claude-haiku-5-5` | 선택 |

저장한 뒤 Deployments → 최신 배포 → Redeploy 해야 반영됩니다.

## 4. 확인

1. 크롬에서 주소 접속 → "실습하기"
2. 장비 점검 세 줄이 모두 초록색인지 확인
3. 식사 거부 할머니와 대화 → 채점까지 한 번 끝까지

## 발표 팁

- 발표 슬라이드에 사이트 주소 QR 코드와 접근 코드를 넣으면 심사위원이 자기 폰으로 직접 해 볼 수 있습니다.
- 시연 전에 휴대폰 핫스팟을 켜 두세요. 와이파이가 끊겨도 대본 모드로 흐름은 끝까지 갑니다.
- 대회가 끝나면 `ACCESS_CODE`를 바꾸거나 API 키를 삭제해서 요금이 계속 나가지 않게 하세요.

## (선택) 어르신 목소리를 자연스럽게: Typecast TTS

브라우저 기본 목소리는 기계음이고 컴퓨터마다 달라요. 아래 환경 변수를 넣으면 노년 목소리로 일정하게 말해요. 없으면 자동으로 브라우저 목소리를 써요.

- `TYPECAST_API_KEY`: Typecast API 키 (typecast.ai 콘솔에서 발급)
- `TYPECAST_VOICE_FEMALE`, `TYPECAST_VOICE_MALE` (선택): 쓰고 싶은 보이스 ID. 비워 두면 보이스 목록에서 노년(elder) 여성·남성을 자동으로 골라요.
