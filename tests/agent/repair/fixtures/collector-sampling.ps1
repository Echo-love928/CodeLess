param([ValidateSet('absent','wrong-id','wrong-port','owned-with-foreign','foreign-project-result','truncated-list','truncated-cleanup')][string]$Mode,[string]$Output,[string]$SourcePath)
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$Output=[IO.Path]::GetFullPath($Output)
if(-not $Output.StartsWith((Join-Path $repository '.local-data/d10-a')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Output outside private fixture directory'}
New-Item -ItemType Directory -Path $Output -Force|Out-Null
$ownedRoot=Join-Path $repository ('services/api/target/preview-platform-'+[guid]::NewGuid())
$foreignRoot=Join-Path $repository ('services/api/target/preview-platform-'+[guid]::NewGuid())
$literal={param($value) "'"+$value.Replace("'","''")+"'"}
if(-not $SourcePath){$SourcePath=Join-Path $repository 'tests/agent/repair/capture-platform-network.ps1'}
$source=Get-Content -Raw -LiteralPath $SourcePath;$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
$child=$ast.Find({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and $n.Clauses[0].Item1.Extent.Text -eq '$Child'},$true)
$body=@'
if($Child){
    function FixtureRoot($root,$port){New-Item -ItemType Directory -Path (Join-Path $root 'evidence/ingress') -Force|Out-Null;[IO.File]::WriteAllText((Join-Path $root 'evidence/ingress/compose.env'),'explicit fake, never sent to Docker');[IO.File]::WriteAllText((Join-Path $root 'evidence/ingress/nginx.conf'),"proxy_pass http://host.docker.internal:$port;`n")}
    if('FIXTURE_MODE' -eq 'absent'){FixtureRoot FOREIGN_ROOT 45678}
    else{
        FixtureRoot OWNED_ROOT 12345
        if('FIXTURE_MODE' -eq 'owned-with-foreign'){FixtureRoot FOREIGN_ROOT 45678}
        $owner=@{captureId=$CaptureId;root=OWNED_ROOT;project='codeless-preview-test-11111111-1111-1111-1111-111111111111';envFile=(Join-Path OWNED_ROOT 'evidence/ingress/compose.env');apiPort=12345}
        if('FIXTURE_MODE' -eq 'wrong-id'){$owner.captureId='22222222-2222-2222-2222-222222222222'}
        if('FIXTURE_MODE' -eq 'wrong-port'){$owner.apiPort=45678}
        [IO.File]::WriteAllText((Join-Path $output ('capture-owner-'+$CaptureId+'.json')),($owner|ConvertTo-Json))
    }
    [IO.File]::WriteAllText((Join-Path $output 'child-pid.txt'),[string]$PID)
    [Threading.Thread]::Sleep(5000);exit 0
}
'@
$body=$body.Replace('FIXTURE_MODE',$Mode).Replace('OWNED_ROOT',(& $literal $ownedRoot)).Replace('FOREIGN_ROOT',(& $literal $foreignRoot))
$source=$source.Substring(0,$child.Extent.StartOffset)+$body+$source.Substring($child.Extent.EndOffset)
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
$assignment=$ast.Find({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$repository'},$true)
$source=$source.Substring(0,$assignment.Extent.StartOffset)+'$repository = '+(& $literal $repository)+$source.Substring($assignment.Extent.EndOffset)
$stub=@'
function Invoke-Bounded([string]$Command,[string[]]$Arguments,[int]$TimeoutMs=5000){
    if($Command -ne 'docker'){return @{exitCode=0;state='OBSERVED';text=''}}
    [IO.File]::AppendAllText((Join-Path $output 'tool-calls.log'),(($Arguments|ConvertTo-Json -Compress)+"`n"))
    if('FIXTURE_MODE' -eq 'truncated-cleanup' -and ($Arguments -contains '--all' -or $Arguments -contains 'network')){return @{exitCode=0;state='TRUNCATED';text=''}}
    if($Arguments -contains 'down' -or $Arguments -contains '--all' -or $Arguments -contains 'network'){return @{exitCode=0;state='OBSERVED';text=''}}
    if($Arguments -contains 'ps'){
        if('FIXTURE_MODE' -eq 'truncated-list'){return @{exitCode=0;state='TRUNCATED';text=''}}
        $project=$(if('FIXTURE_MODE' -in @('absent','foreign-project-result')){'codeless-preview-test-22222222-2222-2222-2222-222222222222'}else{'codeless-preview-test-11111111-1111-1111-1111-111111111111'})
        return @{exitCode=0;state='OBSERVED';text=('abcdef123456|'+$project)}
    }
    if($Arguments -contains 'inspect'){return @{exitCode=0;state='OBSERVED';text=(Join-Path FIXTURE_ROOT 'evidence/ingress/nginx.conf')}}
    if($Arguments -contains '/etc/hosts'){return @{exitCode=0;state='OBSERVED';text='127.0.0.1 host.docker.internal'}}
    return @{exitCode=0;state='OBSERVED';text=''}
}
'@
$fixtureRoot=$(if($Mode -eq 'absent'){$foreignRoot}else{$ownedRoot})
$source=$source.Replace('$started = [DateTime]::UtcNow',$stub.Replace('FIXTURE_MODE',$Mode).Replace('FIXTURE_ROOT',(& $literal $fixtureRoot))+"`n"+'$started = [DateTime]::UtcNow')
$copy=Join-Path $Output 'collector.ps1';[IO.File]::WriteAllText($copy,$source)
Copy-Item -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($SourcePath)) 'collector-lifecycle.ps1') -Destination (Join-Path $Output 'collector-lifecycle.ps1')
Copy-Item -LiteralPath (Join-Path $repository 'tests/agent/repair/collector-job.cs') -Destination (Join-Path $Output 'collector-job.cs')
$info=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path);$info.UseShellExecute=$false;$info.CreateNoWindow=$true
foreach($a in @('-NoProfile','-File',$copy,'-LogDirectory',[IO.Path]::GetRelativePath($repository,$Output))){$info.ArgumentList.Add($a)}
$parent=[Diagnostics.Process]::Start($info)
try{
    if(-not $parent.WaitForExit(15000)){throw 'Sampling fixture parent did not finish'}
    $report=Get-Content -Raw -LiteralPath (Join-Path $Output 'platform-network-observed.json')|ConvertFrom-Json
    $calls=@();$callFile=Join-Path $Output 'tool-calls.log'
    if(Test-Path -LiteralPath $callFile){foreach($line in Get-Content -LiteralPath $callFile){$calls+=,@($line|ConvertFrom-Json)}}
    $ports=@($calls|Where-Object{$_ -contains 'nc'}|ForEach-Object{[int]$_[-1]})
    $lifecycle=Get-Content -Raw -LiteralPath (Join-Path $Output 'collector-lifecycle.json')|ConvertFrom-Json
    [IO.File]::WriteAllText((Join-Path $Output 'observed.json'),(@{fixture=$true;dockerStub=$true;realTcp=$false;modelCalls=0;mavenExecuted=$false;mode=$Mode;collectorExit=$parent.ExitCode;networkCaptured=$report.networkCaptured;probePorts=$ports;calls=$calls;samples=$report.samples;lifecycle=$lifecycle}|ConvertTo-Json -Depth 12))
}finally{
    if(-not $parent.HasExited){$parent.Kill($true);[void]$parent.WaitForExit(2000)};$parent.Dispose()
    $pidFile=Join-Path $Output 'child-pid.txt';if(Test-Path -LiteralPath $pidFile){try{$p=[Diagnostics.Process]::GetProcessById([int](Get-Content -LiteralPath $pidFile));if(-not $p.HasExited){$p.Kill($true);[void]$p.WaitForExit(2000)};$p.Dispose()}catch{}}
}
