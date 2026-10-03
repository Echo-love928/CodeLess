param([string]$Jar = 'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar',
      [string]$Evidence = '.local-data/d07-a/evidence/real-model')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Jar)) { throw 'Build the real API jar using pnpm verify:api first.' }
if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME)) { throw 'JAVA_HOME must select Java 21.' }
& "$env:JAVA_HOME/bin/java.exe" '-Dloader.main=dev.codeless.api.model.PlanAcceptanceCli' '-cp' $Jar 'org.springframework.boot.loader.launch.PropertiesLauncher' $Evidence
exit $LASTEXITCODE
