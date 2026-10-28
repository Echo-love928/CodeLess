import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {publicReport,qualifies} from './capacity-report.mjs';
const root=resolve(process.argv[2]),id=process.argv[3];
assert.match(id,/^(real|mock)-[a-f0-9-]+$/);
const rawRoot=join(root,id),dest=resolve('tests/performance/api/evidence',id),read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read(join(dest,'manifest.json')),raw=read(join(rawRoot,'raw-report.json')),command=read(join(rawRoot,'command.json')),published=read(join(dest,'anonymous-report.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(readFileSync(join(root,'raw-evidence.tar.gz'))),manifest.privateArchiveSha256);
for(const [path,digest]of Object.entries(manifest.rawFiles))assert.equal(sha(readFileSync(join(rawRoot,path))),digest,path);
assert.equal(sha(readFileSync(join(rawRoot,'command.log'))),command.logSha256);
assert.equal(sha(readFileSync(join(dest,'anonymous-report.json'))),manifest.publicReportSha256);
assert.deepEqual(publicReport(raw,command,published.machine),published);
assert.equal(qualifies(published,command),true);assert.equal(raw.calls.length,8);
const calls=[...raw.calls].sort((a,b)=>a.index-b.index),cancel=raw.assertions.cancelledAtNanos;
assert.deepEqual(calls.map(c=>c.index),[1,2,3,4,5,6,7,8]);
for(const index of [0,1])assert.ok(calls[index].startNanos<cancel&&calls[index].endNanos>cancel);
for(const index of [2,3]) {
  assert.equal(calls[index].outcome,'MODEL_CAPACITY_EXCEEDED');
  for(const active of calls.slice(0,2))assert.ok(calls[index].startNanos>=active.startNanos&&calls[index].endNanos<active.endNanos);
}
assert.ok(calls[3].startNanos>cancel);
assert.equal(calls[5].outcome,'MODEL_TIMEOUT');assert.equal(calls[5].evidence.usage.inputTokens,null);
for(const index of [6,7]) {assert.equal(calls[index].outcome,'RETURNED');assert.ok(calls[index].startNanos>calls[5].endNanos);}
assert.ok(Math.max(calls[6].startNanos,calls[7].startNanos)<Math.min(calls[6].endNanos,calls[7].endNanos));
assert.equal(raw.http.length,30);
for(const sample of raw.http) {
  assert.equal(sample.status,200);
  assert.ok(calls.slice(0,2).some(c=>c.startNanos<=sample.startNanos&&c.endNanos>=sample.endNanos));
}
assert.deepEqual(raw.assertions.queue,{rejected:1,accepted:32,retryAfter:'1',status:503,code:'TASK_QUEUE_FULL'});
assert.equal(raw.assertions.lateReplyCannotReviveCancelledTask,true);assert.equal(raw.assertions.queuedTaskClaimedAfterCancellation,true);
assert.equal(published.machine.processGroup.cpuQuota,1);assert.equal(published.machine.processGroup.memoryMaxBytes,1610612736);
const audited={mode:raw.mode,runId:id,status:'PASSED',nativeExit:command.exitCode,rawFilesVerified:Object.keys(manifest.rawFiles).length,
  reportRecomputed:true,initialTwoCallsOverlapCancellation:true,twoLocalRejectionsDuringSaturation:true,bothSlotsReusableAfterTimeout:true,httpSamplesWithinActualCallIntervals:30,
  privateArchiveSha256:manifest.privateArchiveSha256,publicReportSha256:manifest.publicReportSha256};
if(existsSync(join(dest,'audit.json')))assert.deepEqual(JSON.parse(readFileSync(join(dest,'audit.json'),'utf8')),audited);
else writeFileSync(join(dest,'audit.json'),JSON.stringify(audited,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(audited));
