# Windows-вариант scripts/reset-demo.sh (PowerShell):  .\scripts\reset-demo.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path .env)) { throw "Нет файла .env — создайте его из .env.example" }
Get-Content .env | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), "Process")
}
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

docker compose down -v --remove-orphans
docker compose up -d --build gateway mailpit

foreach ($url in "http://localhost:8001/docs", "http://localhost:8002/docs", "http://localhost:8004/docs", "http://localhost:8080/contest-types", "http://localhost:8025/") {
  $ok = $false
  for ($i = 0; $i -lt 90 -and -not $ok; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3 | Out-Null; $ok = $true } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $ok) { throw "Не поднялся: $url" }
  Write-Host "готов: $url"
}

py -3 seed.py
Write-Host "Готово. Сайт: http://localhost:5173, почта: http://localhost:8025"
