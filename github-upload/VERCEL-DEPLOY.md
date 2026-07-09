# LIBCON Vercel 배포

## 1. GitHub 연결

1. `github-upload` 폴더 안의 파일을 GitHub 저장소 최상위에 업로드합니다.
2. Vercel에서 **Add New > Project**를 선택합니다.
3. 해당 GitHub 저장소를 Import합니다.
4. Framework Preset은 **Other**, Build Command와 Output Directory는 비워둡니다.

## 2. 환경변수 등록

Vercel의 **Settings > Environment Variables**에서 다음 항목을 등록합니다.

```text
KAKAO_REST_API_KEY
KAKAO_JS_API_KEY
LIBRARY_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

Production과 Preview 환경을 모두 선택합니다. `.env` 파일은 업로드하지 않습니다.

## 3. 배포 도메인 등록

배포 주소가 `https://libcon-example.vercel.app`이라면:

Google 승인된 리디렉션 URI:

```text
https://libcon-example.vercel.app/api/auth/google/callback
```

Vercel의 `GOOGLE_REDIRECT_URI`에도 같은 값을 입력합니다.

카카오 JavaScript SDK 도메인:

```text
https://libcon-example.vercel.app
```

## 4. 재배포 및 확인

환경변수나 외부 API 도메인을 변경한 뒤 Vercel에서 Redeploy합니다.

아래 주소가 JSON을 반환하면 백엔드 함수가 정상입니다.

```text
https://libcon-example.vercel.app/api/config
```
