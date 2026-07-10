# LIBCON Development Docs

이 문서는 LIBCON 개발에 필요한 기획, API, 데이터 모델, 구현 순서를 한곳에 모은 개발 기준 문서입니다.

## 문서 목록

| 문서 | 목적 |
| --- | --- |
| [01-requirements.md](./01-requirements.md) | MVP 범위, 핵심 기능, 화면 단위 기능 |
| [02-user-flow.md](./02-user-flow.md) | 전체 사용자 흐름과 주요 정책 |
| [03-api-spec.md](./03-api-spec.md) | 프론트/백엔드 연동용 API 명세 |
| [04-data-model.md](./04-data-model.md) | 엔티티, 테이블, 관계, 상태값 |
| [05-development-plan.md](./05-development-plan.md) | 개발 순서, 외부 API, 체크리스트 |
| [08-implementation-status.md](./08-implementation-status.md) | 현재 코드 기준 구현 현황과 남은 제약 |

## 현재 코드 기준 구현 상태

| 영역 | 상태 | 비고 |
| --- | --- | --- |
| PWA 정적 앱 | 구현됨 | `index.html`, `app.js`, `styles.css`, manifest, service worker |
| Google OAuth | 부분 구현됨 | 현재 서버에서 Google OAuth callback 처리 및 쿠키 세션 저장 |
| 내 정보 조회 | 부분 구현됨 | `GET /api/auth/me` 형태로 구현됨 |
| 주변 도서관 조회 | 부분 구현됨 | `GET /api/libraries`가 Kakao Local API 기반으로 구현됨 |
| 온보딩/진영 | 구현됨 | 닉네임, 진영 선택, 진영 생성 후 즉시 가입 |
| 독서 세션 | 구현됨 | 250m 체크인, ISBN 조회, 타이머, 위치 ping, 취소 |
| 인증/보상 | 구현됨 | 감상평/페이지/위치 검증, EXP/영향력/점령권 갱신 |
| 랭킹/마이페이지 | 구현됨 | 개인/진영 랭킹, 내 서재, 독서 기록, 기여 도서관 |
| Supabase | 부분 구현됨 | 로컬 JSON 기준 + Supabase 동기화/관계형 스키마 |

## 개발 원칙

- 프론트와 백엔드가 함께 볼 수 있도록 API 요청/응답 예시는 문서에 먼저 기록한다.
- Swagger를 쓰더라도 노션 또는 `docs/` 문서에 핵심 계약을 유지한다.
- 화면 구현 전 필요한 데이터, 상태값, 실패 케이스를 먼저 정리한다.
- MVP는 로그인, 온보딩, 지도, 독서 세션, 인증, 보상 루프를 우선 완성한다.
