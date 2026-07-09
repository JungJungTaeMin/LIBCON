$envPath = Join-Path $PSScriptRoot '.env'

Write-Host ''
Write-Host 'LIBCON external API setup'
Write-Host 'Kakao Developers에서 발급받은 키를 입력하세요.'
Write-Host ''

$kakaoRestApiKey = Read-Host 'KAKAO_REST_API_KEY'
$kakaoJsApiKey = Read-Host 'KAKAO_JS_API_KEY'
$googleClientId = Read-Host 'GOOGLE_CLIENT_ID'
$googleClientSecret = Read-Host 'GOOGLE_CLIENT_SECRET'
$googleRedirectUri = Read-Host 'GOOGLE_REDIRECT_URI (Enter for http://localhost:5173/api/auth/google/callback)'
if ([string]::IsNullOrWhiteSpace($googleRedirectUri)) {
  $googleRedirectUri = 'http://localhost:5173/api/auth/google/callback'
}

@"
KAKAO_REST_API_KEY=$kakaoRestApiKey
KAKAO_JS_API_KEY=$kakaoJsApiKey
GOOGLE_CLIENT_ID=$googleClientId
GOOGLE_CLIENT_SECRET=$googleClientSecret
GOOGLE_REDIRECT_URI=$googleRedirectUri
"@ | Set-Content -Encoding UTF8 -LiteralPath $envPath

Write-Host ''
Write-Host ".env saved: $envPath"
Write-Host 'Run: powershell -ExecutionPolicy Bypass -File .\start-server.ps1'
