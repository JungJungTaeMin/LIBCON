# API Specification

## 공통 규칙

### Base URL

```text
/api
```

### 인증

로그인 이후 API는 JWT Access Token 사용을 기준으로 한다.

```http
Authorization: Bearer {accessToken}
```

현재 코드의 Google OAuth는 쿠키 세션 방식으로 일부 구현되어 있다. 본격 백엔드 구현 시 JWT 방식으로 전환하거나, 쿠키 세션 방식을 유지할지 결정해야 한다.

### 공통 에러 응답

```json
{
  "code": "ERROR_CODE",
  "message": "에러 메시지"
}
```

## 1. Auth API

### POST /api/auth/login

Google ID Token을 검증하고 JWT를 발급한다.

인증: 불필요

Request:

```json
{
  "idToken": "google_id_token"
}
```

Response:

```json
{
  "accessToken": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "isNewUser": true,
  "onboardingCompleted": false
}
```

### POST /api/auth/refresh

Refresh Token으로 Access Token을 재발급한다.

Request:

```json
{
  "refreshToken": "jwt_refresh_token"
}
```

Response:

```json
{
  "accessToken": "new_jwt_access_token"
}
```

### POST /api/auth/logout

현재 사용자의 Refresh Token 또는 세션을 무효화한다.

인증: 필요

Response:

```json
{
  "message": "로그아웃 완료"
}
```

## 2. User API

### GET /api/users/me

로그인한 사용자의 기본 프로필을 조회한다.

Response:

```json
{
  "userId": 1,
  "nickname": "JungTem",
  "email": "jungtem@example.com",
  "name": "Jung Taemin",
  "exp": 120,
  "faction": {
    "factionId": 2,
    "name": "Blue",
    "color": "#2196F3"
  },
  "onboardingCompleted": true
}
```

### GET /api/users/check-nickname?nickname=JungTem

닉네임 사용 가능 여부를 확인한다.

Response:

```json
{
  "nickname": "JungTem",
  "available": true,
  "message": "사용 가능한 닉네임입니다."
}
```

### POST /api/users/profile

최초 가입자의 닉네임과 진영을 설정한다.

Request:

```json
{
  "nickname": "JungTem",
  "factionId": 2
}
```

Response:

```json
{
  "message": "프로필 등록 완료",
  "onboardingCompleted": true
}
```

## 3. Faction API

### GET /api/factions

사용자가 선택 가능한 진영 목록을 조회한다.

Response:

```json
[
  {
    "factionId": 1,
    "name": "Red",
    "color": "#F44336",
    "joinType": "FREE",
    "description": "열정적인 독서 진영",
    "memberCount": 42
  }
]
```

### POST /api/factions

새 진영을 생성한다.

Request:

```json
{
  "name": "BlueDragon",
  "color": "#2196F3",
  "joinType": "FREE",
  "description": "독서를 사랑하는 진영"
}
```

Response:

```json
{
  "factionId": 3,
  "message": "진영 생성 완료"
}
```

`joinType`: `FREE`, `APPROVAL`

## 4. Library API

### GET /api/libraries

현재 위치 기준 주변 도서관을 조회한다. 기본 반경은 5km다.

Query:

```text
latitude=37.566&longitude=126.978&radius=5000
```

선택 Query:

```text
query=중앙
```

`query`가 있으면 현재 위치 반경 안에서 해당 검색어와 관련된 도서관을 검색한다. 검색어에 `도서관`이 없으면 서버가 자동으로 `도서관` 키워드를 붙여 Kakao Local API에 요청한다.

현재 코드에는 `lat`, `lng`, `radius`, `query` 쿼리로 구현되어 있다. 백엔드 계약을 확정할 때 `latitude/longitude`와 `lat/lng` 중 하나로 통일한다.

Response:

```json
[
  {
    "libraryId": 1,
    "name": "중앙도서관",
    "address": "서울특별시 ...",
    "latitude": 37.566,
    "longitude": 126.978,
    "distance": 320,
    "occupiedFaction": {
      "factionId": 2,
      "name": "Blue",
      "color": "#2196F3"
    }
  }
]
```

### GET /api/libraries/{libraryId}

도서관 상세 정보, 현재 점령 진영, 진영별 영향력을 조회한다.

Response:

```json
{
  "libraryId": 1,
  "libraryName": "중앙도서관",
  "address": "서울특별시 ...",
  "latitude": 37.566,
  "longitude": 126.978,
  "distance": 320,
  "operatingHours": "09:00-18:00",
  "closedDays": "매주 월요일",
  "currentOccupiedFaction": {
    "factionId": 2,
    "name": "Blue",
    "color": "#2196F3"
  },
  "influences": [
    {
      "factionId": 2,
      "faction": "Blue",
      "color": "#2196F3",
      "score": 55
    }
  ],
  "canStartReading": true
}
```

## 5. Book API

### GET /api/books/isbn/{isbn}

ISBN 또는 바코드 번호로 도서 정보를 조회한다. DB에 없으면 외부 API에서 조회 후 저장한다.

Response:

```json
{
  "bookId": 10,
  "isbn": "9788968481901",
  "title": "객체지향의 사실과 오해",
  "author": "조영호",
  "publisher": "위키북스",
  "coverImageUrl": "https://example.com/book-cover.jpg",
  "totalPages": 300,
  "description": "객체지향 설계에 대한 도서 설명"
}
```

## 6. Session API

### POST /api/sessions/start

도서관 반경 250m 이내에서 독서 세션을 시작한다.

Request:

```json
{
  "libraryId": 1,
  "isbn": "9788968481901",
  "latitude": 37.566,
  "longitude": 126.978
}
```

Response:

```json
{
  "sessionId": 31,
  "bookId": 10,
  "startTime": "2026-07-07T15:30:00",
  "status": "IN_PROGRESS"
}
```

Failure:

```json
{
  "code": "OUT_OF_CHECKIN_RANGE",
  "message": "도서관 반경 250m 이내에서만 독서를 시작할 수 있습니다."
}
```

### POST /api/sessions/ping

독서 중 사용자가 도서관 반경을 유지하는지 확인한다.

Request:

```json
{
  "sessionId": 31,
  "latitude": 37.566,
  "longitude": 126.978,
  "accuracyMeters": 15
}
```

Response:

```json
{
  "sessionId": 31,
  "distanceFromLibrary": 42,
  "isOutOfRange": false,
  "status": "NORMAL"
}
```

### POST /api/sessions/{sessionId}/submit

최소 20분 독서 후 인증 정보를 제출한다.

Request:

```json
{
  "startPage": 15,
  "endPage": 72,
  "reviewText": "객체의 역할과 책임을 이해하는 데 도움이 되었다."
}
```

Response:

```json
{
  "sessionId": 31,
  "status": "SUBMITTED",
  "message": "인증 정보가 제출되었습니다."
}
```

### POST /api/sessions/{sessionId}/complete

AI 인증 결과를 바탕으로 최종 인증을 완료하고 보상을 지급한다.

Response: 성공

```json
{
  "sessionId": 31,
  "status": "VERIFICATION_PASSED",
  "reward": {
    "exp": 10,
    "influence": 10
  },
  "occupation": {
    "previousFaction": "Red",
    "currentFaction": "Blue",
    "changed": true
  },
  "ranking": {
    "userRank": 18
  }
}
```

Response: 실패

```json
{
  "sessionId": 31,
  "status": "VERIFICATION_FAILED",
  "reward": {
    "exp": 0,
    "influence": 0
  },
  "failReason": "감상평이 도서 내용과 충분히 관련되지 않습니다."
}
```

## 7. Verification API

### POST /api/verify/llm

감상평이 해당 도서 내용과 관련 있는지 검증한다.

Request:

```json
{
  "sessionId": 31,
  "reviewText": "객체의 역할과 책임을 이해하는 데 도움이 되었다."
}
```

Response:

```json
{
  "sessionId": 31,
  "llmPassed": true,
  "llmConfidence": 0.88,
  "message": "감상평이 도서 내용과 관련 있습니다."
}
```

### GET /api/verify/{sessionId}

해당 독서 세션의 최종 인증 결과를 조회한다.

Response:

```json
{
  "sessionId": 31,
  "visionPassed": true,
  "llmPassed": true,
  "pageValidationPassed": true,
  "locationValidationPassed": true,
  "minimumTimeMet": true,
  "isPassed": true,
  "failReason": null
}
```

## 8. My Page API

```text
GET /api/users/me
GET /api/users/me/books
GET /api/users/me/sessions
GET /api/users/me/libraries
```

## 9. Ranking API

```text
GET /api/ranking/users
GET /api/ranking/factions
```
