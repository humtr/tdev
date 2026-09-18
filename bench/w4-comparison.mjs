import {requireThat} from '../src/contracts/errors.mjs';

/** @typedef {'succeeded'|'failed'|'cancelled'|'timed_out'} W4Status */
/** @typedef {{pairId:string,status:W4Status,completed:number,elapsedMs:number}} W4Trial */
/** @typedef {{system:string,trials:readonly W4Trial[]}} W4System */
/** @typedef {{schemaVersion:1,workload:'W4',seed:number,resamples:number,tdev:W4System,baseline:W4System}} W4ComparisonInput */

/** @param {unknown} value @param {string} label */
function positiveFinite(value,label){requireThat(typeof value==='number'&&Number.isFinite(value)&&value>0,'INVALID_ARGUMENT',label+' must be a positive finite number');}
/** @param {unknown} value @param {string} label */
function nonnegativeInteger(value,label){requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0,'INVALID_ARGUMENT',label+' must be a nonnegative integer');}
/** @param {string} value @param {string} label */
function identifier(value,label){requireThat(/^[A-Za-z0-9_.:-]{1,128}$/.test(value),'INVALID_ARGUMENT',label+' must be a bounded non-secret identifier');}
/** @param {readonly number[]} values */
function median(values){requireThat(values.length>0,'INVALID_ARGUMENT','Median needs observations');const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;}
/** Nearest-rank empirical percentile. @param {readonly number[]} values @param {number} probability */
function percentile(values,probability){requireThat(values.length>0&&probability>0&&probability<=1,'INVALID_ARGUMENT');const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(probability*sorted.length)-1];}
/** @param {readonly W4Trial[]} trials */
function throughput(trials){const completed=trials.reduce((sum,t)=>sum+t.completed,0),elapsedMs=trials.reduce((sum,t)=>sum+t.elapsedMs,0);return completed/(elapsedMs/1000);}
/** @param {number} seed */
function random(seed){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
/** @param {number} value */
function finiteOrNull(value){return Number.isFinite(value)?value:null;}
/** @param {readonly number[]} values */
function interval(values){return {lower:finiteOrNull(percentile(values,0.025)),upper:finiteOrNull(percentile(values,0.975))};}
/** @param {readonly W4Trial[]} tdev @param {readonly W4Trial[]} baseline @param {number} resamples @param {number} seed */
function bootstrap(tdev,baseline,resamples,seed){
 const next=random(seed),latencyRatios=[],throughputRatios=[];
 for(let sample=0;sample<resamples;sample++){
  /** @type {W4Trial[]} */ const d=[];/** @type {W4Trial[]} */ const b=[];
  for(let i=0;i<tdev.length;i++){const index=Math.floor(next()*tdev.length);d.push(tdev[index]);b.push(baseline[index]);}
  latencyRatios.push(median(d.map(t=>t.elapsedMs))/median(b.map(t=>t.elapsedMs)));
  const baseThroughput=throughput(b);throughputRatios.push(baseThroughput===0?Number.POSITIVE_INFINITY:throughput(d)/baseThroughput);
 }
 return {latency:interval(latencyRatios),throughput:interval(throughputRatios)};
}
/** @param {readonly W4Trial[]} trials @param {string} side */
function validateTrials(trials,side){
 requireThat(Array.isArray(trials)&&trials.length>0,'INVALID_ARGUMENT',side+' trials are required');const seen=new Set();
 for(const trial of trials){identifier(trial.pairId,side+' pairId');requireThat(!seen.has(trial.pairId),'INVALID_ARGUMENT','Duplicate '+side+' pairId');seen.add(trial.pairId);requireThat(['succeeded','failed','cancelled','timed_out'].includes(trial.status),'INVALID_ARGUMENT','Unknown W4 status');nonnegativeInteger(trial.completed,side+' completed');requireThat(trial.completed<=8,'INVALID_ARGUMENT','W4 completed count exceeds eight');positiveFinite(trial.elapsedMs,side+' elapsedMs');if(trial.status==='succeeded')requireThat(trial.completed===8,'INVALID_ARGUMENT','Succeeded W4 batch must complete all eight works');}
 return seen;
}
/** Score one genuinely comparable D0007 W4 paired cell. This does not establish the
 * W1-W4 geometric-mean gate, aggregate correctness gate, efficiency gate, or overall
 * predecessor superiority. Failed/cancelled/timed-out batches remain in elapsed time.
 * @param {W4ComparisonInput} input
 */
export function scoreW4Comparison(input){
 requireThat(input&&typeof input==='object'&&input.schemaVersion===1&&input.workload==='W4','INVALID_ARGUMENT','Expected W4 comparison schema v1');
 identifier(input.tdev.system,'tdev system');identifier(input.baseline.system,'baseline system');requireThat(input.tdev.system==='dev-2'&&input.baseline.system!=='dev-2','INVALID_ARGUMENT','Expected dev-2 versus a distinct baseline');
 nonnegativeInteger(input.seed,'seed');requireThat(input.seed>0&&input.seed<=0xffffffff,'INVALID_ARGUMENT','Seed must be a nonzero uint32');requireThat(input.resamples===10000,'INVALID_ARGUMENT','D0007 requires exactly 10,000 published bootstrap resamples');
 const devIds=validateTrials(input.tdev.trials,'tdev'),baseIds=validateTrials(input.baseline.trials,'baseline');requireThat(devIds.size===baseIds.size&&[...devIds].every(id=>baseIds.has(id)),'INVALID_ARGUMENT','Paired systems must contain identical pair IDs');
 const baselineById=new Map(input.baseline.trials.map(t=>[t.pairId,t])),tdev=[...input.tdev.trials],baseline=tdev.map(t=>baselineById.get(t.pairId));requireThat(baseline.every(Boolean),'INTEGRITY_FAILURE');
 /** @type {W4Trial[]} */ const pairedBaseline=baseline.map(t=>/** @type {W4Trial} */(t));const n=tdev.length,devLatency=tdev.map(t=>t.elapsedMs),baseLatency=pairedBaseline.map(t=>t.elapsedMs),devThroughput=throughput(tdev),baseThroughput=throughput(pairedBaseline),boot=bootstrap(tdev,pairedBaseline,input.resamples,input.seed);
 const latencyRatio=median(devLatency)/median(baseLatency),p95Ratio=percentile(devLatency,.95)/percentile(baseLatency,.95),throughputRatio=baseThroughput===0?null:devThroughput/baseThroughput,pairedEnough=n>=30,tailEnough=n>=100;
 const throughputGate=!pairedEnough?'insufficient_sample':throughputRatio===null||boot.throughput.lower===null?'not_comparable_zero_baseline_throughput':throughputRatio>=1.25&&boot.throughput.lower>1?'pass':'fail';
 return {scope:'d0007-w4-single-cell',workload:'W4',tdevSystem:input.tdev.system,baselineSystem:input.baseline.system,pairedTrials:n,bootstrap:{resamples:input.resamples,seed:input.seed,latencyRatio95:boot.latency,throughputRatio95:boot.throughput},completion:{tdev:tdev.reduce((s,t)=>s+t.completed,0)/(8*n),baseline:pairedBaseline.reduce((s,t)=>s+t.completed,0)/(8*n)},latencyMs:{tdevMedian:median(devLatency),baselineMedian:median(baseLatency),medianRatio:latencyRatio,tdevP95:percentile(devLatency,.95),baselineP95:percentile(baseLatency,.95),p95Ratio,percentileMethod:'nearest-rank'},throughputPerSecond:{tdev:devThroughput,baseline:baseThroughput,ratio:throughputRatio},gates:{pairedMedianSample:pairedEnough?'pass':'insufficient_sample',throughput:throughputGate,medianCellRegression:!pairedEnough?'insufficient_sample':latencyRatio<=1.10?'pass':'fail',p95CellRegression:!tailEnough?'insufficient_sample':p95Ratio<=1.10?'pass':'fail'},hardSuperiorityEstablished:false};
}
