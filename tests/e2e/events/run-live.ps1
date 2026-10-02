param(
  [string]$ApiJar = '.local-data/d06-b/integration/services/api/target/codeless-api-0.0.0-SNAPSHOT.jar'
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location -LiteralPath $repoRoot
$jarPath = (Resolve-Path -LiteralPath $ApiJar).Path
$containerName = 'codeless-d06-b-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$logRoot = Join-Path $repoRoot '.local-data/d06-b'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
if (Get-NetTCPConnection -LocalPort 8080,15436 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8080 or 15436 is occupied; stop the conflicting service yourself before live acceptance.' }
$apiProcess = $null
$created = $false
$resultCode = 1
$savedEnvironment = @{}
foreach ($name in @('CODELESS_DATABASE_URL','CODELESS_DATABASE_USER','CODELESS_DATABASE_PASSWORD','CODELESS_COOKIE_SECURE','CODELESS_DEMO_PASSWORD','CODELESS_ADMIN_PASSWORD','CODELESS_D06_DB_CONTAINER')) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
  # Public deterministic test credentials, confined to the disposable loopback database.
  docker run -d --name $containerName --label codeless.fixture=D06-B -p 127.0.0.1:15436:5432 `
    -e POSTGRES_USER=codeless -e POSTGRES_DB=codeless -e POSTGRES_PASSWORD=d06-b-fixture-only `
    'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create disposable database' }
  $created = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -U codeless -d codeless | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) { throw 'Database did not become ready' }
  $env:CODELESS_DATABASE_URL = 'jdbc:postgresql://127.0.0.1:15436/codeless'
  $env:CODELESS_DATABASE_USER = 'codeless'
  $env:CODELESS_DATABASE_PASSWORD = 'd06-b-fixture-only'
  $env:CODELESS_COOKIE_SECURE = 'false'
  $env:CODELESS_DEMO_PASSWORD = 'd06-b-demo-fixture-only'
  $env:CODELESS_ADMIN_PASSWORD = 'd06-b-admin-fixture-only'
  $env:CODELESS_D06_DB_CONTAINER = $containerName
  $javaPath = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java).Source }
  $apiProcess = Start-Process -FilePath $javaPath -ArgumentList @('-jar', ('"' + $jarPath + '"'), '--server.address=127.0.0.1', '--server.port=8080', '--codeless.tasks.enabled=false') `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'live-api.log') -RedirectStandardError (Join-Path $logRoot 'live-api-error.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { Invoke-WebRequest 'http://127.0.0.1:8080/api/v0/auth/csrf' -TimeoutSec 1 | Out-Null; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
  }
  if (!$ready) { throw 'API did not become ready; inspect live-api.log' }
  pnpm --filter @codeless/web exec playwright test --config ../../tests/e2e/events/playwright.live.config.ts
  $testExit = $LASTEXITCODE
  if ($testExit -ne 0) { throw "Live acceptance failed: $testExit" }
  $resultCode = 0
} catch {
  Write-Error $_ -ErrorAction Continue
} finally {
  if ($apiProcess -and !$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id }
  if ($created) {
    $label = docker inspect --format '{{index .Config.Labels "codeless.fixture"}}' $containerName
    if ($label -eq 'D06-B') { docker rm -f $containerName | Out-Null }
  }
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
exit $resultCode
