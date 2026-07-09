Set-Location -LiteralPath $PSScriptRoot
$logPath = Join-Path $PSScriptRoot 'tmp\server-start.log'
$nodePath = 'C:\Users\209-08\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

if (!(Test-Path -LiteralPath $nodePath)) {
  $nodePath = 'node'
}

New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'tmp') | Out-Null
"starting $(Get-Date -Format o)" | Set-Content -Encoding UTF8 -LiteralPath $logPath
$Host.UI.RawUI.WindowTitle = 'LIBCON API Server'
Write-Host 'LIBCON API server starting...'
Write-Host 'Keep this window open while testing the app.'
Write-Host ''
Write-Host 'Open one of these URLs after the server starts:'
Write-Host '  http://localhost:5173/'
Write-Host '  http://localhost:5174/  (if 5173 is already in use)'
Write-Host ''
Write-Host 'If Google login still does not open, check .env values:'
Write-Host '  GOOGLE_CLIENT_ID'
Write-Host '  GOOGLE_CLIENT_SECRET'
Write-Host ''

if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'check-env.ps1')) {
  & (Join-Path $PSScriptRoot 'check-env.ps1')
  Write-Host ''
}

& $nodePath server.js *>> $logPath
$exitCode = $LASTEXITCODE
"exited $exitCode $(Get-Date -Format o)" | Add-Content -Encoding UTF8 -LiteralPath $logPath
Write-Host ''
Write-Host "LIBCON API server stopped. Exit code: $exitCode"
Write-Host "Log file: $logPath"
Write-Host ''
Read-Host 'Press Enter to close this window'
