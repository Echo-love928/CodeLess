param([Parameter(Mandatory)][string]$Manifest,[switch]$Child)
$ErrorActionPreference='Stop'
$spec=Get-Content -Raw -LiteralPath $Manifest|ConvertFrom-Json
if($Child){
    Set-Location -LiteralPath $spec.cwd
    $arguments=@($spec.command | Select-Object -Skip 1)
    & ($spec.command[0]) @arguments *> $spec.log
    exit $LASTEXITCODE
}
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Add-Type -Path (Join-Path $repository 'tests/agent/repair/collector-job.cs')
$job=[CollectorJob]::new();$process=$null;$stopped=$false;$native=$null;$complete=$false
try{
    $info=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$spec.cwd
    foreach($a in @('-NoProfile','-File',$PSCommandPath,'-Manifest',$Manifest,'-Child')){$info.ArgumentList.Add($a)}
    $job.Start($info);$process=$job.Process
    while(-not $process.HasExited){
        if(Test-Path -LiteralPath $spec.stop){$stopped=$true;break}
        [Threading.Thread]::Sleep(20)
    }
    if(-not $stopped){$native=$process.ExitCode}
}finally{
    try{
        $complete=$job.Stop(5000)
        [IO.File]::WriteAllText($spec.result,(@{nonce=$spec.nonce;state='WINDOWS_JOB';nativeExitCode=$native;stopRequested=$stopped;remaining=$job.ActiveProcesses;complete=$complete}|ConvertTo-Json))
    }finally{$job.Dispose();if($process){$process.Dispose()}}
}
if(-not $complete -or $stopped -or $null -eq $native){exit 1}
exit $native
