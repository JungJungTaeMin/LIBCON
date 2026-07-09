Set-Location -LiteralPath $PSScriptRoot

$serverPath = Join-Path $PSScriptRoot 'start-server.ps1'

$server = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-NoExit',
  '-File',
  $serverPath
) -WindowStyle Normal -PassThru

$ports = @(5173, 5174)
$opened = $false

for ($attempt = 1; $attempt -le 20; $attempt++) {
  foreach ($port in $ports) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/config" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        Start-Process "http://localhost:$port/"
        $opened = $true
        break
      }
    } catch {
    }
  }

  if ($opened) {
    break
  }

  Start-Sleep -Milliseconds 500
}

if (!$opened) {
  Write-Host 'LIBCON API server did not respond yet.'
  Write-Host 'Wait a moment, then open: http://localhost:5173/'
  Write-Host 'If the server window shows an error, send that message to Codex.'
}
