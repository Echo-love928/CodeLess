param([Parameter(Mandatory)][string]$Mode,[Parameter(Mandatory)][string]$Output,[string]$SourcePath)
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$Output=[IO.Path]::GetFullPath($Output)
$allowed=(Join-Path $repository '.local-data/d10-a')+[IO.Path]::DirectorySeparatorChar
if(-not $Output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture output escaped task directory'}
New-Item -ItemType Directory -Path $Output -Force|Out-Null
$captureId=[guid]::NewGuid().ToString()
$root=Join-Path $repository ('services/api/target/preview-platform-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path (Join-Path $root 'evidence/ingress') -Force|Out-Null
[IO.File]::WriteAllText((Join-Path $root 'evidence/ingress/compose.env'),'explicit isolated fixture, never sent to Docker')
$grandchild=Join-Path $Output 'grandchild.ps1'
[IO.File]::WriteAllText($grandchild,'[Threading.Thread]::Sleep(30000)')
$literal={param($s) "'"+$s.Replace("'","''")+"'"}
if(-not $SourcePath){$SourcePath=Join-Path $repository 'tests/agent/repair/capture-platform-network.ps1'}
$source=Get-Content -Raw -LiteralPath $SourcePath
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Source parse failed'}
$childBlock=$ast.Find({param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Clauses[0].Item1.Extent.Text -eq '$Child'},$true)
if(-not $childBlock){throw 'Child boundary missing'}
$childFixture=@'
if ($Child) {
    $project='codeless-preview-test-11111111-1111-1111-1111-111111111111'
    $owner=@{captureId=FIXTURE_CAPTURE_ID;project=$project;root=FIXTURE_ROOT;envFile=(Join-Path FIXTURE_ROOT 'evidence/ingress/compose.env')}
    if('FIXTURE_MODE' -eq 'invalid-owner'){$owner.captureId='22222222-2222-2222-2222-222222222222'}
    if('FIXTURE_MODE' -ne 'missing-owner'){$owner|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output ('capture-owner-'+FIXTURE_CAPTURE_ID+'.json')) -Encoding utf8}
    $grand=$null
    if('FIXTURE_MODE' -notin @('child-success','child-nonzero','both-fail','cleanup-throws','lifecycle-write-error')){
        $info=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path);$info.UseShellExecute=$false;$info.CreateNoWindow=$true
        foreach($a in @('-NoProfile','-File',FIXTURE_GRANDCHILD)){$info.ArgumentList.Add($a)}
        $grand=[Diagnostics.Process]::Start($info)
    }
    @{child=$PID;grandchild=$(if($grand){$grand.Id}else{$null})}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'started.json') -Encoding utf8
    if('FIXTURE_MODE' -eq 'child-success'){exit 0}
    if('FIXTURE_MODE' -eq 'orphan-zero'){exit 0}
    if('FIXTURE_MODE' -in @('child-nonzero','orphan-nonzero','both-fail','cleanup-throws','lifecycle-write-error')){exit 7}
    [Threading.Thread]::Sleep(30000)
    exit 0
}
'@
$childFixture=$childFixture.Replace('FIXTURE_CAPTURE_ID',(& $literal $captureId)).Replace('FIXTURE_ROOT',(& $literal $root)).Replace('FIXTURE_GRANDCHILD',(& $literal $grandchild)).Replace('FIXTURE_MODE',$Mode)
$source=$source.Substring(0,$childBlock.Extent.StartOffset)+$childFixture+$source.Substring($childBlock.Extent.EndOffset)
$repoAst=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
$repoAssignment=$repoAst.Find({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$repository'},$true)
$source=$source.Substring(0,$repoAssignment.Extent.StartOffset)+'$repository = '+(& $literal $repository)+$source.Substring($repoAssignment.Extent.EndOffset)
$source=$source.Replace("`$ErrorActionPreference = 'Stop'","`$ErrorActionPreference = 'Stop'`n`$CaptureId = "+(& $literal $captureId))
$stub=@'
function Invoke-Bounded([string]$Command,[string[]]$Arguments,[int]$TimeoutMs=5000) {
    if($Command -ne 'docker'){return @{exitCode=0;state='OBSERVED';text=''}}
    if($Arguments -contains 'down'){
        [IO.File]::AppendAllText((Join-Path $output 'down-calls.log'),($Arguments -join '|')+"`n")
        if('FIXTURE_MODE' -eq 'cleanup-throws'){throw [IO.IOException]::new('Controlled cleanup error')}
        return @{exitCode=$(if('FIXTURE_MODE' -in @('cleanup-nonzero','both-fail')){8}else{0});state='OBSERVED';text=''}
    }
    if('FIXTURE_MODE' -eq 'truncated-query' -and ($Arguments -contains 'ps' -or $Arguments -contains 'network')){return @{exitCode=0;state='TRUNCATED';text=''}}
    return @{exitCode=0;state='OBSERVED';text=''}
}
'@
$source=$source.Replace('$started = [DateTime]::UtcNow',$stub.Replace('FIXTURE_MODE',$Mode)+"`n"+'$started = [DateTime]::UtcNow')
if($Mode -in @('timeout','truncated-query','cleanup-nonzero','invalid-owner','missing-owner')){$source=$source.Replace('.TotalSeconds -lt 600','.TotalSeconds -lt 3')}
$tick=@'
if(Test-Path -LiteralPath (Join-Path $output 'started.json')) {
    if('FIXTURE_MODE' -eq 'parent-error'){throw [InvalidOperationException]::new('Controlled parent error')}
    if('FIXTURE_MODE' -eq 'cancel-error'){throw [OperationCanceledException]::new('Controlled cancellation')}
}
[Threading.Thread]::Sleep(50)
'@
$source=$source.Replace('Start-Sleep -Milliseconds 1000',$tick.Replace('FIXTURE_MODE',$Mode))
if($Mode -eq 'start-gap'){
    $gap=@'
[void]$childJob.Start($childInfo)
$childProcess=$childJob.Process
@{child=$childProcess.Id;grandchild=$null}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'started.json') -Encoding utf8
throw [InvalidOperationException]::new('Controlled stop before started flag')
'@
    if($source.Contains('[void]$childJob.Start($childInfo)')){$source=$source.Replace('[void]$childJob.Start($childInfo)',$gap)}
    else{$source=$source.Replace('[void]$childProcess.Start()',$gap.Replace('[void]$childJob.Start($childInfo)', '[void]$childProcess.Start()').Replace('$childProcess=$childJob.Process',''))}
}
if($Mode -eq 'report-write-error'){New-Item -ItemType Directory -Path (Join-Path $Output 'platform-network-observed.json')|Out-Null;$source=$source.Replace('.TotalSeconds -lt 600','.TotalSeconds -lt 3')}
if($Mode -eq 'lifecycle-write-error'){New-Item -ItemType Directory -Path (Join-Path $Output 'collector-lifecycle.json')|Out-Null}
$copy=Join-Path $Output 'collector.ps1';[IO.File]::WriteAllText($copy,$source)
$module=Join-Path $repository 'tests/agent/repair/collector-lifecycle.ps1'
if(Test-Path -LiteralPath $module){Copy-Item -LiteralPath $module -Destination (Join-Path $Output 'collector-lifecycle.ps1')}
Copy-Item -LiteralPath (Join-Path $repository 'tests/agent/repair/collector-job.cs') -Destination (Join-Path $Output 'collector-job.cs')
$parent=$null;$pipeline=$null;$async=$null;$parentExit=$null;$pipelineState=$null;$pids=$null
$relativeOutput=[IO.Path]::GetRelativePath($repository,$Output)
$alive={param($id) if($null -eq $id){return $false};try{$p=[Diagnostics.Process]::GetProcessById([int]$id);$live=-not $p.HasExited;$p.Dispose();return $live}catch{return $false}}
try {
    if($Mode -eq 'pipeline-stop'){
        $pipeline=[Management.Automation.PowerShell]::Create()
        [void]$pipeline.AddCommand($copy).AddParameter('LogDirectory',$relativeOutput)
        $async=$pipeline.BeginInvoke()
    }else{
        $info=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path);$info.UseShellExecute=$false;$info.CreateNoWindow=$true
        $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        foreach($a in @('-NoProfile','-File',$copy,'-LogDirectory',$relativeOutput)){$info.ArgumentList.Add($a)}
        $parent=[Diagnostics.Process]::Start($info)
        $stdout=$parent.StandardOutput.ReadToEndAsync();$stderr=$parent.StandardError.ReadToEndAsync()
    }
    $until=[DateTime]::UtcNow.AddSeconds(8)
    while(-not(Test-Path -LiteralPath (Join-Path $Output 'started.json')) -and [DateTime]::UtcNow -lt $until){[Threading.Thread]::Sleep(20)}
    if(-not(Test-Path -LiteralPath (Join-Path $Output 'started.json'))){throw 'Fixture child did not start'}
    $pids=Get-Content -Raw -LiteralPath (Join-Path $Output 'started.json')|ConvertFrom-Json
    if($pipeline){$pipeline.Stop();$pipelineState=[string]$pipeline.InvocationStateInfo.State;$parentExited=$async.IsCompleted}
    else {$parentExited=$parent.WaitForExit(10000);if($parentExited){$parentExit=$parent.ExitCode}}
    $lifecycle=$null
    if(Test-Path -LiteralPath (Join-Path $Output 'collector-lifecycle.json') -PathType Leaf){$lifecycle=Get-Content -Raw -LiteralPath (Join-Path $Output 'collector-lifecycle.json')|ConvertFrom-Json}
    $down=Join-Path $Output 'down-calls.log';$calls=$(if(Test-Path -LiteralPath $down){@(Get-Content -LiteralPath $down).Count}else{0})
    @{mode=$Mode;fixture=$true;realWindowsProcesses=$true;dockerStub=$true;modelCalls=0;parentExited=$parentExited;parentExit=$parentExit;pipelineState=$pipelineState;
      childAlive=(& $alive $pids.child);grandchildAlive=(& $alive $pids.grandchild);downCalls=$calls;lifecycle=$lifecycle}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $Output 'observed.json') -Encoding utf8
} finally {
    # Fixture cleanup only: never target an API process or Docker project. Reports capture state before this fallback.
    if($pids){foreach($id in @($pids.child,$pids.grandchild)){if(& $alive $id){$p=[Diagnostics.Process]::GetProcessById([int]$id);$p.Kill($true);[void]$p.WaitForExit(2000);$p.Dispose()}}}
    if($parent){if(-not $parent.HasExited){$parent.Kill($true);[void]$parent.WaitForExit(2000)};$parent.Dispose()}
    if($pipeline){$pipeline.Dispose()}
}
