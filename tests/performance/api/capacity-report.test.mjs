import {test} from 'node:test';
import assert from 'node:assert/strict';
import {budget, reservationRmb, publicReport, qualifies} from './capacity-report.mjs';
const raw=()=>({mode:'REAL',status:'PASSED',configuredModel:'deepseek-flash',configuration:{instances:1},calls:[
  {index:1,startNanos:100,endNanos:1000100,inputByteReservation:1000,maxOutputTokens:256,timeoutMs:1,outcome:'MODEL_TIMEOUT',evidence:{usage:{inputTokens:null,outputTokens:null}}},
  {index:2,startNanos:1000200,endNanos:2000200,inputByteReservation:1000,maxOutputTokens:256,timeoutMs:60000,outcome:'RETURNED',reply:{content:'private reply must never escape',evidence:{requestId:'private-id',actualModel:'deepseek-flash',usage:{inputTokens:100,outputTokens:10,totalTokens:110}}}},
  {index:3,startNanos:300,endNanos:400,inputByteReservation:1000,maxOutputTokens:256,timeoutMs:60000,outcome:'MODEL_CAPACITY_EXCEEDED'}],http:[{status:200,latencyMs:2,providerOutstandingAtStart:true,providerOutstandingAtEnd:false}],assertions:{completed:true}});
test('fixed worst-case request reservations fit the authorized RMB 2 without assuming cache discounts',()=>assert.ok(reservationRmb(budget.maxInputTokenReservation,budget.maxOutputTokens)*budget.maxAttempts<.8));
test('unknown timeout usage and native process failure stay unknown/failed, not zero/success',()=>{
  const r=publicReport(raw(),{exitCode:1,signal:null},{});
  assert.equal(r.status,'FAILED');assert.equal(r.financial.unknownUsageCalls,1);assert.equal(r.financial.actualDebitedRmb,null);
  assert.equal(r.provider.calls[0].inputTokens,null);assert.ok(r.financial.reservedUpperRmb>r.financial.knownUsageCostUpperRmb);assert.equal(r.http.overlapSamples,0);
});
test('local capacity refusals are counted separately from dispatched calls and do not become paid usage',()=>{
  const r=publicReport(raw(),{exitCode:0,signal:null},{});assert.equal(r.provider.attempted,3);assert.equal(r.provider.dispatched,2);assert.equal(r.provider.rejectionRate,1/3);
  assert.equal(r.financial.reservedUpperRmb,2*reservationRmb(1000,256));
  const serialized=JSON.stringify(r);assert.ok(!serialized.includes('private reply'));assert.ok(!serialized.includes('private-id'));
});
test('oversized input/output or attempts refuse a publishable budget report',()=>{
  for(const [field,value]of [['inputByteReservation',33281],['maxOutputTokens',4097]]){const r=raw();r.calls[0][field]=value;assert.throws(()=>publicReport(r,{exitCode:0},{}));}
  const r=raw();r.calls=Array(9).fill(r.calls[0]);assert.throws(()=>publicReport(r,{exitCode:0},{}));
});
test('native zero alone never qualifies missing, incomplete or failed evidence',()=>{
  for(const r of [null,{status:'PASSED'},{status:'FAILED',assertions:{completed:true}}])assert.equal(qualifies(r,{exitCode:0,signal:null}),false);
  const complete={status:'PASSED',assertions:{completed:true}};
  assert.equal(qualifies(complete,{exitCode:1,signal:null}),false);assert.equal(qualifies(complete,{exitCode:0,signal:'SIGTERM'}),false);
  assert.equal(qualifies(complete,{exitCode:0,signal:null}),true);
});
