@echo off
setlocal
set "MAVEN_VERSION=3.9.11"
set "MAVEN_DIST=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip"
set "MAVEN_SHA512=03e2d65d4483a3396980629f260e25cac0d8b6f7f2791e4dc20bc83f9514db8d0f05b0479e699a5f34679250c49c8e52e961262ded468a20de0be254d8207076"
if defined MAVEN_USER_HOME (set "MAVEN_CACHE=%MAVEN_USER_HOME%") else (set "MAVEN_CACHE=%USERPROFILE%\.m2")
set "MAVEN_HOME=%MAVEN_CACHE%\wrapper\dists\codeless-maven-%MAVEN_VERSION%\apache-maven-%MAVEN_VERSION%"

if not exist "%MAVEN_HOME%\bin\mvn.cmd" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$target='%MAVEN_CACHE%\wrapper\dists\codeless-maven-%MAVEN_VERSION%';" ^
    "$zip=Join-Path ([IO.Path]::GetTempPath()) ('codeless-maven-'+[guid]::NewGuid()+'.zip');" ^
    "try { Invoke-WebRequest -UseBasicParsing '%MAVEN_DIST%' -OutFile $zip; $sha=[Security.Cryptography.SHA512]::Create(); $stream=[IO.File]::OpenRead($zip); try { $actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }; if ($actual -ne '%MAVEN_SHA512%') { throw 'Maven distribution checksum mismatch' }; New-Item -ItemType Directory -Force $target | Out-Null; Expand-Archive -LiteralPath $zip -DestinationPath $target -Force } finally { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }"
  if errorlevel 1 exit /b 1
)

call "%MAVEN_HOME%\bin\mvn.cmd" %*
exit /b %ERRORLEVEL%
