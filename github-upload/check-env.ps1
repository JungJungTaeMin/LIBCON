Set-Location -LiteralPath $PSScriptRoot

$envPath = Join-Path $PSScriptRoot '.env'
$examplePath = Join-Path $PSScriptRoot '.env.example'

if (!(Test-Path -LiteralPath $envPath)) {
  if (Test-Path -LiteralPath $examplePath) {
    Copy-Item -LiteralPath $examplePath -Destination $envPath
    Write-Host '.env file was created from .env.example.'
  } else {
    Write-Host '.env file is missing.'
    exit 1
  }
}

$values = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if (!$line -or $line.StartsWith('#')) {
    return
  }

  $index = $line.IndexOf('=')
  if ($index -lt 0) {
    return
  }

  $key = $line.Substring(0, $index).Trim()
  $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
  $values[$key] = $value
}

$required = @('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'KAKAO_REST_API_KEY')
$optional = @('KAKAO_JS_API_KEY', 'LIBRARY_API_KEY', 'GOOGLE_REDIRECT_URI')
$missingRequired = @()
$invalidRequired = @()

Write-Host ''
Write-Host 'LIBCON local API key check'
Write-Host '--------------------------'

foreach ($key in $required) {
  if (!$values[$key]) {
    Write-Host "[MISSING] $key"
    $missingRequired += $key
  } elseif ($key -eq 'GOOGLE_CLIENT_ID' -and $values[$key] -notmatch '^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$') {
    Write-Host "[INVALID] $key (must end with .apps.googleusercontent.com)"
    $invalidRequired += $key
  } else {
    Write-Host "[OK]      $key"
  }
}

foreach ($key in $optional) {
  if ($values[$key]) {
    Write-Host "[OK]      $key"
  } else {
    Write-Host "[OPTION]  $key"
  }
}

Write-Host ''
if ($missingRequired.Count -gt 0 -or $invalidRequired.Count -gt 0) {
  Write-Host 'Missing or invalid required keys must be corrected in .env before Google login and library search work.'
} else {
  Write-Host 'Required keys are filled. Restart the LIBCON server after changing .env.'
}
