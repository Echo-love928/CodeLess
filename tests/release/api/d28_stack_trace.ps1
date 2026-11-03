param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$taskPrivate=Join-Path $taskRoot 'tests/release/api/.private/d28-followup'
$taskOutput=[IO.Path]::GetFullPath($Output)
if(-not $taskOutput.StartsWith($taskPrivate+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Require task-private trace output'}
if(Test-Path -LiteralPath $taskOutput) {throw 'Refuse trace overwrite'}
$taskXperf=(Get-Command xperf.exe -ErrorAction Stop).Source
[IO.Directory]::CreateDirectory($taskOutput)|Out-Null
$taskSession='CodeLess-D28-Stack-'+[Guid]::NewGuid().ToString('N')
$taskEtl=Join-Path $taskOutput 'file-stacks.etl'
$taskReceipt=Join-Path $taskOutput 'receipt.json'
$taskReport=@{task='D28-A-followup';session=$taskSession;startedAt=[DateTimeOffset]::UtcNow.ToString('o');maximumMiB=128;fileContentsCaptured=$false;stackCaptureRequested=$true;kernelRegistryChanged=$false;status='STARTING'}
function Save-TaskTrace {$taskReport|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $taskReceipt -Encoding utf8}
Save-TaskTrace
$taskStarted=$false
try {
  # Named USER provider session only; never the implicit global kernel logger.
  # Stack is EnableTraceEx2 EVENT_ENABLE_PROPERTY_STACK_TRACE, not a driver/registry change.
  & $taskXperf -start $taskSession -on 'edd08927-9cc4-4e65-b970-c2560fb5c289:0x18f0:4:stack' -f $taskEtl -MaxFile 128 -FileMode Circular -BufferSize 64 -MinBuffers 16 -MaxBuffers 64 *> (Join-Path $taskOutput 'start.log')
  $taskReport.startExitCode=$LASTEXITCODE
  if($LASTEXITCODE -ne 0){throw 'Trace start failed'}
  $taskStarted=$true;$taskReport.status='CAPTURING';Save-TaskTrace
  [IO.File]::WriteAllText((Join-Path $taskOutput 'ready'),'ready')
  $taskDeadline=[DateTime]::UtcNow.AddMinutes(7)
  while(-not(Test-Path -LiteralPath (Join-Path $taskOutput 'done')) -and [DateTime]::UtcNow -lt $taskDeadline){Start-Sleep -Milliseconds 500}
  $taskReport.stopReason=if(Test-Path -LiteralPath (Join-Path $taskOutput 'done')){'Owned focused command ended'}else{'Seven-minute safety deadline'}
}catch {
  $taskReport.status='FAILED';$taskReport.errorType=$_.Exception.GetType().Name
}finally {
  if($taskStarted){
    & $taskXperf -stop $taskSession *> (Join-Path $taskOutput 'stop.log')
    $taskReport.stopExitCode=$LASTEXITCODE
    if($LASTEXITCODE -eq 0 -and $taskReport.status -ne 'FAILED'){$taskReport.status='CAPTURED_PENDING_ANALYSIS'}
    if($LASTEXITCODE -ne 0){$taskReport.status='STOP_FAILED_UNCONFIRMED'}
  }
  if(Test-Path -LiteralPath $taskEtl){$taskReport.etlBytes=(Get-Item -LiteralPath $taskEtl).Length;$taskReport.etlSha256=(Get-FileHash -LiteralPath $taskEtl -Algorithm SHA256).Hash.ToLower();if($taskReport.etlBytes -gt 128MB){$taskReport.status='TRACE_SIZE_LIMIT_EXCEEDED'}}
  $taskReport.finishedAt=[DateTimeOffset]::UtcNow.ToString('o');Save-TaskTrace
}
