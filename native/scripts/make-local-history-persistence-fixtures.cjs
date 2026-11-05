// Executes actual legacy queue/timer helpers; no rewritten reference algorithm.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const queueText=fs.readFileSync(path.join(root,'legacy/src/renderer/src/core/latest-task-queue.ts'),'utf8');
const queueContext={result:{}};
vm.runInNewContext(stripTypeScriptTypes(queueText.replace('export class','class')+'\nresult.Queue=LatestTaskQueue;',{mode:'transform'}),queueContext);
const Queue=queueContext.result.Queue;
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
(async()=>{
 const result={};
 {
  const first=gate(),last=gate(),seen=[];let idles=0,pendingReady=false;
  const q=new Queue(async v=>{seen.push(v);await(v===0?first.promise:last.promise);},()=>idles++);
  const a=q.enqueue(0),b=q.enqueue(1);let same=true;for(let i=2;i<=100;i++)same&&=q.enqueue(i)===b;
  void b.then(()=>{pendingReady=true;});
  const states=[];const snapshot=()=>states.push({seen:[...seen],running:q.runningValue??null,pending:q.pendingValue??null,idles,pendingReady});
  snapshot();first.resolve();await a;snapshot();last.resolve();await b;snapshot();
  assert(same);assert.deepEqual(seen,[0,100]);assert.equal(idles,1);result.replacement={same,states};
 }
 {
  const first=gate(),last=gate(),seen=[];let idles=0;
  const q=new Queue(async v=>{seen.push(v);if(v===0)await first.promise;if(v===2){await last.promise;throw Error('disk full');}},()=>idles++);
  const a=q.enqueue(0),b=q.enqueue(1),c=q.enqueue(2);assert.equal(b,c);
  const error=c.catch(e=>e.message);first.resolve();await a;last.resolve();const message=await error;await q.enqueue(3);
  assert.equal(message,'disk full');result.latestFailure={seen,idles,message,same:b===c};
 }
 {
  const first=gate(),last=gate(),seen=[];let idles=0;
  const q=new Queue(async v=>{seen.push(v);if(v===0){await first.promise;throw Error('first failed');}await last.promise;},()=>idles++);
  const a=q.enqueue(0),b=q.enqueue(1),error=a.catch(e=>e.message);first.resolve();const message=await error;last.resolve();await b;
  result.firstFailure={seen,idles,message};
 }
 {
  let idles=0;const q=new Queue(v=>{if(v===0)throw Error('sync full');return Promise.resolve();},()=>idles++);
  const a=q.enqueue(0),immediate={running:q.runningValue??null,idles};const message=await a.catch(e=>e.message);await q.enqueue(3);
  result.synchronousFailure={immediate,message,idles};
 }
 {
  const q=new Queue(async()=>{throw Error('worker failed');},()=>{throw Error('idle failed');});
  result.idleFailure=await q.enqueue(1).catch(e=>e.message);assert.equal(result.idleFailure,'idle failed');
 }
 const service=fs.readFileSync(path.join(root,'legacy/src/renderer/src/store/local-history-service.ts'),'utf8');
 // Execute actual persist/dedup code with controlled worker completion.
 const helperBegin=service.indexOf('const rememberLatestWrite ='),helperEnd=service.indexOf('const deltaCaches =',helperBegin);
 const persistBegin=service.indexOf('export const persistLocalHistory ='),persistEnd=service.indexOf('const writeHistoryGeneration =',persistBegin);
 assert(helperBegin>=0&&helperEnd>helperBegin&&persistBegin>=0&&persistEnd>persistBegin);
 const dedupGates=[],dedupWrites=[],dedupQueues=new Map(),dedupContext={result:{},writeQueues:dedupQueues,sessionWrites:new WeakMap(),latestWrites:new Map(),WeakRef,LatestTaskQueue:Queue,
  loadEditorPreferences:()=>({localHistoryEnabled:true}),HISTORY_FORMAT_VERSION:4,historyId:()=> 'project-dedup',clampPosition:(p,l)=>Math.max(0,Math.min(l.length,Math.trunc(p))),documentFingerprint:d=>d.marker,
  writeHistoryGeneration:async generation=>{dedupWrites.push(generation);const blocked=gate();dedupGates.push({blocked,record:generation.record});await blocked.promise;}};
 vm.runInNewContext(stripTypeScriptTypes(service.slice(helperBegin,helperEnd)+service.slice(persistBegin,persistEnd).replace('export const','const')+'\nresult.persist=persistLocalHistory;',{mode:'transform'}),dedupContext);
 const dedupNodes=Array.from({length:3},()=>({})),dedupSessions=Array.from({length:2},()=>({document:{},localHistory:{}})),ackIds=new Map();let ackSerial=0;
 const dedupOperations=[];
 const enqueue=(session,position=1,labels=['paint'],nodes=[0,1],marker='a',include=false)=>dedupOperations.push({kind:'enqueue',session,position,labels,nodes,marker,include});
 const drain=()=>dedupOperations.push({kind:'drain'});
 enqueue(0);enqueue(0);enqueue(1);enqueue(0);enqueue(0);drain();enqueue(0);enqueue(0,1,['paint'],[0,1],'b');
 enqueue(0,1,['paint'],[0,1],'b',true);enqueue(0,1,['paint'],[0,1],'c');drain();enqueue(0,1,['paint'],[0,1],'c');drain();
 enqueue(0,0);drain();enqueue(0,0,['renamed']);drain();enqueue(0,0,['renamed'],[0,2]);drain();enqueue(1);drain();enqueue(0,0,['renamed'],[0,2]);drain();
 result.dedup=[];
 for(const operation of dedupOperations){
  if(operation.kind==='enqueue'){
   const target=dedupSessions[operation.session];target.document.marker=operation.marker;target.localHistory={position:operation.position,labels:operation.labels,snapshots:operation.nodes.map(i=>dedupNodes[i])};
   const ack=dedupContext.result.persist({},target,operation.include);if(!ackIds.has(ack))ackIds.set(ack,++ackSerial);
   result.dedup.push({...operation,ack:ackIds.get(ack),writes:dedupWrites.length,pending:!!dedupQueues.get('project-dedup')?.pendingValue});
  }else{
   while(dedupGates.length){const {blocked,record}=dedupGates.shift();blocked.resolve();await record.completion;}
   result.dedup.push({...operation,writes:dedupWrites.length});
  }
 }
 // Global identity registry and bounded latest metadata. Seed records using
 // the actual restoreLocalHistory registration block, without doing IO or
 // reimplementing rememberLatestWrite's eviction policy in this generator.
 const registryQueues=new Map(),registryLatest=new Map(),registrySessions=new WeakMap(),registryGates=[],registryWrites=[];
 const seedBegin=service.indexOf('  if (hasCache && !writeQueues.has(manifest.projectKey))'),seedEnd=service.indexOf('  configureLocalHistory(session, api)',seedBegin);
 assert(seedBegin>=0&&seedEnd>seedBegin);
 const registryContext={result:{},writeQueues:registryQueues,latestWrites:registryLatest,sessionWrites:registrySessions,WeakRef,LatestTaskQueue:Queue,
  loadEditorPreferences:()=>({localHistoryEnabled:true}),HISTORY_FORMAT_VERSION:4,historyId:d=>d.key,clampPosition:(p,l)=>Math.max(0,Math.min(l.length,Math.trunc(p))),documentFingerprint:d=>d.marker,
  writeHistoryGeneration:async generation=>{registryWrites.push(generation);const blocked=gate();registryGates.push({blocked,record:generation.record});await blocked.promise;}};
 vm.runInNewContext(stripTypeScriptTypes(service.slice(helperBegin,helperEnd)+service.slice(persistBegin,persistEnd).replace('export const','const')+
  '\nconst seed=(session,manifest,snapshots)=>{const hasCache=true,position=manifest.position;'+service.slice(seedBegin,seedEnd)+'};\nObject.assign(result,{persist:persistLocalHistory,seed});',{mode:'transform'}),registryContext);
 const registryTargets=new Map(),registryAcks=new Map();let registrySerial=0;result.registry=[];
 const targetFor=(session,id)=>{if(!registryTargets.has(session))registryTargets.set(session,{document:{key:id,marker:'current'},localHistory:{snapshots:[{}],labels:[],position:0}});return registryTargets.get(session);};
 const registryOperation=operation=>{
  const target=targetFor(operation.session,operation.id);target.document.marker=operation.marker??'current';let ack;
  if(operation.kind==='seed')registryContext.result.seed(target,{version:4,projectKey:operation.id,labels:[],position:0},target.localHistory.snapshots);
  else ack=registryContext.result.persist({},target,operation.include??false);
  if(ack&&!registryAcks.has(ack))registryAcks.set(ack,++registrySerial);
  result.registry.push({...operation,...(ack?{ack:registryAcks.get(ack)}:{}),queues:registryQueues.size,latest:registryLatest.size,writes:registryWrites.length});
 };
 for(let i=0;i<256;i++)registryOperation({kind:'seed',session:i,id:'project-registry-'+i});
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0'}); // A hit does not refresh insertion order.
 registryOperation({kind:'seed',session:256,id:'project-registry-256'});
 registryOperation({kind:'enqueue',session:1,id:'project-registry-1'});
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0'}); // Evicted metadata must write again.
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0'});
 registryOperation({kind:'enqueue',session:1,id:'project-registry-1'});
 for(let i=257;i<514;i++)registryOperation({kind:'seed',session:i,id:'project-registry-'+i}); // Evict active keys, not queues.
 registryOperation({kind:'enqueue',session:600,id:'project-registry-0',include:true,marker:'save'});
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0',marker:'latest'});
 registryOperation({kind:'seed',session:600,id:'project-registry-0'}); // Busy restore must not replace pending record.
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0',marker:'latest'});
 while(registryGates.length){const {blocked,record}=registryGates.shift();blocked.resolve();await record.completion;}
 result.registry.push({kind:'drain',queues:registryQueues.size,latest:registryLatest.size,writes:registryWrites.length});
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0',marker:'latest',include:true});
 registryOperation({kind:'enqueue',session:0,id:'project-registry-0',marker:'ordinary'}); // New idle queue clears sticky save.
 while(registryGates.length){const {blocked,record}=registryGates.shift();blocked.resolve();await record.completion;}
 result.registry.push({kind:'drain',queues:registryQueues.size,latest:registryLatest.size,writes:registryWrites.length});
 const begin=service.indexOf('export const scheduleLocalHistoryPersist ='),end=service.indexOf('export const persistLocalHistory =',begin);
 assert(begin>=0&&end>begin);
 const clock={now:0},timers=new Map(),writes=[],pendingWrites=new Map(),pressuredStates=new WeakSet(),session={localHistory:{}};let serial=0;
 const context={result:{},pendingWrites,pressuredStates,historyId:()=> 'project-timer',persistLocalHistory:()=>{writes.push(clock.now);return Promise.resolve();},console,
  window:{setTimeout:(callback,delay)=>{const id=++serial;timers.set(id,{callback,deadline:clock.now+delay});return id;},clearTimeout:id=>timers.delete(id)}};
 vm.runInNewContext(stripTypeScriptTypes(service.slice(begin,end).replaceAll('export const','const')+'\nObject.assign(result,{scheduleLocalHistoryPersist,flushLocalHistoryPersist});',{mode:'transform'}),context);
 const operations=[['schedule',0,false],['schedule',100,false],['tick',849],['tick',850],['schedule',900,true],['tick',900],['schedule',1000,false],['schedule',1100,true],['schedule',1200,true],['tick',1749],['tick',1750],['schedule',1800,false],['schedule',1850,false],['flush',1900],['tick',2600],['schedule',2700,true],['schedule',2800,false],['tick',3549],['tick',3550],['schedule',3600,true],['schedule',3600,true],['tick',3600],['flush',3700]];
 result.timer=[];
 for(const [action,now,pressured] of operations){
  clock.now=now;
  if(action==='schedule'){if(pressured)pressuredStates.add(session.localHistory);else pressuredStates.delete(session.localHistory);context.result.scheduleLocalHistoryPersist({},session);}
  if(action==='flush')await context.result.flushLocalHistoryPersist({},session);
  if(action==='tick')for(const [id,timer] of [...timers])if(timer.deadline<=now){timers.delete(id);timer.callback();}
  const id=pendingWrites.get('project-timer');result.timer.push({action,now,...(action==='schedule'?{pressured}:{}),deadline:id===undefined?null:timers.get(id)?.deadline??null,writes:[...writes]});
 }
 const output=path.resolve(process.argv[2]||path.join(root,'native/build/local-history-persistence-fixtures.json'));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log('Actual legacy latest queue failure/replacement/acknowledgement cases and '+result.timer.length+' timer observations, '+result.dedup.length+' persist/dedup operations, '+result.registry.length+' global registry/256-key observations');
})().catch(error=>{console.error(error);process.exitCode=1;});
