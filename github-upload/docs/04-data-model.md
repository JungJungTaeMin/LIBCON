# Data Model

## 테이블 목록

| 테이블명 | 역할 |
| --- | --- |
| `users` | 사용자, 소셜 로그인, 닉네임, 소속 진영, EXP |
| `factions` | 진영 정보, 색상, 가입 방식, 소개 |
| `libraries` | 도서관 위치, 기본 정보, 현재 점령 진영 |
| `library_influences` | 도서관별 진영 영향력 점수 |
| `books` | ISBN 기반 도서 정보 |
| `reading_sessions` | 독서 시작/종료, 페이지, 상태 |
| `location_logs` | 독서 중 GPS 위치 및 이탈 기록 |
| `ai_verifications` | 감상평, 위치, 페이지 검증 결과 |
| `influence_logs` | 영향력 변화와 점령권 변경 이력 |
| `user_rankings` | 개인 랭킹 |
| `faction_rankings` | 진영 랭킹 |

## users

| 컬럼명 | 설명 |
| --- | --- |
| `user_id` | 사용자 ID |
| `faction_id` | 현재 소속 진영 |
| `social_provider` | 소셜 제공자 |
| `social_id` | Google 고유 사용자 ID |
| `email` | 이메일 |
| `name` | 이름 |
| `nickname` | 닉네임 |
| `exp` | 누적 경험치 |
| `role` | 사용자 권한 |
| `onboarding_completed` | 온보딩 완료 여부 |
| `last_login_at` | 마지막 로그인일 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

## factions

| 컬럼명 | 설명 |
| --- | --- |
| `faction_id` | 진영 ID |
| `faction_name` | 진영명 |
| `faction_color` | 대표 색상 |
| `join_type` | `FREE`, `APPROVAL` |
| `description` | 진영 소개 |
| `created_by_user_id` | 생성자 |
| `is_active` | 활성 여부 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

## libraries

| 컬럼명 | 설명 |
| --- | --- |
| `library_id` | 도서관 ID |
| `external_library_code` | 도서관 정보나루 코드 |
| `library_name` | 도서관명 |
| `address` | 주소 |
| `latitude` | 위도 |
| `longitude` | 경도 |
| `region` | 지역 |
| `phone` | 전화번호 |
| `homepage_url` | 홈페이지 |
| `operating_hours` | 운영 시간 |
| `closed_days` | 휴관일 |
| `current_occupied_faction_id` | 현재 점령 진영 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

도서관 핀 색상과 현재 점령 진영은 `libraries.current_occupied_faction_id`를 기준으로 한다.

## library_influences

| 컬럼명 | 설명 |
| --- | --- |
| `influence_id` | 영향력 ID |
| `library_id` | 도서관 ID |
| `faction_id` | 진영 ID |
| `influence_score` | 영향력 점수 |
| `last_contributed_at` | 마지막 기여일 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

제약 조건:

```sql
UNIQUE(library_id, faction_id)
```

## books

| 컬럼명 | 설명 |
| --- | --- |
| `book_id` | 도서 ID |
| `isbn` | ISBN |
| `title` | 제목 |
| `author` | 저자 |
| `publisher` | 출판사 |
| `cover_image_url` | 표지 이미지 |
| `total_pages` | 전체 페이지 수 |
| `description` | 도서 설명 |
| `external_source` | 외부 출처 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

## reading_sessions

| 컬럼명 | 설명 |
| --- | --- |
| `session_id` | 세션 ID |
| `user_id` | 사용자 ID |
| `faction_id` | 세션 당시 소속 진영 |
| `library_id` | 도서관 ID |
| `book_id` | 도서 ID |
| `start_time` | 시작 시간 |
| `end_time` | 종료 시간 |
| `duration_minutes` | 독서 시간 |
| `start_page` | 시작 페이지 |
| `end_page` | 종료 페이지 |
| `is_minimum_time_met` | 20분 충족 여부 |
| `is_location_valid` | 위치 조건 충족 여부 |
| `status` | 세션 상태 |
| `fail_reason` | 실패 사유 |
| `submitted_at` | 제출일 |
| `completed_at` | 완료일 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

상태값:

```text
IN_PROGRESS
READY_TO_VERIFY
SUBMITTED
VERIFICATION_PASSED
VERIFICATION_FAILED
CANCELED
```

## location_logs

| 컬럼명 | 설명 |
| --- | --- |
| `location_log_id` | 위치 기록 ID |
| `session_id` | 세션 ID |
| `latitude` | 위도 |
| `longitude` | 경도 |
| `accuracy_meters` | GPS 정확도 |
| `distance_from_library` | 도서관 기준 거리 |
| `is_out_of_range` | 250m 이탈 여부 |
| `status` | `NORMAL`, `WARNING`, `OUT_OF_RANGE` |
| `checked_at` | 확인 시간 |

## ai_verifications

| 컬럼명 | 설명 |
| --- | --- |
| `verification_id` | 인증 ID |
| `session_id` | 세션 ID |
| `submitted_cover_image_url` | 현재 미사용. 과거 제출 표지 이미지 |
| `registered_cover_image_url` | 현재 미사용. 과거 등록 표지 이미지 |
| `review_text` | 감상평 |
| `vision_confidence` | 이미지 신뢰도 |
| `llm_confidence` | 문맥 신뢰도 |
| `vision_passed` | 현재 미사용. 과거 표지 검증 통과 여부 |
| `llm_passed` | 감상평 검증 통과 여부 |
| `page_validation_passed` | 페이지 검증 통과 여부 |
| `location_validation_passed` | 위치 검증 통과 여부 |
| `is_passed` | 최종 통과 여부 |
| `fail_reason` | 실패 사유 |
| `model_name` | AI 모델명 |
| `verified_at` | 인증 시간 |
| `created_at` | 생성일 |

최종 통과 조건:

```text
vision_passed = true
llm_passed = true
page_validation_passed = true
location_validation_passed = true
reading_sessions.is_minimum_time_met = true
reading_sessions.is_location_valid = true
```

## influence_logs

| 컬럼명 | 설명 |
| --- | --- |
| `log_id` | 로그 ID |
| `user_id` | 기여 사용자 |
| `library_id` | 도서관 ID |
| `faction_id` | 영향력 증가 진영 |
| `session_id` | 세션 ID |
| `score_delta` | 점수 변화량 |
| `influence_before` | 변경 전 영향력 |
| `influence_after` | 변경 후 영향력 |
| `previous_occupied_faction_id` | 이전 점령 진영 |
| `new_occupied_faction_id` | 변경 후 점령 진영 |
| `is_occupation_changed` | 점령권 변경 여부 |
| `action_type` | `INFLUENCE_GAINED`, `OCCUPATION_CHANGED`, `OCCUPATION_MAINTAINED` |
| `created_at` | 기록일 |

## rankings

### user_rankings

| 컬럼명 | 설명 |
| --- | --- |
| `ranking_id` | 랭킹 ID |
| `user_id` | 사용자 ID |
| `faction_id` | 소속 진영 |
| `total_exp` | 총 경험치 |
| `total_books` | 인증 완료 도서 수 |
| `total_sessions` | 완료 세션 수 |
| `rank_position` | 순위 |
| `updated_at` | 갱신일 |

### faction_rankings

| 컬럼명 | 설명 |
| --- | --- |
| `ranking_id` | 랭킹 ID |
| `faction_id` | 진영 ID |
| `total_influence` | 총 영향력 |
| `occupied_library_count` | 점령 도서관 수 |
| `rank_position` | 순위 |
| `updated_at` | 갱신일 |

## 관계

```text
진영 1 : N 사용자
진영 1 : N 도서관 영향력
진영 1 : N 영향력 로그
진영 1 : N 진영 랭킹

사용자 1 : N 독서 세션
사용자 1 : N 영향력 로그
사용자 1 : 1 개인 랭킹

도서관 1 : N 도서관 영향력
도서관 1 : N 독서 세션
도서관 1 : N 영향력 로그

도서 1 : N 독서 세션

독서 세션 1 : N 위치 기록
독서 세션 1 : 1 AI 인증 결과
독서 세션 1 : N 영향력 로그
```

## 점령권 계산

```text
1. AI 인증 최종 성공
2. 사용자 소속 진영의 영향력 증가
3. 해당 도서관의 진영별 영향력 점수 비교
4. 최고 점수 진영 확인
5. 기존 점령 진영과 비교
6. 점령 진영 변경 시 libraries.current_occupied_faction_id 갱신
7. influence_logs에 변경 이력 저장
```

동점 발생 시 기존 점령 진영을 유지한다.
