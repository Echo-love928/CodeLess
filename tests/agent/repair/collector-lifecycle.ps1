# Test-private lifecycle helpers. The fixed child writes its project witness before Docker compose up.
function New-CollectorJob {
    if(-not ('CollectorJob' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'collector-job.cs')}
    return [CollectorJob]::new()
}
function Stop-CollectorChild([Diagnostics.Process]$Process,[bool]$Started,$Job=$null) {
    $result=[ordered]@{started=$Started;stopRequested=$false;terminated=$null;nativeExitCode=$null;state='NOT_STARTED'}
    if($null -eq $Process){return $result}
    # A pipeline stop can land after native Start() but before the caller records its bool.
    if(-not $Started){try{[void]$Process.Id;$Started=$true;$result.started=$true}catch{return $result}}
    try {
        # A root's exit says nothing about its descendants. The suspended-start job retains that ownership.
        if($null -eq $Job){$result.state='TREE_OWNERSHIP_UNAVAILABLE';return $result}
        $result.activeBefore=$Job.ActiveProcesses
        $result.stopRequested=$result.activeBefore -gt 0
        $result.terminated=$Job.Stop(5000)
        $result.remainingProcesses=$Job.ActiveProcesses
        if($result.terminated){$result.nativeExitCode=$Process.ExitCode;$result.state='EXITED'}else{$result.state='STOP_WAIT_TIMEOUT'}
    }catch{$result.state='STOP_UNAVAILABLE'}
    return $result
}

function Read-CollectorOwner([string]$Repository,[string]$Output,[string]$CaptureId,[switch]$ForSampling) {
    $witness=Join-Path $Output ('capture-owner-'+$CaptureId+'.json')
    if(-not(Test-Path -LiteralPath $witness)){return @{state='NOT_CREATED';owner=$null}}
    try {
        $item=Get-Item -LiteralPath $witness -Force
        if($item.Length -gt 4096 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid witness'}
        $owner=Get-Content -Raw -LiteralPath $witness|ConvertFrom-Json
        $target=[IO.Path]::GetFullPath((Join-Path $Repository 'services/api/target'))+[IO.Path]::DirectorySeparatorChar
        $root=[IO.Path]::GetFullPath($owner.root)
        $envFile=Join-Path $root 'evidence/ingress/compose.env'
        if($owner.captureId -cne $CaptureId -or $owner.project -cnotmatch '^codeless-preview-test-[a-f0-9-]{36}$' -or
            -not $root.StartsWith($target,[StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($root) -cnotmatch '^preview-platform-[a-f0-9-]{36}$' -or
            [IO.Path]::GetFullPath($owner.envFile) -cne [IO.Path]::GetFullPath($envFile)){throw 'Invalid owner'}
        # Reject links in every existing component below the private target, including envFile itself.
        $current=$envFile
        while($current.StartsWith($target,[StringComparison]::OrdinalIgnoreCase)){
            if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked owner path'}
            $current=[IO.Path]::GetDirectoryName($current)
        }
        if($ForSampling){
            $config=Join-Path $root 'evidence/ingress/nginx.conf'
            if((Get-Item -LiteralPath $config -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked config'}
            $ports=@([regex]::Matches((Get-Content -Raw -LiteralPath $config),'(?m)^\s*proxy_pass http://host\.docker\.internal:(\d{1,5});\s*$'))
            if(($owner.apiPort -isnot [long] -and $owner.apiPort -isnot [int]) -or $owner.apiPort -lt 1 -or $owner.apiPort -gt 65535 -or
                $ports.Count -ne 1 -or [int]$ports[0].Groups[1].Value -ne $owner.apiPort){throw 'Port ownership mismatch'}
        }
        return @{state='OWNED';owner=$owner}
    }catch{return @{state='OWNERSHIP_REJECTED';owner=$null}}
}
function Clear-CollectorResources([string]$Repository,[string]$Output,[string]$CaptureId) {
    $result=[ordered]@{state='NOT_CREATED';downAttempted=$false;downExitCode=$null;containers=$null;networks=$null}
    $binding=Read-CollectorOwner $Repository $Output $CaptureId
    if($binding.state -ne 'OWNED'){$result.state=$binding.state;return $result}
    $owner=$binding.owner;$envFile=$owner.envFile;$result.project=$owner.project
    # Cleanup is not conditional on successful diagnostic capture, query or report persistence.
    $result.downAttempted=$true
    try {
        $down=Invoke-Bounded 'docker' @('compose','--project-name',$owner.project,'--file',(Join-Path $Repository 'infra/preview/compose.yml'),'--env-file',$envFile,'down','--remove-orphans') 60000
        $result.downExitCode=$down.exitCode
        $result.state=$(if($down.exitCode -eq 0){'DOWN_COMPLETED'}else{'DOWN_FAILED_OR_UNKNOWN'})
    }catch{$result.state='DOWN_UNAVAILABLE'}
    foreach($kind in @('containers','networks')){
        try {
            $arguments=$(if($kind -eq 'containers'){@('ps','--all','--filter',('label=com.docker.compose.project='+$owner.project),'--format','{{.ID}}')}else{@('network','ls','--filter',('label=com.docker.compose.project='+$owner.project),'--format','{{.ID}}')})
            $query=Invoke-Bounded 'docker' $arguments
            $ids=@($query.text -split '\r?\n'|Where-Object{$_})
            $valid=@($ids|Where-Object{$_ -cnotmatch '^[a-f0-9]{12,64}$'}).Count -eq 0
            $result[$kind]=@{queryExitCode=$query.exitCode;state=$query.state;remaining=$(if($query.state -eq 'OBSERVED' -and $query.exitCode -eq 0 -and $valid){$ids.Count}else{$null})}
        }catch{$result[$kind]=@{queryExitCode=$null;state='UNAVAILABLE';remaining=$null}}
    }
    return $result
}
