param([string]$LogDirectory='.local-data/d10-a/collector-real-interrupt')
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$output=[IO.Path]::GetFullPath((Join-Path $repository $LogDirectory))
$allowed=(Join-Path $repository '.local-data/d10-a')+[IO.Path]::DirectorySeparatorChar
if(-not $output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Output outside private task directory'}
New-Item -ItemType Directory -Path $output -Force|Out-Null
$source=Get-Content -Raw -LiteralPath (Join-Path $repository 'tests/agent/repair/capture-platform-network.ps1')
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
$assignment=$ast.Find({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$repository'},$true)
$source=$source.Substring(0,$assignment.Extent.StartOffset)+"`$repository = '"+$repository.Replace("'","''")+"'"+$source.Substring($assignment.Extent.EndOffset)
$fault=@'
$witness=Join-Path $output ('capture-owner-'+$CaptureId+'.json')
if(Test-Path -LiteralPath $witness){
    $owner=Get-Content -Raw -LiteralPath $witness|ConvertFrom-Json
    if($owner.captureId -ceq $CaptureId -and $owner.project -cmatch '^codeless-preview-test-[a-f0-9-]{36}$'){
        $query=Invoke-Bounded 'docker' @('ps','--filter',('label=com.docker.compose.project='+$owner.project),'--format','{{.ID}}')
        if($query.exitCode -eq 0 -and $query.text.Trim() -cmatch '^[a-f0-9]{12}$'){
            [IO.File]::WriteAllText((Join-Path $output 'fault-injected.json'),(@{captureId=$CaptureId;project=$owner.project;realIngressObserved=$true;queryExitCode=$query.exitCode;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
            throw [InvalidOperationException]::new('Controlled parent failure with owned real ingress alive')
        }
    }
}
Start-Sleep -Milliseconds 1000
'@
if([regex]::Matches($source,[regex]::Escape('Start-Sleep -Milliseconds 1000')).Count -ne 1){throw 'Original parent tick boundary changed'}
$source=$source.Replace('Start-Sleep -Milliseconds 1000',$fault)
$copy=Join-Path $output 'collector.ps1';[IO.File]::WriteAllText($copy,$source)
Copy-Item -LiteralPath (Join-Path $repository 'tests/agent/repair/collector-lifecycle.ps1') -Destination (Join-Path $output 'collector-lifecycle.ps1')
& (Get-Process -Id $PID).Path -NoProfile -File $copy -LogDirectory $LogDirectory *> (Join-Path $output 'controlled-parent.log')
$exitCode=$LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $output 'controlled-parent.exit'),[string]$exitCode)
if($exitCode -ne 1 -or -not(Test-Path -LiteralPath (Join-Path $output 'fault-injected.json'))){throw 'Expected real parent failure was not observed'}
$lifecycle=Get-Content -Raw -LiteralPath (Join-Path $output 'collector-lifecycle.json')|ConvertFrom-Json
if($lifecycle.primaryExceptionType -ne 'InvalidOperationException' -or $lifecycle.process.terminated -ne $true -or $lifecycle.resources.downExitCode -ne 0 -or
    $lifecycle.resources.containers.queryExitCode -ne 0 -or $lifecycle.resources.containers.remaining -ne 0 -or
    $lifecycle.resources.networks.queryExitCode -ne 0 -or $lifecycle.resources.networks.remaining -ne 0){throw 'Real stop/resource cleanup assertion failed'}
$report=@{fixture=$true;realDocker=$true;modelProvider='deterministic-mock';modelQualityEvidence=$false;realModelCalls=0;originalParentExitCode=$exitCode;
    completePlatformAcceptancePassed=$false;fault=(Get-Content -Raw -LiteralPath (Join-Path $output 'fault-injected.json')|ConvertFrom-Json);lifecycle=$lifecycle}
[IO.File]::WriteAllText((Join-Path $output 'real-interrupt-acceptance.json'),($report|ConvertTo-Json -Depth 12))
'Controlled parent exit1 preserved; owned process stopped; actual compose down0/container0/network0.'
