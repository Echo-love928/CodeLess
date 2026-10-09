# Test-private lifecycle helpers. The fixed child writes its project witness before Docker compose up.
function Stop-CollectorChild([Diagnostics.Process]$Process,[bool]$Started) {
    $result=[ordered]@{started=$Started;stopRequested=$false;terminated=$null;nativeExitCode=$null;state='NOT_STARTED'}
    # A pipeline stop can land after native Start() but before the caller records its bool.
    if(-not $Started){try{[void]$Process.Id;$Started=$true;$result.started=$true}catch{return $result}}
    try {
        if(-not $Process.HasExited){$result.stopRequested=$true;$Process.Kill($true)}
        $result.terminated=$Process.WaitForExit(5000)
        if($result.terminated){$result.nativeExitCode=$Process.ExitCode;$result.state='EXITED'}else{$result.state='STOP_WAIT_TIMEOUT'}
    }catch{$result.state='STOP_UNAVAILABLE'}
    return $result
}

function Clear-CollectorResources([string]$Repository,[string]$Output,[string]$CaptureId) {
    $result=[ordered]@{state='NOT_CREATED';downAttempted=$false;downExitCode=$null;containers=$null;networks=$null}
    $witness=Join-Path $Output ('capture-owner-'+$CaptureId+'.json')
    if(-not(Test-Path -LiteralPath $witness)){return $result}
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
        $result.project=$owner.project
    }catch{$result.state='OWNERSHIP_REJECTED';return $result}
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
            $result[$kind]=@{queryExitCode=$query.exitCode;state=$query.state;remaining=$(if($query.exitCode -eq 0 -and $valid){$ids.Count}else{$null})}
        }catch{$result[$kind]=@{queryExitCode=$null;state='UNAVAILABLE';remaining=$null}}
    }
    return $result
}
