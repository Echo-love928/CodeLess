param([switch]$Child, [string]$LogDirectory = '.local-data/d10-a/environment-followup')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$output = [IO.Path]::GetFullPath((Join-Path $repository $LogDirectory))
$privateParent = [IO.Path]::GetFullPath((Join-Path $repository '.local-data/d10-a')) + [IO.Path]::DirectorySeparatorChar
if (-not $IsWindows -or -not $output.StartsWith($privateParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Windows diagnostic output must stay under .local-data/d10-a.'
}
Set-Location -LiteralPath $repository
New-Item -ItemType Directory -Path $output -Force | Out-Null
if ($Child) {
    # Only the named mock fixture; no Real*IT, provider key, extra CSRF request or changed browser action.
    . (Join-Path $repository '.local-data/d07-a/env.ps1')
    Remove-Item Env:CODELESS_MODEL_API_KEY,Env:CODELESS_MODEL_NAME,Env:CODELESS_M1_REAL_APPROVED,Env:CODELESS_PLAYWRIGHT_CHANNEL -ErrorAction SilentlyContinue
    $env:CODELESS_MODEL_PROVIDER = 'deterministic-mock'
    & (Join-Path $repository 'services/api/mvnw.cmd') -f services/api/pom.xml '-Dtest=ApplicationHttpDiagnosticsIT' '-DreuseForks=false' '-DforkCount=1' test *> (Join-Path $output 'platform-network-it.log')
    $result = $LASTEXITCODE
    [IO.File]::WriteAllText((Join-Path $output 'platform-network-it.exit'), [string]$result)
    exit $result
}

function Invoke-Bounded([string]$Command, [string[]]$Arguments, [int]$TimeoutMs = 5000) {
    $info = [Diagnostics.ProcessStartInfo]::new($Command)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMs)) {
            $process.Kill($true)
            [void]$process.WaitForExit(1000)
            return @{exitCode=$null;state='TIMEOUT';text=''}
        }
        # stderr/raw output never goes into the public report; parsers below keep a small allowlist.
        $raw = $stdout.GetAwaiter().GetResult()
        [void]$stderr.GetAwaiter().GetResult()
        if ($raw.Length -gt 32768) { return @{exitCode=$process.ExitCode;state='TRUNCATED';text=''} }
        return @{exitCode=$process.ExitCode;state='OBSERVED';text=$raw}
    } catch { return @{exitCode=$null;state='UNAVAILABLE';text=''} }
    finally { $process.Dispose() }
}

function Observe-Network([IO.DirectoryInfo]$Root, [int]$Port) {
    $sample = [ordered]@{at=[DateTime]::UtcNow.ToString('o');apiPort=$Port;root=$Root.Name}
    $netstat = Invoke-Bounded 'netstat.exe' @('-ano','-p','tcp')
    $netstat6 = Invoke-Bounded 'netstat.exe' @('-ano','-p','tcpv6')
    $connections = @()
    foreach ($protocol in @(@{name='tcp';result=$netstat},@{name='tcpv6';result=$netstat6})) {
        foreach ($line in ($protocol.result.text -split '\r?\n')) {
            if ($line -match '^\s*TCP\s+(\S+):(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$' -and [int]$Matches[2] -eq $Port) {
                $connections += @{protocol=$protocol.name;localAddress=$Matches[1];state=$Matches[4];pid=[int]$Matches[5]}
            }
        }
    }
    $sample.hostTcp = @{exitCode=$netstat.exitCode;state=$netstat.state;ipv6ExitCode=$netstat6.exitCode;ipv6State=$netstat6.state;connections=@($connections | Select-Object -First 64);truncated=($connections.Count -gt 64)}
    $list = Invoke-Bounded 'docker' @('ps','--filter','label=com.docker.compose.project','--format','{{.ID}}|{{.Label "com.docker.compose.project"}}')
    $container = $null
    $candidateCount = 0
    $mountQueries = @()
    foreach ($line in ($list.text -split '\r?\n')) {
        if ($line -notmatch '^([a-f0-9]{12})\|(codeless-preview-test-[a-f0-9-]{36})$') { continue }
        if (++$candidateCount -gt 8) { break }
        $candidate = $Matches[1]; $project = $Matches[2]
        $mount = Invoke-Bounded 'docker' @('inspect','--format','{{range .Mounts}}{{if eq .Destination "/etc/nginx/conf.d/default.conf"}}{{.Source}}{{end}}{{end}}',$candidate)
        $expected = (Join-Path $Root.FullName 'evidence/ingress/nginx.conf').Replace('\','/')
        $observedMount = $mount.text.Trim().Replace('\','/')
        if ($observedMount -match '^/(?:run/desktop/mnt/host|host_mnt)/([a-zA-Z])/(.*)$') { $observedMount = $Matches[1] + ':/' + $Matches[2] }
        if ($observedMount.StartsWith('//?/')) { $observedMount = $observedMount.Substring(4) }
        $matched = $mount.exitCode -eq 0 -and $observedMount.Equals($expected,[StringComparison]::OrdinalIgnoreCase)
        $safeRoot = $null
        if ($observedMount -match '(preview-platform-[a-f0-9-]{36})/evidence/ingress/nginx\.conf$') { $safeRoot = $Matches[1] }
        $mountQueries += @{exitCode=$mount.exitCode;state=$mount.state;matched=$matched;observedRoot=$safeRoot;expectedRoot=$Root.Name}
        if ($matched) {
            $container = $candidate
            $sample.project = $project
            break
        }
    }
    $sample.containerLookup = @{exitCode=$list.exitCode;state=$list.state;found=($null -ne $container);candidateLimitExceeded=($candidateCount -gt 8);mountQueries=$mountQueries}
    if ($null -eq $container) { return $sample }
    $hosts = Invoke-Bounded 'docker' @('exec',$container,'cat','/etc/hosts')
    $addresses = @()
    foreach ($line in ($hosts.text -split '\r?\n')) {
        if ($line -match '^\s*([0-9a-fA-F:.]+)\s+host\.docker\.internal(?:\s|$)') {
            $address = $null
            if ([Net.IPAddress]::TryParse($Matches[1],[ref]$address)) { $addresses += $address.ToString() }
        }
    }
    $sample.hosts = @{exitCode=$hosts.exitCode;state=$hosts.state;addresses=@($addresses | Select-Object -Unique -First 4)}
    $route = Invoke-Bounded 'docker' @('exec',$container,'cat','/proc/net/route')
    $routes = @()
    foreach ($line in ($route.text -split '\r?\n')) {
        if ($line -match '^([a-zA-Z0-9_.-]+)\s+([A-Fa-f0-9]{8})\s+([A-Fa-f0-9]{8})\s+([A-Fa-f0-9]{4})\s+\d+\s+\d+\s+\d+\s+([A-Fa-f0-9]{8})(?:\s|$)') {
            $routes += @{interface=$Matches[1];destinationHex=$Matches[2];gatewayHex=$Matches[3];flagsHex=$Matches[4];maskHex=$Matches[5]}
        }
    }
    $sample.ipv4Routes = @{exitCode=$route.exitCode;state=$route.state;entries=@($routes | Select-Object -First 16);truncated=($routes.Count -gt 16)}
    $probes = @()
    foreach ($address in @($addresses | Select-Object -Unique -First 4)) {
        $probeAt = [DateTime]::UtcNow.ToString('o')
        # TCP only, to this fixture's API port and its own ingress host mapping. No HTTP/auth/model call.
        $probe = Invoke-Bounded 'docker' @('exec',$container,'nc','-z','-w','2',$address,[string]$Port) 3500
        $probes += @{at=$probeAt;address=$address;port=$Port;exitCode=$probe.exitCode;state=$probe.state;connected=$(if($probe.exitCode -eq 0){$true}else{$null})}
    }
    $sample.tcpProbes = $probes
    return $sample
}

$started = [DateTime]::UtcNow
$shellPath = (Get-Process -Id $PID).Path
$childInfo = [Diagnostics.ProcessStartInfo]::new($shellPath)
$childInfo.UseShellExecute = $false; $childInfo.CreateNoWindow = $true
foreach ($argument in @('-NoProfile','-File',$PSCommandPath,'-Child','-LogDirectory',$LogDirectory)) { $childInfo.ArgumentList.Add($argument) }
$childProcess = [Diagnostics.Process]::new(); $childProcess.StartInfo = $childInfo
$samples = @(); $samplingErrors = @(); $lastSample = [DateTime]::MinValue; $roots = @()
try {
    [void]$childProcess.Start()
    while (-not $childProcess.HasExited -and ([DateTime]::UtcNow-$started).TotalSeconds -lt 600) {
        if ($samples.Count -lt 8 -and ([DateTime]::UtcNow-$lastSample).TotalSeconds -ge 10) {
            try {
                $roots = @(Get-ChildItem -LiteralPath (Join-Path $repository 'services/api/target') -Directory -Filter 'preview-platform-*' | Where-Object { $_.CreationTimeUtc -ge $started })
                if ($roots.Count -eq 1) {
                    $configPath = Join-Path $roots[0].FullName 'evidence/ingress/nginx.conf'
                    if (Test-Path -LiteralPath $configPath) {
                        # Port from the rendered fixture config. compose.env contains private mount paths.
                        $portLine = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*proxy_pass http://host\.docker\.internal:\d{1,5};\s*$' }
                        if (@($portLine).Count -eq 1) {
                            $port = [int]([regex]::Match($portLine,':(\d{1,5});').Groups[1].Value)
                            if ($port -gt 0 -and $port -le 65535) { $samples += Observe-Network $roots[0] $port; $lastSample=[DateTime]::UtcNow }
                        }
                    }
                }
            } catch { $samplingErrors += @{at=[DateTime]::UtcNow.ToString('o');state='UNAVAILABLE';exceptionType=$_.Exception.GetType().Name}; $lastSample=[DateTime]::UtcNow }
        }
        Start-Sleep -Milliseconds 1000
    }
    $timedOut = -not $childProcess.HasExited
    if ($timedOut) { $childProcess.Kill($true); [void]$childProcess.WaitForExit(5000) }
    $exitCode = $(if($timedOut){$null}else{$childProcess.ExitCode})
    $captured = @($samples | Where-Object { $_.containerLookup.found -and $_.hosts.addresses.Count -gt 0 -and $_.tcpProbes.Count -gt 0 }).Count -gt 0
    $report = [ordered]@{startedAt=$started.ToString('o');finishedAt=[DateTime]::UtcNow.ToString('o');modelProvider='deterministic-mock';realModelCalls=0;modelQualityEvidence=$false;mavenExitCode=$exitCode;collectorTimedOut=$timedOut;networkCaptured=$captured;samples=$samples;samplingErrors=$samplingErrors;rootCount=$roots.Count;historicalTcpRootCause='UNKNOWN';sampleLimit=8;probeTimeoutMs=3500;log='platform-network-it.log'}
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $output 'platform-network-observed.json') -Encoding utf8
    Write-Output "Maven exit=$exitCode; samples=$($samples.Count); samplingErrors=$($samplingErrors.Count); historical TCP root cause UNKNOWN."
    if ($timedOut -or -not $captured) { exit 1 }
    exit $exitCode
} finally { $childProcess.Dispose() }
