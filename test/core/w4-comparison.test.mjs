import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreW4Comparison} from '../../bench/w4-comparison.mjs';

/** @param {number} count @param {number} elapsedMs @param {number} [completed] @param {'succeeded'|'failed'|'cancelled'|'timed_out'} [status] */
function trials(count,elapsedMs,completed=8,status='succeeded'){return Array.from({length:count},(_,i)=>({pairId:'p'+i,status,completed,elapsedMs}));}
/** @param {number} count */
function input(count){return {schemaVersion:1,workload:'W4',seed:20260914,resamples:10000,tdev:{system:'dev-2',trials:trials(count,800)},baseline:{system:'tmcp',trials:trials(count,1200)}};}

test('scores a 100-pair W4 cell with deterministic D0007 bootstrap and tail gates',()=>{
 const result=scoreW4Comparison(input(100));
 assert.equal(result.pairedTrials,100);assert.equal(result.completion.tdev,1);assert.equal(result.latencyMs.medianRatio,2/3);assert.equal(result.latencyMs.p95Ratio,2/3);assert.equal(result.throughputPerSecond.ratio,1.5);assert.deepEqual(result.bootstrap.latencyRatio95,{lower:2/3,upper:2/3});assert.deepEqual(result.bootstrap.throughputRatio95,{lower:1.5,upper:1.5});assert.deepEqual(result.gates,{pairedMedianSample:'pass',throughput:'pass',medianCellRegression:'pass',p95CellRegression:'pass'});assert.equal(result.hardSuperiorityEstablished,false);
});

test('thirty pairs can score median and throughput but cannot satisfy the p95 sample rule',()=>{
 const result=scoreW4Comparison(input(30));assert.equal(result.gates.pairedMedianSample,'pass');assert.equal(result.gates.throughput,'pass');assert.equal(result.gates.p95CellRegression,'insufficient_sample');
});

test('failed batches remain in the full elapsed window and reduce completion and throughput',()=>{
 const value=input(30);value.tdev.trials[0]={pairId:'p0',status:'timed_out',completed:0,elapsedMs:1800000};const result=scoreW4Comparison(value);assert.ok(result.completion.tdev<1);assert.ok(result.throughputPerSecond.tdev<result.throughputPerSecond.baseline);assert.equal(result.gates.throughput,'fail');
});

test('zero baseline throughput is not converted into an infinite superiority claim',()=>{
 const value=input(30);value.baseline.trials=trials(30,1800000,0,'timed_out');const result=scoreW4Comparison(value);assert.equal(result.throughputPerSecond.ratio,null);assert.equal(result.gates.throughput,'not_comparable_zero_baseline_throughput');assert.equal(result.hardSuperiorityEstablished,false);
});

test('rejects duplicate or mismatched pairs and malformed successful batches',()=>{
 const duplicate=input(30);duplicate.tdev.trials[1]={...duplicate.tdev.trials[1],pairId:'p0'};assert.throws(()=>scoreW4Comparison(duplicate));
 const mismatched=input(30);mismatched.baseline.trials[1]={...mismatched.baseline.trials[1],pairId:'other'};assert.throws(()=>scoreW4Comparison(mismatched));
 const malformed=input(30);malformed.tdev.trials[0]={pairId:'p0',status:'succeeded',completed:7,elapsedMs:800};assert.throws(()=>scoreW4Comparison(malformed));
});
