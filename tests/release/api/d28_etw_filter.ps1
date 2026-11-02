param(
  [Parameter(Mandatory=$true)][string]$Trace,
  [Parameter(Mandatory=$true)][string]$ArtifactRoot,
  [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$taskPrivate=[IO.Path]::GetFullPath((Join-Path $taskRoot 'tests/release/api/.private/d28-fix'))
$taskTrace=[IO.Path]::GetFullPath($Trace)
$taskArtifact=[IO.Path]::GetFullPath($ArtifactRoot)
$taskOutput=[IO.Path]::GetFullPath($Output)
if(-not $taskTrace.StartsWith($taskPrivate+[IO.Path]::DirectorySeparatorChar) -or
   -not $taskOutput.StartsWith($taskPrivate+[IO.Path]::DirectorySeparatorChar) -or
   -not $taskArtifact.StartsWith((Join-Path $taskRoot '.local-data/d28-a')+[IO.Path]::DirectorySeparatorChar)) {
  throw 'Require task-owned ETL, private output and artifact root'
}
if(Test-Path -LiteralPath $taskOutput){throw 'Refuse analysis overwrite'}
$taskFragment=$taskArtifact.Substring([IO.Path]::GetPathRoot($taskArtifact).Length).ToLowerInvariant()
$taskObjects=@{};$taskKeys=@{};$taskIrps=@{}
$taskCount=0;$taskRetained=0;$taskLimited=$false
$taskIds=@{};$taskStatuses=@{};$taskShares=@{};$taskActors=@{}
$taskWriter=[IO.StreamWriter]::new($taskOutput,$false,[Text.UTF8Encoding]::new($false))
try {
  Get-WinEvent -Path $taskTrace -Oldest | ForEach-Object {
    $taskCount++
    if($_.ProviderName -eq 'Microsoft-Windows-Kernel-File') {
      $taskEvent=$_
      [xml]$taskXml=$taskEvent.ToXml()
      $taskData=@{}
      foreach($taskField in $taskXml.Event.EventData.Data){$taskData[$taskField.Name]=[string]$taskField.'#text'}
      $taskName=if($taskData.ContainsKey('FileName')){$taskData.FileName}elseif($taskData.ContainsKey('FilePath')){$taskData.FilePath}else{$null}
      $taskTarget=$null
      if($taskName){
        $taskPosition=$taskName.ToLowerInvariant().IndexOf($taskFragment)
        if($taskPosition -ge 0){$taskTarget=$taskName.Substring($taskPosition+$taskFragment.Length).TrimStart('\')}
        if($taskData.FileObject){if($null -ne $taskTarget){$taskObjects[$taskData.FileObject]=$taskTarget}else{$taskObjects.Remove($taskData.FileObject)}}
        if($taskData.FileKey){if($null -ne $taskTarget){$taskKeys[$taskData.FileKey]=$taskTarget}else{$taskKeys.Remove($taskData.FileKey)}}
      } elseif($taskData.FileObject -and $taskObjects.ContainsKey($taskData.FileObject)){$taskTarget=$taskObjects[$taskData.FileObject]}
      elseif($taskData.FileKey -and $taskKeys.ContainsKey($taskData.FileKey)){$taskTarget=$taskKeys[$taskData.FileKey]}
      elseif($taskData.Irp -and $taskIrps.ContainsKey($taskData.Irp)){$taskTarget=$taskIrps[$taskData.Irp]}
      if($null -ne $taskTarget){
        if($taskData.Irp){$taskIrps[$taskData.Irp]=$taskTarget}
        $taskId=[string]$taskEvent.Id;$taskActor=[string]$taskEvent.ProcessId
        $taskIds[$taskId]=1+[int]$taskIds[$taskId];$taskActors[$taskActor]=1+[int]$taskActors[$taskActor]
        if($taskData.Status){$taskStatuses[$taskData.Status]=1+[int]$taskStatuses[$taskData.Status]}
        if($taskData.ShareAccess){$taskShares[$taskData.ShareAccess]=1+[int]$taskShares[$taskData.ShareAccess]}
        if($taskRetained -lt 20000){
          $taskRow=@{at=$taskEvent.TimeCreated.ToUniversalTime().ToString('o');eventId=$taskEvent.Id;pid=$taskEvent.ProcessId;thread=$taskEvent.ThreadId;target=$taskTarget;data=$taskData}
          $taskWriter.WriteLine(($taskRow|ConvertTo-Json -Compress -Depth 8));$taskRetained++
        }else{$taskLimited=$true}
      }
      if($taskEvent.Id -eq 24 -and $taskData.Irp){$taskIrps.Remove($taskData.Irp)}
      if($taskEvent.Id -eq 14 -and $taskData.FileObject){$taskObjects.Remove($taskData.FileObject)}
    }
  }
} finally {$taskWriter.Dispose()}
$taskSummary=@{task='D28-A-fix';scope='Only target artifact subtree and correlated file objects/IRPs; raw kernel pointers stay private';eventsRead=$taskCount;targetEventsRetained=$taskRetained;outputLimited=$taskLimited;eventIdCounts=$taskIds;statusCounts=$taskStatuses;shareAccessCounts=$taskShares;actorPidCounts=$taskActors;etlSha256=(Get-FileHash -LiteralPath $taskTrace -Algorithm SHA256).Hash.ToLower();filteredSha256=(Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash.ToLower();rootCauseClosure=$false}
$taskSummary|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($taskOutput+'.summary.json') -Encoding utf8
$taskSummary|ConvertTo-Json -Compress -Depth 8
