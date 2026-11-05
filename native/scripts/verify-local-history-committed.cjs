// Verifies native committed deltas using actual legacy modules via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),fixtureRoot=path.resolve(process.argv[3]);
const run=fs.readFileSync(path.join(fixtureRoot,'latest.txt'),'utf8');
if(!/^run-[0-9]+$/.test(run))throw Error('Invalid committed fixture run');
const out=path.join(fixtureRoot,run);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,nextResolve) {
  let target;
  if(specifier.startsWith('@/')) target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/')) target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.') && context.parentURL?.startsWith('file:')) target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target) {for(const candidate of [target,target+'.ts',path.join(target,'index.ts')]) if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()) return {url:pathToFileURL(candidate).href,shortCircuit:true};}
  try{return nextResolve(specifier,context);}catch(error) {
   if(specifier.startsWith('.')||specifier.startsWith('node:')||specifier.startsWith('file:')) throw error;
   const store=path.join(legacy,'node_modules/.pnpm'),name=specifier.split('/')[0];
   const matches=fs.readdirSync(store).filter(n=>n.startsWith(name+'@'));
   if(matches.length!==1) throw error;
   const full=path.join(store,matches[0],'node_modules',specifier);
   return {url:pathToFileURL(require.resolve(full)).href,shortCircuit:true};
  }
 },
 load(url,context,nextLoad) {
  if(url.startsWith('file:')&&url.endsWith('.ts')) return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return nextLoad(url,context);
 }
});
(async()=>{
 const assert=require('node:assert/strict');
 const source=name=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',name)));
 const {decodeProject,encodeProject}=await source('project-format.ts');
 const {decodeHistoryDelta,encodeHistoryDelta}=await source('local-history-archive.ts');
 const {hydrateLocalHistoryDelta,cloneHistoryDocument,prepareHistoryDocument,compileLocalHistoryDelta}=await source('local-history-delta.ts');
 const {captureCommittedHistoryDelta,localHistoryDocumentShape}=await source('local-history-committed-delta.ts');
 const {commitPixelEdit}=await source('history.ts');
 const {resolveAnimationCel}=await source('animation.ts');
 const normalize=patch=>({path:patch.path,aliases:patch.aliases,offset:patch.offset,before:[...patch.before],after:[...patch.after]});
 const rasterState=document=>document.animation.cels.map(cel=>{
  const owner=resolveAnimationCel(document.animation,cel),s=owner.surface;
  return [cel.id,cel.layerId,cel.frameId,cel.linkedCelId,s.format,s.width,s.height,s.offsetX,s.offsetY,[...s.pixels]];
 });
 for(const name of ['point','run','dense','sparse','linked','inactive','overlap','overlap-mapped']){
  const directory=path.join(out,name);
  const before=decodeProject(new Uint8Array(fs.readFileSync(path.join(directory,'before.moonsprite'))));
  const after=decodeProject(new Uint8Array(fs.readFileSync(path.join(directory,'after.moonsprite'))));
  const delta=decodeHistoryDelta(new Uint8Array(fs.readFileSync(path.join(directory,'delta.zip'))));
  // Native surfaces in this adapter are already dense. Project encoding can
  // choose sparse tiles; use legacy's dense preparation for like-for-like
  // in-memory shape eligibility, confined to these tiny test projects.
  prepareHistoryDocument(before);prepareHistoryDocument(after);
  // Separate project ZIPs place raw array views at different byte offsets.
  // Eligibility is an in-session comparison, so compare the same live target
  // before/after applying the captured edit, as the legacy service does.
  const target=cloneHistoryDocument(before),targetShape=localHistoryDocumentShape(target),entry=hydrateLocalHistoryDelta(target,delta);
  entry.redo();assert.deepEqual(rasterState(target),rasterState(after),name+' redo');
  assert.equal(localHistoryDocumentShape(target),targetShape,name+' legacy shape eligibility');
  assert.equal(target.animation.activeFrameId,before.animation.activeFrameId,name+' viewed frame after redo');
  entry.undo();assert.deepEqual(rasterState(target),rasterState(before),name+' undo');
  assert.equal(target.animation.activeFrameId,before.animation.activeFrameId,name+' viewed frame after undo');
  entry.redo();assert.deepEqual(rasterState(target),rasterState(after),name+' repeated redo');
  // Independent, explicit committed edit inputs invoke actual legacy commit
  // and capture functions, rather than a second implementation of capture.
  const edit={layerId:delta.celTarget.layerId,frameId:name==='inactive'?delta.celTarget.frameId:after.animation.activeFrameId,before:new Map(),after:new Map()};
  if(name==='point'){edit.before.set(10,0);edit.after.set(10,0x80332211);}
  if(name==='linked'){edit.before.set(19,0);edit.after.set(19,0xff112233);}
  if(name==='sparse'){edit.before.set(4,0);edit.after.set(4,0x12345678);}
  if(name==='inactive'){edit.before.set(10,0);edit.after.set(10,0xffabcdef);assert.notEqual(delta.celTarget.frameId,delta.snapshotFrameId);assert.equal(delta.snapshotFrameId,after.animation.activeFrameId);}
  if(name.startsWith('overlap'))edit.runs=[{index:5,length:3,before:0,after:0xff111111},{index:6,length:1,before:0xff111111,after:0xff222222}];
  // Native linear runs can cross rows; split at the row boundary to obtain
  // legacy's bounded run representation while retaining operation order.
  if(name==='run')edit.runs=[{index:3,length:2,before:0,after:0x80443322},{index:5,length:5,before:0,after:0x80443322},{index:10,length:2,before:0,after:0x80443322}];
  if(name==='run')assert.equal(delta.label,'连续段😀');
  if(name==='dense')edit.denseRegion={x:1,y:1,width:2,height:2,before:new Uint32Array(4),after:new Uint32Array([0xff010203,0x00010203,0x80445566,0xffffffff]),changed:new Uint8Array([1,1,1,1]),count:4};
  const referenceEntry=commitPixelEdit(after,edit,delta.label,true);assert(referenceEntry,name+' reference entry');
  const reference=captureCommittedHistoryDelta(after,referenceEntry);assert(reference,name+' reference capture');
  assert.deepEqual(delta.patches.map(normalize),reference.patches.map(normalize),name+' actual legacy committed patches');
  assert.deepEqual(delta.celTarget,reference.celTarget,name+' canonical cel');assert.equal(delta.bytes,reference.bytes,name+' bytes');
  assert.deepEqual(delta.affectedLayerIds,reference.affectedLayerIds,name+' affected layers');
  console.log('Actual legacy committed capture + redo/undo passed: '+name);
 }
 // Actual legacy compiler: two successive changes to different channels of
 // the same word. Persist its unaligned byte patches for native stack tests.
 const compiled=path.join(out,'compiled-unaligned');fs.mkdirSync(compiled,{recursive:true});
 const first=decodeProject(new Uint8Array(fs.readFileSync(path.join(out,'run','before.moonsprite'))));prepareHistoryDocument(first);
 const middle=cloneHistoryDocument(first);new Uint8Array(middle.layers[0].pixels.buffer,middle.layers[0].pixels.byteOffset,middle.layers[0].pixels.byteLength)[1]=53;
 const last=cloneHistoryDocument(middle);new Uint8Array(last.layers[0].pixels.buffer,last.layers[0].pixels.byteOffset,last.layers[0].pixels.byteLength)[2]=119;
 const transitions=[compileLocalHistoryDelta(first,middle,'green'),compileLocalHistoryDelta(middle,last,'blue')];
 assert(transitions.every(Boolean));assert.equal(transitions[0].patches[0].offset,1);assert.equal(transitions[1].patches[0].offset,2);assert.equal(transitions[0].patches[0].after.length,1);
 for(const [name,value] of [['before',first],['middle',middle],['after',last]])fs.writeFileSync(path.join(compiled,name+'.moonsprite'),encodeProject(value));
 transitions.forEach((value,index)=>fs.writeFileSync(path.join(compiled,'delta'+index+'.zip'),encodeHistoryDelta(value)));
 const live=cloneHistoryDocument(middle);const entries=transitions.map(value=>hydrateLocalHistoryDelta(live,value));entries[1].redo();assert.deepEqual(rasterState(live),rasterState(last));entries[1].undo();entries[0].undo();assert.deepEqual(rasterState(live),rasterState(first));entries[0].redo();assert.deepEqual(rasterState(live),rasterState(middle));
 const metadataDirectory=path.join(out,'compiled-metadata');fs.mkdirSync(metadataDirectory,{recursive:true});
 const metadataBefore=cloneHistoryDocument(first);metadataBefore.dirty=false;metadataBefore.createdAt='2026-01-01T00:00:00.000Z';metadataBefore.updatedAt='2026-01-02T00:00:00.000Z';metadataBefore.statistics={strokeCount:9,operationCount:14,drawingTimeMs:200};
 const metadataMiddle=cloneHistoryDocument(metadataBefore);metadataMiddle.dirty=true;metadataMiddle.updatedAt='2026-02-01T00:00:00.000Z';metadataMiddle.statistics={strokeCount:10,operationCount:15,drawingTimeMs:235};metadataMiddle.layers[0].pixels[0]=0xff123456;
 const metadataAfter=cloneHistoryDocument(metadataMiddle);metadataAfter.dirty=false;metadataAfter.createdAt='2025-12-31T23:00:00.000Z';metadataAfter.updatedAt='2026-03-01T00:00:00.000Z';metadataAfter.statistics={strokeCount:11,operationCount:9007199254740991,drawingTimeMs:9007199254740991};
 const metadataDeltas=[compileLocalHistoryDelta(metadataBefore,metadataMiddle,'pixel and metadata'),compileLocalHistoryDelta(metadataMiddle,metadataAfter,'metadata only')];assert(metadataDeltas.every(Boolean));
 assert(metadataDeltas[0].patches.some(patch=>patch.offset!==undefined));assert(metadataDeltas[0].patches.some(patch=>patch.path.join('.')==='statistics.strokeCount'));assert(metadataDeltas[1].patches.every(patch=>patch.offset===undefined));
 const information=document=>[document.dirty,document.createdAt,document.updatedAt,document.statistics];
 const metadataLive=cloneHistoryDocument(metadataMiddle);const metadataEntries=metadataDeltas.map(delta=>hydrateLocalHistoryDelta(metadataLive,delta));metadataEntries[1].redo();assert.deepEqual(information(metadataLive),information(metadataAfter));metadataEntries[1].undo();assert.deepEqual(information(metadataLive),information(metadataMiddle));metadataEntries[0].undo();assert.deepEqual(information(metadataLive),information(metadataBefore));assert.deepEqual(rasterState(metadataLive),rasterState(metadataBefore));metadataEntries[0].redo();assert.deepEqual(information(metadataLive),information(metadataMiddle));assert.deepEqual(rasterState(metadataLive),rasterState(metadataMiddle));
 for(const [name,value] of [['before',metadataBefore],['middle',metadataMiddle],['after',metadataAfter]])fs.writeFileSync(path.join(metadataDirectory,name+'.moonsprite'),encodeProject(value));
 metadataDeltas.forEach((value,index)=>fs.writeFileSync(path.join(metadataDirectory,'delta'+index+'.zip'),encodeHistoryDelta(value)));
 fs.writeFileSync(path.join(metadataDirectory,'expectations.json'),JSON.stringify({before:information(metadataBefore),middle:information(metadataMiddle),after:information(metadataAfter)}));
 // Execute the actual recording helper with only external side effects
 // stubbed. Counter normalization/rounding remains legacy source, including
 // the transient unsafe integer after incrementing MAX_SAFE_INTEGER.
 const {normalizeProjectStatistics}=await source('project-metadata.ts');
 const recordingSource=fs.readFileSync(path.join(legacy,'src/renderer/src/store/workspace-recording.ts'),'utf8');
 const operationStart=recordingSource.indexOf('const recordDocumentOperation = (');const operationEnd=recordingSource.indexOf('  return { recordDocumentOperation',operationStart);assert(operationStart>=0&&operationEnd>operationStart);
 const makeOperation=stripTypeScriptTypes('(function(){'+recordingSource.slice(operationStart,operationEnd)+';return recordDocumentOperation;})()',{mode:'transform'});
 const recordOperation=require('node:vm').runInNewContext(makeOperation,{normalizeProjectStatistics,publishEditorEvent(){},recordUsageDrawingActivity(){},scheduleTimelapseCapture(){}});
 const operationCases=[];
 for(const value of [0,9007199254740990,9007199254740991,9007199254740992])for(const drawing of [false,true]){
  const before={strokeCount:value,operationCount:value,drawingTimeMs:value};const activity=drawing?{stroke:true,durationMs:3}:undefined;const document={statistics:{...before}};recordOperation({document},activity,false);const after={...document.statistics};recordOperation({document},undefined,false);operationCases.push({before,activity,after,next:document.statistics});
 }
 assert.equal(operationCases.find(row=>row.before.operationCount===9007199254740991&&!row.activity).after.operationCount,9007199254740992);
 assert.equal(operationCases.find(row=>row.before.operationCount===9007199254740991&&!row.activity).next.operationCount,1);
 fs.writeFileSync(path.join(metadataDirectory,'operation-statistics.json'),JSON.stringify(operationCases));

 const aliasDirectory=path.join(out,'compiled-metadata-alias');fs.mkdirSync(aliasDirectory,{recursive:true});
 const aliasBefore=cloneHistoryDocument(metadataBefore);aliasBefore.updatedAt=aliasBefore.createdAt;const aliasLive=cloneHistoryDocument(aliasBefore);
 const aliasDelta={label:'metadata alias order',bytes:256,patches:[{path:['createdAt'],aliases:[['createdAt'],['updatedAt']],before:aliasBefore.createdAt,after:'2026-04-01T00:00:00.000Z'},{path:['updatedAt'],before:'2026-04-01T00:00:00.000Z',after:'2026-05-01T00:00:00.000Z'}],origins:{before:[{x:0,y:0}],after:[{x:0,y:0}]},affectedLayerIds:[],invalidation:{kind:'full'},requiresAnimationSelectionNormalization:false};
 const aliasEntry=hydrateLocalHistoryDelta(aliasLive,aliasDelta);aliasEntry.redo();assert.equal(aliasLive.createdAt,'2026-04-01T00:00:00.000Z');assert.equal(aliasLive.updatedAt,'2026-05-01T00:00:00.000Z');const aliasAfter=cloneHistoryDocument(aliasLive);aliasEntry.undo();assert.deepEqual(information(aliasLive),information(aliasBefore));
 fs.writeFileSync(path.join(aliasDirectory,'before.moonsprite'),encodeProject(aliasBefore));fs.writeFileSync(path.join(aliasDirectory,'after.moonsprite'),encodeProject(aliasAfter));fs.writeFileSync(path.join(aliasDirectory,'delta0.zip'),encodeHistoryDelta(aliasDelta));
 console.log('Actual legacy mixed pixel/metadata + metadata-only compile/hydrate passed');
 // Execute the actual restore service body with real archive codecs/history
 // and controlled preferences plus external listener/write/diagnostic hooks.
 const archiveModule=await source('local-history-archive.ts'),animationModule=await source('animation.ts'),modelModule=await source('document-model.ts');
 const {HistoryStack}=await source('history.ts');const fflate=await import('fflate');
 const serviceText=fs.readFileSync(path.join(legacy,'src/renderer/src/store/local-history-service.ts'),'utf8');
 const functionFragment=name=>{const start=serviceText.indexOf('const '+name+' =');assert(start>=0);const end=serviceText.indexOf('\n}\n',start);assert(end>start);return serviceText.slice(start,end+2);};

 const encodingCache=new WeakMap();let encodingCalls=0,releaseEncoding;
 const encodeProbe=require('node:vm').runInNewContext(stripTypeScriptTypes('(()=>{'+functionFragment('encodeSnapshot')+';return encodeSnapshot;})()',{mode:'transform'}),{Promise,encodedSnapshots:encodingCache,materializeLocalHistorySnapshot:node=>node.base,historyDocumentTransferView:node=>node,encodeProjectAsync:()=>{++encodingCalls;return new Promise(resolve=>{releaseEncoding=resolve;});}});
 const cacheNode={},firstEncoding=encodeProbe(cacheNode),sameEncoding=encodeProbe(cacheNode);assert.equal(firstEncoding,sameEncoding);assert.equal(encodingCalls,1);const cacheBytes=new Uint8Array([1,2,3]);releaseEncoding(cacheBytes);assert.equal(await firstEncoding,cacheBytes);assert.equal(await encodeProbe(cacheNode),cacheBytes);assert.equal(encodingCalls,1);
 let retryCalls=0;const retryProbe=require('node:vm').runInNewContext(stripTypeScriptTypes('(()=>{'+functionFragment('encodeSnapshot')+';return encodeSnapshot;})()',{mode:'transform'}),{Promise,encodedSnapshots:new WeakMap(),historyDocumentTransferView:node=>node,encodeProjectAsync:()=>++retryCalls===1?Promise.reject(Error('encoding failed')):Promise.resolve(cacheBytes)});
 await assert.rejects(retryProbe(cacheNode),/encoding failed/);assert.equal(await retryProbe(cacheNode),cacheBytes);assert.equal(retryCalls,2);assert.equal(await retryProbe({archive:cacheBytes}),cacheBytes);assert.equal(retryCalls,2);
 console.log('Actual legacy encodeSnapshot concurrent identity/cache hit/failure eviction/retry/archive bypass passed');
 const transitionProbe=require('node:vm').runInNewContext(stripTypeScriptTypes('(()=>{const deltaCaches=new WeakMap();'+functionFragment('cacheDelta')+';return {set:cacheDelta,get:(before,after)=>deltaCaches.get(before)?.get(after)};})()',{mode:'transform'}));
 const cacheBefore={},cacheAfter={},cacheOther={};assert.equal(transitionProbe.get(cacheBefore,cacheAfter),undefined);transitionProbe.set(cacheBefore,cacheAfter,null);assert.equal(transitionProbe.get(cacheBefore,cacheAfter),null);assert.equal(transitionProbe.get(cacheAfter,cacheBefore),undefined);assert.equal(transitionProbe.get(cacheBefore,cacheOther),undefined);transitionProbe.set(cacheBefore,cacheAfter,cacheBytes);assert.equal(transitionProbe.get(cacheBefore,cacheAfter),cacheBytes);transitionProbe.set(cacheBefore,cacheOther,null);assert.equal(transitionProbe.get(cacheBefore,cacheAfter),cacheBytes);console.log('Actual legacy cacheDelta ordered pair identity, null hit, overwrite and independent successor passed');

 const fingerprintStart=serviceText.indexOf('const documentFingerprint =');const clampStart=serviceText.indexOf('const clampPosition =');const clampEnd=serviceText.indexOf('\n',clampStart);
 const replaceStart=serviceText.indexOf('const replaceDocument =');const restoreStart=serviceText.indexOf('export const restoreLocalHistory =');assert(replaceStart>=0&&restoreStart>replaceStart);
 const restoreProgram='(function(){'+serviceText.slice(serviceText.indexOf('const HISTORY_FORMAT_VERSION ='),serviceText.indexOf('\n',serviceText.indexOf('const HISTORY_FORMAT_VERSION =')))+';'+functionFragment('historyId')+';'+serviceText.slice(fingerprintStart,clampEnd)+';'+serviceText.slice(replaceStart,restoreStart)+serviceText.slice(restoreStart).replace('export const restoreLocalHistory','const restoreLocalHistory')+';return {historyId,restoreLocalHistory,documentFingerprint};})()';
 const workspaceSource=fs.readFileSync(path.join(legacy,'src/renderer/src/store/workspace-session.ts'),'utf8');const invalidationStart=workspaceSource.indexOf('export function invalidateSessionContent(');const invalidationEnd=workspaceSource.indexOf('export function touch(',invalidationStart);assert(invalidationStart>=0&&invalidationEnd>invalidationStart);
 const invalidate=require('node:vm').runInNewContext(stripTypeScriptTypes('('+workspaceSource.slice(invalidationStart,invalidationEnd).trim().replace('export function','function')+')',{mode:'transform'}));
 let restoreEntryLimit=10;
 const restoreContext={performance,Uint8Array,structuredClone,window:{setTimeout},unzip:fflate.unzip,strFromU8:fflate.strFromU8,loadEditorPreferences:()=>({localHistoryEnabled:true}),historyEntryLimit:()=>restoreEntryLimit,HistoryStack,...archiveModule,cloneDocument:cloneHistoryDocument,hydrateLocalHistoryDelta,historyDocumentBytes:(await source('local-history-delta.ts')).historyDocumentBytes,getLayerStorageOrigin:modelModule.getLayerStorageOrigin,setLayerStorageOrigin:modelModule.setLayerStorageOrigin,projectHistoryAnimationFrame:animationModule.projectHistoryAnimationFrame,documentShape:localHistoryDocumentShape,snapshotShapes:new WeakMap(),writeQueues:new Map(),sessionWrites:new WeakMap(),cacheDelta(){},rememberLatestWrite(){},configureLocalHistory(){},scheduleLocalHistoryPersist(){throw Error('Unexpected migration write');},packLocalHistoryAsync(){throw Error('Unexpected uncached migration');},runtimeDiagnosticsActive:()=>false,recordRuntimeDiagnostic(){},invalidateSessionContent:invalidate};
 const service=require('node:vm').runInNewContext(stripTypeScriptTypes(restoreProgram,{mode:'transform'}),restoreContext);
 const structuralBefore=cloneHistoryDocument(first);structuralBefore.filePath='D:/history/native-structural.moonsprite';
 const structuralAfter=cloneHistoryDocument(structuralBefore);const newLayer=modelModule.createLayer('Structural layer',first.width,first.height,'rgba');newLayer.pixels[0]=17;newLayer.pixels[3]=255;structuralAfter.layers.push(newLayer);structuralAfter.activeLayerId=newLayer.id;animationModule.syncActiveAnimationLayers(structuralAfter);assert.equal(compileLocalHistoryDelta(structuralBefore,structuralAfter,'add layer'),null);
 const structuralKey=service.historyId(structuralBefore);const structuralManifest={version:4,projectKey:structuralKey,labels:['add layer'],position:1};
 const structuralPacked=archiveModule.packLocalHistory({manifest:structuralManifest,snapshots:[encodeProject(structuralBefore),encodeProject(structuralAfter)],cachedDeltas:[null]});
 const reopened=decodeProject(encodeProject(structuralAfter));reopened.id='fresh-runtime-id';reopened.filePath=structuralBefore.filePath;reopened.sourceFilePath='fallback-source';const authoritative={...reopened.timelapse,snapshots:[{id:'saved-frame',data:new Uint8Array([1,2,3]),width:1,height:1,capturedAt:1,elapsedMs:0}]};reopened.timelapse=authoritative;
 const session={document:reopened,history:new HistoryStack(),revision:0,contentRevision:0,layersPanelRevision:0};
 assert.equal(await service.restoreLocalHistory({readLocalHistory:async()=>structuralPacked.archive},session),true);assert.equal(reopened.timelapse,authoritative);assert.equal(reopened.id,'fresh-runtime-id');assert.equal(reopened.filePath,structuralBefore.filePath);assert.equal(reopened.sourceFilePath,'fallback-source');assert.equal(session.history.length,1);assert.equal(session.history.position,1);assert.equal(session.revision,1);assert.equal(reopened.dirty,false);
 session.history.undo();assert.equal(reopened.layers.length,structuralBefore.layers.length);assert.equal(reopened.id,'fresh-runtime-id');assert.equal(reopened.filePath,structuralBefore.filePath);assert.notEqual(reopened.timelapse,authoritative);assert.equal(reopened.timelapse.snapshots.length,0);assert.equal(authoritative.snapshots.length,1);const structuralUndoRecordingSnapshotCount=reopened.timelapse.snapshots.length;
 session.history.redo();assert.equal(reopened.layers.length,structuralAfter.layers.length);assert.equal(reopened.activeLayerId,structuralAfter.activeLayerId);assert.equal(reopened.id,'fresh-runtime-id');
 const structuralDirectory=path.join(out,'structural-restore');fs.mkdirSync(structuralDirectory,{recursive:true});fs.writeFileSync(path.join(structuralDirectory,'history.history'),structuralPacked.archive);fs.writeFileSync(path.join(structuralDirectory,'before.moonsprite'),encodeProject(structuralBefore));fs.writeFileSync(path.join(structuralDirectory,'after.moonsprite'),encodeProject(structuralAfter));fs.writeFileSync(path.join(structuralDirectory,'expectations.json'),JSON.stringify({key:structuralKey,labels:structuralManifest.labels,position:1,beforeLayerIds:structuralBefore.layers.map(layer=>layer.id),afterLayerIds:structuralAfter.layers.map(layer=>layer.id),initialRecordingPreserved:true,structuralUndoRecordingSnapshotCount,entryBytes:session.history.memoryBytes}));
 console.log('Actual legacy restore service structural/identity/initial recording and navigation semantics passed');
 // Independent actual-service reference for a retained window whose other
 // structural checkpoints must never be decoded by the native restorer.
 const windowDirectory=path.join(out,'structural-window');fs.mkdirSync(windowDirectory,{recursive:true});
 const windowStates=Array.from({length:7},(_,index)=>{const value=cloneHistoryDocument(index%2?structuralAfter:structuralBefore);value.name='checkpoint '+index;return value;});
 const windowManifest={version:4,projectKey:structuralKey,labels:Array.from({length:6},(_,i)=>'structural '+i),position:4};
 const windowPacked=archiveModule.packLocalHistory({manifest:windowManifest,snapshots:windowStates.map(encodeProject),cachedDeltas:Array(6).fill(null)});
 restoreEntryLimit=2;const windowReopened=decodeProject(encodeProject(windowStates[4]));windowReopened.filePath=structuralBefore.filePath;
 const windowSession={document:windowReopened,history:new HistoryStack(),revision:0,contentRevision:0,layersPanelRevision:0};assert.equal(await service.restoreLocalHistory({readLocalHistory:async()=>windowPacked.archive},windowSession),true);
 assert.equal(windowSession.history.length,2);assert.equal(windowSession.history.position,0);assert.equal(windowReopened.name,windowStates[4].name);windowSession.history.redo();assert.equal(windowReopened.name,windowStates[5].name);const firstWindowEntryBytes=windowSession.history.latestUndoEntry.bytes;windowSession.history.redo();assert.equal(windowReopened.name,windowStates[6].name);const secondWindowEntryBytes=windowSession.history.latestUndoEntry.bytes;
 fs.writeFileSync(path.join(windowDirectory,'history.history'),windowPacked.archive);fs.writeFileSync(path.join(windowDirectory,'expectations.json'),JSON.stringify({key:structuralKey,position:4,limit:2,retainedPosition:0,decoded:3,entryBytes:[firstWindowEntryBytes,secondWindowEntryBytes]}));windowStates.forEach((value,index)=>fs.writeFileSync(path.join(windowDirectory,index+'.moonsprite'),encodeProject(value)));restoreEntryLimit=10;
 // Full checkpoint -> byte increment -> structural checkpoint -> byte
 // increment. Cached labels deliberately differ from manifest labels.
 const mixedDirectory=path.join(out,'mixed-restore');fs.mkdirSync(mixedDirectory,{recursive:true});
 const mixedStates=[cloneHistoryDocument(first),cloneHistoryDocument(middle)];mixedStates[0].filePath=structuralBefore.filePath;mixedStates[1].filePath=structuralBefore.filePath;
 const mixedStructural=cloneHistoryDocument(mixedStates[1]);const mixedLayer=modelModule.createLayer('Mixed structure',first.width,first.height,'rgba');mixedLayer.pixels[0]=45;mixedLayer.pixels[3]=255;mixedStructural.layers.push(mixedLayer);mixedStructural.activeLayerId=mixedLayer.id;animationModule.syncActiveAnimationLayers(mixedStructural);mixedStates.push(mixedStructural);
 const mixedLast=cloneHistoryDocument(mixedStructural);mixedLast.layers[0].pixels[0]=0xffaabbcc;mixedStates.push(mixedLast);
 const mixedDeltas=[compileLocalHistoryDelta(mixedStates[0],mixedStates[1],'cached first'),null,compileLocalHistoryDelta(mixedStates[2],mixedStates[3],'cached last')];assert(mixedDeltas[0]&&mixedDeltas[2]);
 const mixedManifest={version:4,projectKey:structuralKey,labels:['manifest first','manifest structure','manifest last'],position:1};
 const mixedPacked=archiveModule.packLocalHistory({manifest:mixedManifest,snapshots:mixedStates.map(encodeProject),cachedDeltas:mixedDeltas.map(delta=>delta?encodeHistoryDelta(delta):null),incrementalDeltas:[null,mixedDeltas[0],null,mixedDeltas[2]]});
 const mixedReopened=decodeProject(encodeProject(mixedStates[1]));mixedReopened.filePath=structuralBefore.filePath;const mixedSession={document:mixedReopened,history:new HistoryStack(),revision:0,contentRevision:0,layersPanelRevision:0};assert.equal(await service.restoreLocalHistory({readLocalHistory:async()=>mixedPacked.archive},mixedSession),true);mixedSession.history.redo();mixedSession.history.redo();assert.deepEqual(rasterState(mixedReopened),rasterState(mixedStates[3]));mixedSession.history.undo();mixedSession.history.undo();mixedSession.history.undo();assert.deepEqual(rasterState(mixedReopened),rasterState(mixedStates[0]));
 fs.writeFileSync(path.join(mixedDirectory,'history.history'),mixedPacked.archive);fs.writeFileSync(path.join(mixedDirectory,'expectations.json'),JSON.stringify({key:structuralKey,position:1,decoded:2}));mixedStates.forEach((value,index)=>fs.writeFileSync(path.join(mixedDirectory,index+'.moonsprite'),encodeProject(value)));
 console.log('Actual legacy retained structural window and mixed incremental/structural restore navigation passed');
 const frameDirectory=path.join(out,'viewed-frame-restore');fs.mkdirSync(frameDirectory,{recursive:true});
 const frameBefore=decodeProject(new Uint8Array(fs.readFileSync(path.join(out,'inactive','before.moonsprite'))));const frameAfter=decodeProject(new Uint8Array(fs.readFileSync(path.join(out,'inactive','after.moonsprite'))));const frameDelta=decodeHistoryDelta(new Uint8Array(fs.readFileSync(path.join(out,'inactive','delta.zip'))));
 frameBefore.filePath=structuralBefore.filePath;frameAfter.filePath=structuralBefore.filePath;const viewed=frameDelta.celTarget.frameId;assert.notEqual(viewed,frameDelta.snapshotFrameId);
 for(const incremental of [false,true]){const packed=archiveModule.packLocalHistory({manifest:{version:4,projectKey:structuralKey,labels:['frame entry'],position:1},snapshots:[encodeProject(frameBefore),encodeProject(frameAfter)],cachedDeltas:[encodeHistoryDelta(frameDelta)],...(incremental?{incrementalDeltas:[null,frameDelta]}:{})});const reopened=decodeProject(encodeProject(frameAfter));reopened.filePath=structuralBefore.filePath;reopened.animation.activeFrameId=viewed;animationModule.projectHistoryAnimationFrame(reopened);const session={document:reopened,history:new HistoryStack(),revision:0,contentRevision:0,layersPanelRevision:0};assert.equal(await service.restoreLocalHistory({readLocalHistory:async()=>packed.archive},session),true);assert.equal(reopened.animation.activeFrameId,incremental?viewed:frameAfter.animation.activeFrameId);session.history.undo();assert.deepEqual(rasterState(reopened),rasterState(frameBefore));session.history.redo();assert.deepEqual(rasterState(reopened),rasterState(frameAfter));fs.writeFileSync(path.join(frameDirectory,incremental?'incremental.history':'full.history'),packed.archive);}
 fs.writeFileSync(path.join(frameDirectory,'after.moonsprite'),encodeProject(frameAfter));fs.writeFileSync(path.join(frameDirectory,'expectations.json'),JSON.stringify({key:structuralKey,viewed,snapshotFrameId:frameAfter.animation.activeFrameId}));
 console.log('Actual legacy initial viewed frame retention requires incremental celTarget snapshot');
 // Exercise real restore while readLocalHistory is suspended. The saved
 // fingerprint is evaluated against the still-live initial document reference.
 const asyncFrameRows=[];
 for(const savedFingerprint of [false,true]){const reopened=decodeProject(encodeProject(frameAfter));reopened.filePath=structuralBefore.filePath;const manifest={version:4,projectKey:structuralKey,labels:['frame entry'],position:1,...(savedFingerprint?{documentFingerprint:service.documentFingerprint(reopened)}:{})};
 const packed=archiveModule.packLocalHistory({manifest,snapshots:[encodeProject(frameBefore),encodeProject(frameAfter)],cachedDeltas:[encodeHistoryDelta(frameDelta)],incrementalDeltas:[null,frameDelta]});
 let releaseRead;const reading=new Promise(resolve=>{releaseRead=resolve;});const session={document:reopened,history:new HistoryStack(),revision:0,contentRevision:0,layersPanelRevision:0};const restoring=service.restoreLocalHistory({readLocalHistory:()=>reading},session);reopened.animation.activeFrameId=viewed;animationModule.projectHistoryAnimationFrame(reopened);releaseRead(packed.archive);const restored=await restoring;assert.equal(restored,!savedFingerprint);assert.equal(reopened.animation.activeFrameId,viewed);asyncFrameRows.push({savedFingerprint,restored});}
 fs.writeFileSync(path.join(frameDirectory,'async-expectations.json'),JSON.stringify(asyncFrameRows));
 console.log('Actual legacy deferred read allows frame-only navigation without fingerprint; saved fingerprint includes live viewed frame');
 const propertyDirectory=path.join(out,'compiled-properties');fs.mkdirSync(propertyDirectory,{recursive:true});
 const propertyBefore=cloneHistoryDocument(first);propertyBefore.name='property before';propertyBefore.layers[0].description='before note';propertyBefore.layers[0].clippingMask=false;propertyBefore.layers[0].autoLinkAnimationCels=false;propertyBefore.animation.frames[0].disabled=false;
 propertyBefore.groups=[{id:'history-property-group',name:'Group before',description:'group note',visible:true,locked:false,opacity:1,blendMode:'normal',clippingMask:false,cumulativeBlend:false}];propertyBefore.layers[0].groupId=propertyBefore.groups[0].id;
 const propertyAfter=cloneHistoryDocument(propertyBefore);propertyAfter.name='工程名称🧩'+ '长'.repeat(120);propertyAfter.animation.loop=!propertyBefore.animation.loop;propertyAfter.displaySettings.showPixelGrid=!propertyBefore.displaySettings.showPixelGrid;propertyAfter.displaySettings.showGrid=!propertyBefore.displaySettings.showGrid;propertyAfter.displaySettings.grid={x:-7,y:9,width:23,height:31};Object.assign(propertyAfter.layers[0],{name:'图层😀',description:'layer description'.repeat(20),visible:false,locked:true,autoLinkAnimationCels:true,clippingMask:true});Object.assign(propertyAfter.groups[0],{name:'组🧩',description:'group description'.repeat(16),visible:false,locked:true,clippingMask:true,cumulativeBlend:true});Object.assign(propertyAfter.animation.frames[0],{duration:1350,disabled:true});
 const propertyDelta=compileLocalHistoryDelta(propertyBefore,propertyAfter,'property delta');assert(propertyDelta);assert.equal(propertyDelta.patches.length,22);const propertyLive=cloneHistoryDocument(propertyBefore);const propertyEntry=hydrateLocalHistoryDelta(propertyLive,propertyDelta);
 const properties=d=>({name:d.name,loop:d.animation.loop,pixelGrid:d.displaySettings.showPixelGrid,showGrid:d.displaySettings.showGrid,grid:d.displaySettings.grid,layers:d.layers.map(l=>({id:l.id,name:l.name,description:l.description,visible:l.visible,locked:l.locked,autoLink:l.autoLinkAnimationCels,clipping:l.clippingMask})),groups:d.groups.map(g=>({id:g.id,name:g.name,description:g.description,visible:g.visible,locked:g.locked,clipping:g.clippingMask,cumulative:g.cumulativeBlend})),frames:d.animation.frames.map(f=>({id:f.id,duration:f.duration,disabled:f.disabled}))});
 propertyEntry.redo();assert.deepEqual(properties(propertyLive),properties(propertyAfter));propertyEntry.undo();assert.deepEqual(properties(propertyLive),properties(propertyBefore));
 for(const [name,value] of [['before',propertyBefore],['after',propertyAfter]])fs.writeFileSync(path.join(propertyDirectory,name+'.moonsprite'),encodeProject(value));fs.writeFileSync(path.join(propertyDirectory,'delta.zip'),encodeHistoryDelta(propertyDelta));fs.writeFileSync(path.join(propertyDirectory,'expectations.json'),JSON.stringify({before:properties(propertyBefore),after:properties(propertyAfter)}));
 const propertyPacked=archiveModule.packLocalHistory({manifest:{version:4,projectKey:structuralKey,labels:['property archive'],position:1},snapshots:[encodeProject(propertyBefore),encodeProject(propertyAfter)],cachedDeltas:[encodeHistoryDelta(propertyDelta)],incrementalDeltas:[null,propertyDelta]});fs.writeFileSync(path.join(propertyDirectory,'history.history'),propertyPacked.archive);fs.writeFileSync(path.join(propertyDirectory,'key.txt'),structuralKey);
 const propertyAliasBefore=cloneHistoryDocument(propertyBefore);propertyAliasBefore.name='alias old';propertyAliasBefore.updatedAt='alias old';propertyAliasBefore.layers[0].description='alias old';const propertyAliasLive=cloneHistoryDocument(propertyAliasBefore);const aliasText='共享值🧩';const propertyAliasDelta={...propertyDelta,label:'cross encoding alias',bytes:300,patches:[{path:['name'],aliases:[['name'],['layers','0','description'],['updatedAt']],before:'alias old',after:aliasText},{path:['name'],before:aliasText,after:'final name'}]};const propertyAliasEntry=hydrateLocalHistoryDelta(propertyAliasLive,propertyAliasDelta);propertyAliasEntry.redo();assert.equal(propertyAliasLive.name,'final name');assert.equal(propertyAliasLive.updatedAt,aliasText);assert.equal(propertyAliasLive.layers[0].description,aliasText);propertyAliasEntry.undo();assert.equal(propertyAliasLive.name,'alias old');assert.equal(propertyAliasLive.updatedAt,'alias old');assert.equal(propertyAliasLive.layers[0].description,'alias old');fs.writeFileSync(path.join(propertyDirectory,'alias-before.moonsprite'),encodeProject(propertyAliasBefore));fs.writeFileSync(path.join(propertyDirectory,'alias.zip'),encodeHistoryDelta(propertyAliasDelta));fs.writeFileSync(path.join(propertyDirectory,'alias-expectations.json'),JSON.stringify({before:'alias old',after:aliasText,name:'final name'}));
 console.log('Actual legacy compile/hydrate name, display grid, loop, layer/group flags and frame property delta passed');
 const numericProperties=d=>({frame:d.animation.activeFrameId,layers:d.layers.map(l=>({id:l.id,opacity:l.opacity,blend:l.blendMode})),groups:d.groups.map(g=>({id:g.id,opacity:g.opacity,blend:g.blendMode})),cels:d.animation.cels.map(c=>({id:c.id,opacity:c.opacity,zIndex:c.zIndex}))});
 for(const mode of ['ordinary','linked','boundary']){
 const linked=mode==='linked',boundary=mode==='boundary';
 const directory=path.join(out,boundary?'compiled-numeric-boundary':linked?'compiled-numeric-linked':'compiled-numeric');fs.mkdirSync(directory,{recursive:true});const before=cloneHistoryDocument(propertyBefore);const layer=modelModule.createLayer('Numeric second',first.width,first.height,'rgba');layer.pixels[0]=128;layer.pixels[3]=255;before.layers.push(layer);animationModule.syncActiveAnimationLayers(before);animationModule.addBlankAnimationFrame(before);
 if(linked){
  // Only a source cel containing visible content can begin a legacy link.
  assert(animationModule.linkAnimationFrameCels(before,before.animation.frames[0].id,before.animation.frames[1].id,[layer.id]));
  const target=before.animation.cels.find(c=>c.layerId===layer.id&&c.frameId===before.animation.frames[1].id);
  const source=before.animation.cels.find(c=>c.layerId===layer.id&&c.frameId===before.animation.frames[0].id);
  assert.equal(target.linkedCelId,source.id);assert.equal(resolveAnimationCel(before.animation,target).id,source.id);
 }
 const ownerIds=[...new Set(before.animation.cels.map(c=>resolveAnimationCel(before.animation,c).id))];for(const c of before.animation.cels){const i=ownerIds.indexOf(resolveAnimationCel(before.animation,c).id);c.opacity=.2+i*.1;c.zIndex=i;}
 animationModule.projectHistoryAnimationFrame(before);const after=cloneHistoryDocument(before);for(const c of after.animation.cels){c.opacity+=.07;c.zIndex-=5;}after.layers[0].blendMode='multiply';after.layers[1].blendMode='screen';after.groups[0].opacity=.61;after.groups[0].blendMode='overlay';animationModule.projectHistoryAnimationFrame(after);
 if(boundary){const values=[1000,-1000,2147483647,-2147483648];after.animation.cels.forEach((c,i)=>{c.zIndex=values[i];c.opacity=i%2;});after.groups[0].opacity=0;animationModule.projectHistoryAnimationFrame(after);assert.deepEqual(after.animation.cels.map(c=>c.zIndex),values);}
 const delta=compileLocalHistoryDelta(before,after,'numeric properties');assert(delta);assert(delta.patches.some(p=>p.path.join('.')==='animation.cels.0.opacity'));assert(delta.patches.some(p=>p.path.join('.')==='layers.0.opacity'));const live=cloneHistoryDocument(before);const entry=hydrateLocalHistoryDelta(live,delta);entry.redo();assert.deepEqual(numericProperties(live),numericProperties(after));entry.undo();assert.deepEqual(numericProperties(live),numericProperties(before));
 const encodedBefore=encodeProject(cloneHistoryDocument(before)),encodedAfter=encodeProject(cloneHistoryDocument(after));
 fs.writeFileSync(path.join(directory,'before.moonsprite'),encodedBefore);fs.writeFileSync(path.join(directory,'after.moonsprite'),encodedAfter);fs.writeFileSync(path.join(directory,'delta.zip'),encodeHistoryDelta(delta));
 const targeted={...delta,label:'targeted numeric',celTarget:{index:0,id:before.animation.cels[0].id,layerId:before.animation.cels[0].layerId,frameId:before.animation.cels[0].frameId},snapshotFrameId:before.animation.activeFrameId,patches:delta.patches.filter(p=>p.path[0]==='animation'&&p.path[1]==='cels')};const targetedLive=cloneHistoryDocument(before);const targetedEntry=hydrateLocalHistoryDelta(targetedLive,targeted);targetedEntry.redo();const targetedAfter=numericProperties(targetedLive);targetedEntry.undo();assert.deepEqual(numericProperties(targetedLive),numericProperties(before));fs.writeFileSync(path.join(directory,'targeted.zip'),encodeHistoryDelta(targeted));
 const decodedAfter=decodeProject(encodedAfter);const encodedProperties=numericProperties(decodedAfter);for(const c of encodedProperties.cels)c.zIndex??=0;
 if(boundary)assert.deepEqual(encodedProperties.cels.map(c=>c.zIndex),[999,-999,999,-999]);
 fs.writeFileSync(path.join(directory,'expectations.json'),JSON.stringify({before:numericProperties(before),after:numericProperties(after),targetedAfter,encodedAfter:encodedProperties}));
 const packed=archiveModule.packLocalHistory({manifest:{version:4,projectKey:structuralKey,labels:['numeric archive'],position:1},snapshots:[encodedBefore,encodedAfter],cachedDeltas:[encodeHistoryDelta(delta)],incrementalDeltas:[null,delta]});fs.writeFileSync(path.join(directory,'history.history'),packed.archive);fs.writeFileSync(path.join(directory,'key.txt'),structuralKey);
 }
 console.log('Actual legacy opacity/blend/cel zIndex, linked-owner and celTarget projection property references passed');
 // Use the exact multiframe input and 120-edit/117-trim scenario from the
 // legacy budget regression. Only fixture creation is extracted; budget,
 // capture, materialization and document byte costing are actual modules.
 const budgetModule=await source('local-history-budget.ts'),budgetDelta=await source('local-history-delta.ts'),budgetHistory=await source('history.ts');
 const budgetText=fs.readFileSync(path.join(legacy,'src/renderer/src/store/local-history-multiframe.test.ts'),'utf8');
 const budgetStart=budgetText.indexOf('export function multiframeFixture('),budgetEnd=budgetText.indexOf('\n}\n',budgetStart);assert(budgetStart>=0&&budgetEnd>budgetStart);
 const budgetFactory=require('node:vm').runInNewContext(stripTypeScriptTypes('('+budgetText.slice(budgetStart,budgetEnd+2).replace('export function','function')+')',{mode:'transform'}),{createDocument:modelModule.createDocument,createLayer:modelModule.createLayer,refreshActiveAnimationFrame:animationModule.refreshActiveAnimationFrame});
 const budgetDirectory=path.join(out,'compiled-budget');fs.mkdirSync(budgetDirectory,{recursive:true});
 const budgetDocument=budgetFactory(),budgetBase=cloneHistoryDocument(budgetDocument),budgetNodes=[budgetBase],nodeIds=new Map([[budgetBase,0]]),nodeRows=[];
 const budgetEncode=document=>encodeProject(cloneHistoryDocument(document));
 const budgetBaseArchive=budgetEncode(budgetBase);fs.writeFileSync(path.join(budgetDirectory,'baseline.moonsprite'),budgetBaseArchive);
 nodeRows.push({kind:'document',file:'baseline.moonsprite',weight:budgetDelta.historyDocumentBytes(budgetBase)});
 for(let i=1;i<=120;i++){
  const layer=budgetDocument.layers[0],edit=budgetHistory.beginPixelEdit(layer.id);budgetHistory.recordPixel(budgetDocument,layer,edit,101,0xff000000+i);
  const entry=budgetHistory.commitPixelEdit(budgetDocument,edit,'paint',true),delta=captureCommittedHistoryDelta(budgetDocument,entry);assert(delta);
  const snapshot={base:budgetNodes.at(-1),delta};nodeIds.set(snapshot,budgetNodes.length);budgetNodes.push(snapshot);
  const file='delta-'+i+'.zip';fs.writeFileSync(path.join(budgetDirectory,file),encodeHistoryDelta(delta));nodeRows.push({kind:'increment',base:i-1,file});
 }
 const archiveBytes=budgetBaseArchive,archiveNode={archive:archiveBytes},archiveTwin={archive:archiveBytes};
 for(const snapshot of [archiveNode,archiveTwin]){nodeIds.set(snapshot,budgetNodes.length);budgetNodes.push(snapshot);nodeRows.push({kind:'archive',file:'baseline.moonsprite'});}
 const budgetCases=[];
 for(const spec of [
  {name:'exact',roots:[117,118,119,120],threshold:'equal'},
  {name:'trim117',roots:[117,118,119,120],threshold:'below'},
  {name:'duplicates',roots:[117,118,118,119,120,120],threshold:'below'},
  {name:'out-of-order',roots:[118,120,117,119],threshold:'below'},
  {name:'document-pressure',roots:[0,1,2],threshold:0},
  {name:'archive-shared',roots:[121,121,122],threshold:0},
  {name:'empty',roots:[],threshold:0}
 ]){
  const original=spec.roots.map(i=>budgetNodes[i]),before=budgetModule.localHistoryRetainedBytes(original),budget=spec.threshold==='equal'?before:spec.threshold==='below'?before-1:spec.threshold;
  const state={snapshots:[...original],labels:original.slice(1).map((_,i)=>'visible-'+i),position:Math.min(2,Math.max(0,original.length-1))};
  const labels=[...state.labels],position=state.position,replacements=budgetModule.enforceLocalHistoryBudget(state,budget);assert.deepEqual(state.labels,labels);assert.equal(state.position,position);
  const fresh=new Map(),references=snapshot=>nodeIds.has(snapshot)?{old:nodeIds.get(snapshot)}:fresh.has(snapshot)?{fresh:fresh.get(snapshot)}:(()=>{const id=fresh.size;fresh.set(snapshot,id);return {fresh:id};})();
  state.snapshots.forEach(references);
  const describe=snapshot=>{const ref=references(snapshot);if('old' in ref)return ref;if('base' in snapshot)return {...ref,kind:'increment',base:references(snapshot.base),deltaNode:nodeIds.get(original.find(n=>'base' in n&&n.delta===snapshot.delta))};return {...ref,kind:'document'};};
  const row={...spec,budget,before,after:budgetModule.localHistoryRetainedBytes(state.snapshots),labels,position,rootsAfter:state.snapshots.map(describe),replacementKeys:[...replacements.keys()].map(n=>nodeIds.get(n))};
  if(replacements.size){const checkpoint=state.snapshots[0];assert(!('base' in checkpoint));const file=spec.name+'-checkpoint.moonsprite';fs.writeFileSync(path.join(budgetDirectory,file),budgetEncode(checkpoint));row.checkpoint={file,weight:budgetDelta.historyDocumentBytes(checkpoint),pixel:modelModule.readLayerPacked(checkpoint,checkpoint.layers[0],101)};const final=archiveModule.materializeLocalHistorySnapshot(state.snapshots.at(-1));row.finalPixel=modelModule.readLayerPacked(final,final.layers[0],101);}
  budgetCases.push(row);
 }
 assert.equal(budgetCases.find(c=>c.name==='trim117').checkpoint.pixel,0xff000075);assert.equal(budgetCases.find(c=>c.name==='trim117').finalPixel,0xff000078);assert(budgetCases.find(c=>c.name==='trim117').after<budgetCases.find(c=>c.name==='trim117').before);
 fs.writeFileSync(path.join(budgetDirectory,'expectations.json'),JSON.stringify({nodes:nodeRows,cases:budgetCases}));
 console.log('Actual legacy 120-edit/117-trim snapshot budget, identity graph and immutable rebase references passed');
 const incrementalStart=serviceText.indexOf('const incrementalDeltas = snapshots.map('),incrementalEnd=serviceText.indexOf('\n',incrementalStart);assert(incrementalStart>=0&&incrementalEnd>incrementalStart);
 const incrementalPlan=require('node:vm').runInNewContext('(snapshots)=>{'+stripTypeScriptTypes(serviceText.slice(incrementalStart,incrementalEnd),{mode:'transform'})+';return incrementalDeltas;}');
 const generationCases=[];
 for(const roots of [[0,1,2,3],[117,118,119,120],[0,2,3],[121,121,122],[0,1,0,1],[0]]){
  const snapshots=roots.map(index=>budgetNodes[index]),increments=incrementalPlan(snapshots);generationCases.push({roots,incremental:increments.map(Boolean),encode:roots.filter((_,index)=>!increments[index]&&!('archive' in snapshots[index])),compile:roots.slice(1).flatMap((id,index)=>increments[index+1]?[]:[[roots[index],id]])});
 }
 fs.writeFileSync(path.join(budgetDirectory,'generation-plan.json'),JSON.stringify(generationCases));
 const ackStart=serviceText.indexOf('const live = session.localHistory',serviceText.indexOf('const writeHistoryGeneration =')),ackEnd=serviceText.indexOf('\n  } catch (error)',ackStart);assert(ackStart>=0&&ackEnd>ackStart);
 const ackCases=[];
 for(const spec of [{name:'trim-tail',roots:[117,118,119,120],record:[117,118,119],encoded:[0]},{name:'branched',roots:[117,118,120],record:[117,118,119],encoded:[0,2]},{name:'advanced-first',roots:[118,119,120],record:[117,118,119],encoded:[0]},{name:'pressure',roots:[0,1,2,3],record:[0,1,2],encoded:[0],pressured:true},{name:'no-pressure',roots:[0,1],record:[0,1],encoded:[0]}]){
  const live={snapshots:spec.roots.map(id=>budgetNodes[id]),labels:spec.roots.slice(1).map((_,i)=>'entry'+i),position:1},snapshots=spec.record.map(id=>budgetNodes[id]),record={snapshots:[...snapshots]},archives=snapshots.map((_,i)=>spec.encoded.includes(i)?new Uint8Array([i+1,7]):new Uint8Array()),pressuredStates=new WeakSet(),snapshotShapes=new WeakMap(),deltaCaches=new WeakMap();
  if(spec.pressured)pressuredStates.add(live);live.snapshots.forEach((node,i)=>snapshotShapes.set(node,'shape-'+spec.roots[i]));for(let i=0;i+1<live.snapshots.length;++i){let inner=deltaCaches.get(live.snapshots[i]);if(!inner){inner=new WeakMap();deltaCaches.set(live.snapshots[i],inner);}inner.set(live.snapshots[i+1],i%2?null:new Uint8Array([10+i]));}
  const ack=require('node:vm').runInNewContext(stripTypeScriptTypes('(session,snapshots,archives,record)=>{'+serviceText.slice(ackStart,ackEnd)+'}',{mode:'transform'}),{Map,pressuredStates,snapshotShapes,deltaCaches,cacheDelta:(a,b,value)=>{let inner=deltaCaches.get(a);if(!inner){inner=new WeakMap();deltaCaches.set(a,inner);}inner.set(b,value);},localHistoryRetainedBytes:budgetModule.localHistoryRetainedBytes,LOCAL_HISTORY_SNAPSHOT_BUDGET:256*1024*1024});
  ack({localHistory:live},snapshots,archives,record);
  const fresh=new Map(),describe=node=>nodeIds.has(node)?{old:nodeIds.get(node)}:fresh.has(node)?{fresh:fresh.get(node)}:(()=>{const id=fresh.size;fresh.set(node,id);return 'archive' in node?{fresh:id,kind:'archive',bytes:[...node.archive]}:{fresh:id,kind:'increment',base:describe(node.base),delta:budgetNodes.findIndex(n=>'base' in n&&n.delta===node.delta)};})();
  ackCases.push({...spec,after:live.snapshots.map(describe),recordAfter:record.snapshots.map(describe),labels:live.labels,position:live.position,pressureAfter:pressuredStates.has(live),shapes:live.snapshots.map(n=>snapshotShapes.get(n)),cache:live.snapshots.slice(1).map((n,i)=>{const value=deltaCaches.get(live.snapshots[i])?.get(n);return value===undefined?'missing':value===null?null:[...value];})});
 }
 fs.writeFileSync(path.join(budgetDirectory,'acknowledgements.json'),JSON.stringify(ackCases));console.log('Actual legacy successful-write rebase: tail edit, branch, advanced first, pressure and cache/shape transfer passed');


 // Execute the real service event switch and trim logic. Only preferences,
 // diagnostics and the capture boundary are injected; captures use real
 // legacy committed entries, clones and the actual budget/rebase functions.
 const sessionDirectory=path.join(out,'compiled-session');fs.mkdirSync(sessionDirectory,{recursive:true});const sessionCases=[];
 const recordStart=serviceText.indexOf('export const recordLocalHistoryChange ='),recordEnd=serviceText.indexOf('\n}\n',recordStart);assert(recordStart>=0&&recordEnd>recordStart);
 const recordProgram='(()=>{'+functionFragment('trimSnapshots')+';'+serviceText.slice(recordStart,recordEnd+2).replace('export const','const')+';return recordLocalHistoryChange;})()';
 for(const [scenario,threshold] of [['normal',256*1024*1024],['pressure',0]]){
  const directory=path.join(sessionDirectory,scenario);fs.mkdirSync(directory,{recursive:true});
  const shapes=new WeakMap(),pressuredStates=new WeakSet(),ids=new Map(),nodes=[],steps=[];let captureCalls=0,captured=null,inputDelta=null,materialized=null,limit=3,serial=0;
  const identify=node=>{if(ids.has(node))return ids.get(node);const id=nodes.length;ids.set(node,id);nodes.push(null);
   if('base' in node){const file='delta-'+id+'.zip';fs.writeFileSync(path.join(directory,file),encodeHistoryDelta(node.delta));nodes[id]={kind:'increment',base:identify(node.base),file};}
   else {const file='checkpoint-'+id+'.moonsprite';fs.writeFileSync(path.join(directory,file),budgetEncode(node));nodes[id]={kind:'document',file,weight:budgetDelta.historyDocumentBytes(node)};}return id;};
  const captureSnapshot=document=>{captured=cloneHistoryDocument(document);shapes.set(captured,localHistoryDocumentShape(document));return captured;};
  const session={document:cloneHistoryDocument(budgetBase),localHistory:null};session.localHistory={snapshots:[captureSnapshot(session.document)],labels:[],position:0};const initial=identify(captured);
  const context={Math,loadEditorPreferences:()=>({localHistoryEnabled:true,localHistoryLimit:limit}),documentShape:localHistoryDocumentShape,snapshotShapes:shapes,captureSnapshot,
   captureCommittedHistoryDelta:(document,entry)=>{++captureCalls;inputDelta=captureCommittedHistoryDelta(document,entry);return inputDelta;},
   enforceLocalHistoryBudget:state=>{const replacements=budgetModule.enforceLocalHistoryBudget(state,threshold);for(const [before,after] of replacements)if(before!==after&&!('base' in after)&&!('archive' in after))materialized=after;return replacements;},
   localHistoryRetainedBytes:budgetModule.localHistoryRetainedBytes,LOCAL_HISTORY_SNAPSHOT_BUDGET:threshold,pressuredStates,recordRuntimeDiagnostic(){}};
  const record=require('node:vm').runInNewContext(stripTypeScriptTypes(recordProgram,{mode:'transform'}),context);
  const specs=[{kind:'push',paint:true},{kind:'push',paint:true},{kind:'undo'},{kind:'undo'},{kind:'undo'},{kind:'redo'},
   {kind:'push',paint:true},{kind:'push',missing:true},{kind:'push'},{kind:'push',structural:true},{kind:'push',paint:true},
   {kind:'trim',discardedUndoEntries:2},{kind:'undo'},{kind:'trim',discardedRedoEntries:1},{kind:'push',paint:true,discardedUndoEntries:1},
   {kind:'push',paint:true},{kind:'push',paint:true,limit:2},{kind:'clear'},{kind:'undo'},{kind:'redo'},{kind:'push',paint:true}];
  for(const spec of specs){captured=null;inputDelta=null;materialized=null;captureCalls=0;limit=spec.limit??limit;
   const state=session.localHistory;
   if(spec.kind==='undo'||spec.kind==='redo'){const position=spec.kind==='undo'?Math.max(0,state.position-1):Math.min(state.labels.length,state.position+1);session.document=cloneHistoryDocument(archiveModule.materializeLocalHistorySnapshot(state.snapshots[position]));}
   const change={kind:spec.kind,...(spec.discardedUndoEntries?{discardedUndoEntries:spec.discardedUndoEntries}:{}),...(spec.discardedRedoEntries?{discardedRedoEntries:spec.discardedRedoEntries}:{})};
   if(spec.kind==='push'&&!spec.missing){const label='event-'+(++serial);if(spec.paint){const document=session.document,layer=document.layers[0],edit=budgetHistory.beginPixelEdit(layer.id);budgetHistory.recordPixel(document,layer,edit,101,0xff123400+serial);change.entry=budgetHistory.commitPixelEdit(document,edit,label,true);assert(change.entry);}
    else {if(spec.structural){const layer=modelModule.createLayer('Structural '+serial,session.document.width,session.document.height,'rgba');session.document.layers.push(layer);animationModule.syncActiveAnimationLayers(session.document);}change.entry={label};}}
   record(session,change);const after=session.localHistory;
   const row={kind:spec.kind,label:change.entry?.label??null,discardedUndo:spec.discardedUndoEntries??0,discardedRedo:spec.discardedRedoEntries??0,limit,budget:threshold,shape:localHistoryDocumentShape(session.document),captureCalls,checkpoint:captured?identify(captured):null,materialized:materialized?identify(materialized):null,
    roots:after.snapshots.map(identify),labels:[...after.labels],position:after.position,pressured:pressuredStates.has(after)};
   if(inputDelta){const file='input-'+steps.length+'.zip';fs.writeFileSync(path.join(directory,file),encodeHistoryDelta(inputDelta));row.delta=file;}steps.push(row);
  }
  sessionCases.push({name:scenario,initial,initialShape:localHistoryDocumentShape(budgetBase),nodes,steps});
 }
 fs.writeFileSync(path.join(sessionDirectory,'expectations.json'),JSON.stringify(sessionCases));console.log('Actual legacy journal event switch: push/branch/undo/redo/trim/clear, shape gate and budget traces passed');
 const historyEventCases=[];
 for(const maxBytes of [256*1024*1024,1]){
  const history=new budgetHistory.HistoryStack(maxBytes,3),events=[];
  history.setChangeListener(change=>events.push({kind:change.kind,label:change.entry?.label??'',discardedUndo:change.discardedUndoEntries??0,discardedRedo:change.discardedRedoEntries??0,position:history.position,length:history.length}));
  const commands=[{op:'push',label:'A'},{op:'push',label:'B'},{op:'push',label:'C'},{op:'undo'},{op:'redo'},{op:'undo'},{op:'push',label:'D'},{op:'push',label:'E'},{op:'undo'},{op:'undo'},{op:'limit',value:1},{op:'clear'},{op:'undo'},{op:'redo'},{op:'push',label:'F'},{op:'clear'},{op:'clear'},{op:'compound',label:'compound'},{op:'undo'},{op:'redo'}];
  const entry=label=>({label,bytes:2,undo(){},redo(){}});
  for(const command of commands){if(command.op==='push')history.push(entry(command.label));else if(command.op==='limit')history.setMaxEntries(command.value);else if(command.op==='compound'){history.beginCompound();history.push(entry('child A'));history.push(entry('child B'));history.endCompound(command.label);}else history[command.op]();command.eventCount=events.length;command.position=history.position;command.length=history.length;}
  historyEventCases.push({maxBytes,commands,events});
 }
 fs.writeFileSync(path.join(sessionDirectory,'history-events.json'),JSON.stringify(historyEventCases));console.log('Actual legacy HistoryStack push/undo/redo/trim/clear/compound source event traces passed');


 // Export the actual enumerable transfer graph, not JSON.stringify(document):
 // JSON loses undefined, Map entries, view/backing identity and cycles. The
 // independent expected cost still comes directly from historyDocumentBytes.
 const runtimeModule=await source('runtime-raster.ts');
 const costCases=[];
 const costGraph=(name,document)=>{
  const nodes=[],identities=new Map(),pending=[];
  const reference=value=>{
   const object=value!==null&&typeof value==='object';
   if(object&&identities.has(value))return identities.get(value);
   const id=nodes.length;nodes.push(null);if(object)identities.set(value,id);pending.push([id,value]);return id;
  };
  const root=reference(budgetDelta.historyDocumentTransferView(document));
  for(let i=0;i<pending.length;i++){
   const [id,value]=pending[i];let row;
   if(typeof value==='string')row={kind:'string',utf16:Array.from({length:value.length},(_,j)=>value.charCodeAt(j))};
   else if(!value||typeof value!=='object')row={kind:'primitive'};
   else if(ArrayBuffer.isView(value))row={kind:'view',children:[reference(value.buffer)],viewBytes:value.byteLength,offset:value.byteOffset};
   else if(Object.prototype.toString.call(value)==='[object ArrayBuffer]')row={kind:'buffer',byteLength:value.byteLength};
   else if(value instanceof Map)row={kind:'map',children:[...value].flatMap(([key,item])=>[reference(key),reference(item)])};
   else row={kind:'object',keys:Object.keys(value),children:Object.values(value).map(reference)};
   nodes[id]=row;
  }
  const result={name,root,nodes,bytes:budgetDelta.historyDocumentBytes(document)};costCases.push(result);return result;
 };
 const fullCostDirectory=path.join(out,'compiled-full-document-cost');fs.mkdirSync(fullCostDirectory,{recursive:true});const fullCostRows=[];
 const fullDocumentCase=(name,encoded,decoded,options={})=>{const file=name+'.moonsprite';fs.writeFileSync(path.join(fullCostDirectory,file),encoded);const row=costGraph('full-document-'+name,decoded);fullCostRows.push({file,graphName:row.name,documentId:decoded.id,layerMaskName:decoded.animation.layerMasks[0]?.mask.name??'',groupMaskName:decoded.animation.groupMasks[0]?.mask.name??'',...options});};
 for(const name of ['point','dense','sparse','linked','inactive'])costGraph('decoded-'+name,decodeProject(new Uint8Array(fs.readFileSync(path.join(out,name,'after.moonsprite')))));
 costGraph('multiframe-live',budgetDocument);costGraph('multiframe-checkpoint',budgetBase);
 const costDense=modelModule.createDocument('memory',100,100,'rgba');
 const sharedCost=costGraph('dense-shared',costDense);assert(sharedCost.bytes>=40000&&sharedCost.bytes<80000);
 const detachedCost=cloneHistoryDocument(costDense);detachedCost.animation.cels[0].surface.pixels=detachedCost.layers[0].pixels.slice();
 assert.equal(costGraph('dense-independent-buffer',detachedCost).bytes-sharedCost.bytes,40000);
 const sharedSurfaceCost=cloneHistoryDocument(costDense);sharedSurfaceCost.animation.cels[0].surface=sharedSurfaceCost.layers[0];
 const sharedSurfaceView=budgetDelta.historyDocumentTransferView(sharedSurfaceCost);assert.equal(sharedSurfaceView.layers[0],sharedSurfaceView.animation.cels[0].surface);costGraph('same-surface-object-identity',sharedSurfaceCost);
 const utf16Document=cloneHistoryDocument(costDense);utf16Document.name+='中文😀\ud800';
 assert.equal(costGraph('utf16-and-unpaired-surrogate',utf16Document).bytes-sharedCost.bytes,10);
 const indexedCost=modelModule.createDocument('indexed',3,2,'indexed');costGraph('indexed-live',indexedCost);
 // Exact sparseHistoryDocument input from local-history-delta.test.ts, with
 // actual runtime installation/alias helpers and no getter invocation.
 const sparseCost=modelModule.createDocument('sparse baseline',1,1,'rgba');sparseCost.width=sparseCost.height=4000;
 const sparseLayer=sparseCost.layers[0];sparseLayer.width=sparseLayer.height=4000;
 const costOffsets=new Int32Array(63*63);costOffsets[0]=1;const costData=new Uint8Array(64*64*4);costData.set([1,2,3,255]);
 runtimeModule.installRuntimeRaster(sparseLayer,{kind:'sparse-tiles-v1',format:'rgba',width:4000,height:4000,tileSize:64,tileOffsets:costOffsets,data:costData});
 const sparseSurface=sparseCost.animation.cels[0].surface;sparseSurface.width=sparseSurface.height=4000;runtimeModule.assignRasterStorage(sparseSurface,sparseLayer);
 const sparseGetter=Object.getOwnPropertyDescriptor(sparseLayer,'pixels').get;
 assert(costGraph('sparse-4k-shared-runtime',sparseCost).bytes<100000);
 assert.equal(runtimeModule.surfacePixelsMaterialized(sparseLayer),false);assert.equal(runtimeModule.surfacePixelsMaterialized(sparseSurface),false);assert.equal(Object.getOwnPropertyDescriptor(sparseLayer,'pixels').get,sparseGetter);
 const sparseTransfer=budgetDelta.historyDocumentTransferView(sparseCost);assert.equal(sparseTransfer.layers[0].pixels.byteLength,4);assert.equal(sparseTransfer.animation.cels[0].surface.pixels.byteLength,4);
 assert.notEqual(sparseTransfer.layers[0].pixels.buffer,sparseTransfer.animation.cels[0].surface.pixels.buffer);assert.equal(sparseTransfer.layers[0].runtimeRaster,sparseTransfer.animation.cels[0].surface.runtimeRaster);
 // A materialized surface's stale runtime metadata must be omitted. Use a
 // tiny runtime here so checking this branch never expands the 4k fixture.
 const staleCost=modelModule.createDocument('stale runtime',1,1,'rgba'),staleLayer=staleCost.layers[0];
 runtimeModule.installRuntimeRaster(staleLayer,{kind:'sparse-tiles-v1',format:'rgba',width:1,height:1,tileSize:64,tileOffsets:new Int32Array([1]),data:new Uint8Array([1,2,3,255])});
 void staleLayer.pixels;assert(staleLayer.runtimeRaster);assert.equal(budgetDelta.historyDocumentTransferView(staleCost).layers[0].runtimeRaster,undefined);costGraph('materialized-stale-runtime',staleCost);
 // Explicit semantic probes augment real documents; their arbitrary property
 // names are diagnostic only and must never be counted as string values.
 const probeCost=modelModule.createDocument('graph probes',1,1,'rgba'),probeBuffer=new ArrayBuffer(257),probeKey={value:'重复😀'};
 const probeMap=new Map([[probeKey,new Uint8Array(probeBuffer,32,1)],['second',probeKey]]),probeArray=[];probeArray[3]=undefined;
 probeCost.costProbe={first:new DataView(probeBuffer,250,0),second:new Uint32Array(probeBuffer,0,2),map:probeMap,array:probeArray,nullValue:null,falseValue:false,number:NaN};
 probeCost.costProbe.self=probeCost.costProbe;probeMap.set(probeMap,probeCost.costProbe);
 const hiddenSymbol=Symbol('ignored');probeCost.costProbe[hiddenSymbol]=new ArrayBuffer(999);Object.defineProperty(probeCost.costProbe,'hidden',{enumerable:false,value:new ArrayBuffer(999)});
 const probeResult=costGraph('map-cycle-subviews-holes-hidden-fields',probeCost);assert.equal(probeResult.nodes.filter(n=>n.kind==='buffer'&&n.byteLength===257).length,1);assert(!probeResult.nodes.some(n=>n.kind==='buffer'&&n.byteLength===999));
 // Real decoded resource fields for the native Document adapter. Preserve the
 // envelope's empty layers because historyDocumentTransferView always maps it.
 const resourceKeys=['palette','paletteOrder','paletteSlots','paletteColumns','nextColorId','customBrushes','referenceImages','slices'];
 const resourceDirectory=path.join(out,'compiled-resource-cost');fs.mkdirSync(resourceDirectory,{recursive:true});
 const resourceRows=[];
 const resourceCase=(name,document,{shareReferences=false,liveRename=false}={})=>{
  const file=name+'.moonsprite',encoded=encodeProject(cloneHistoryDocument(document));fs.writeFileSync(path.join(resourceDirectory,file),encoded);
  const decoded=decodeProject(encoded);
  if(!shareReferences&&!liveRename)fullDocumentCase('resources-'+name,encoded,decoded);
  if(shareReferences){assert.equal(decoded.referenceImages.length,2);decoded.referenceImages[1].pixels=decoded.referenceImages[0].pixels;}
  if(liveRename){decoded.palette[0].name+=' live😀';decoded.customBrushes[0].name+=' live😀';decoded.referenceImages.pop();decoded.slices[0].name+=' live😀';}
  const envelope={layers:[]};for(const key of resourceKeys)envelope[key]=decoded[key];
  const row=costGraph('resource-'+name,envelope);resourceRows.push({name,file,graphName:row.name,shareReferences,liveRename});
  return decoded;
 };
 resourceCase('empty-defaults',modelModule.createDocument('empty resources',8,8,'rgba'));
 const resourceDocument=modelModule.createDocument('resources 中文😀',8,8,'rgba');
 resourceDocument.palette=[{id:7,name:'颜色😀',color:{r:1,g:2,b:3,a:4}},{id:2,name:'second',color:{r:255,g:0,b:128,a:255}},{id:19,name:'',color:{r:0,g:0,b:0,a:0}}];
 resourceDocument.paletteOrder=[19,7,2];resourceDocument.paletteSlots=[null,19,7,null,2,null,null,null];resourceDocument.paletteColumns=4;resourceDocument.nextColorId=20;
 resourceDocument.customBrushes=[{id:'gray',name:'灰度😀',width:2,height:3,coverage:new Uint8Array([0,1,127,128,254,255])},
  {id:'rgba',name:'paint',width:3,height:1,coverage:new Uint8Array([255,128,0]),colors:new Uint32Array([0xff010203,0x80000000,0]),sourceX:-3,sourceY:0}];
 resourceDocument.referenceImages=[{id:'ref_a',width:2,height:2,pixels:new Uint8ClampedArray([1,2,3,255,4,5,6,128,0,0,0,0,255,255,255,255])},
  {id:'ref_b',width:2,height:2,pixels:new Uint8ClampedArray(16)}];
 resourceDocument.slices=[{id:'slice_a',name:'切片😀',x:1,y:2,width:3,height:4},{id:'slice_b',name:'second',x:0,y:0,width:8,height:1}];
 const decodedResources=resourceCase('populated',resourceDocument);assert.equal(decodedResources.customBrushes[0].colors,undefined);assert(Object.hasOwn(decodedResources.customBrushes[0],'colors'));assert(Object.hasOwn(decodedResources.customBrushes[0],'sourceX'));
 resourceCase('shared-reference-storage',resourceDocument,{shareReferences:true});
 resourceCase('live-renamed-resources',resourceDocument,{liveRename:true});
 // Length-sensitive updates exercise the adapter against current values, not
 // a cached import manifest; legacy decode remains the shape authority.
 resourceDocument.customBrushes[0].name+=' changed中文';resourceDocument.customBrushes[0].colors=new Uint32Array(6);resourceDocument.customBrushes[0].sourceX=0;
 resourceDocument.referenceImages.pop();resourceDocument.slices[0].name+=' renamed';resourceDocument.slices.pop();resourceDocument.palette[0].name+=' extended';
 resourceCase('changed-resources',resourceDocument);
 fs.writeFileSync(path.join(resourceDirectory,'cases.json'),JSON.stringify(resourceRows));
 const recordingDirectory=path.join(out,'compiled-recording-cost');fs.mkdirSync(recordingDirectory,{recursive:true});const recordingRows=[];
 const recordingCase=(name,document,{compression='stored',action='none'}={})=>{
  const initial=encodeProject(cloneHistoryDocument(document)),files=fflate.unzipSync(initial),plan={};
  for(const [file,data] of Object.entries(files))plan[file]=[data,{level:compression==='deflated'?6:compression==='mixed'&&file==='timelapse/rec-2.png'?6:0}];
  const encoded=fflate.zipSync(plan),file=name+'.moonsprite';fs.writeFileSync(path.join(recordingDirectory,file),encoded);const decoded=decodeProject(encoded);
  if(action==='migrate-first'){decoded.timelapse.snapshots[0].data=new Uint8Array();decoded.timelapse.snapshots[0].local={store:'store-a',chunk:'chunk-b',offset:8,length:67,checksum:123};}
  if(action==='portable'){for(const frame of decoded.timelapse.snapshots){frame.data=frame.data.slice();delete frame.local;}}
  if(action==='remove-first')decoded.timelapse.snapshots.shift();
  if(action==='live-settings'){decoded.timelapse.quality='high';decoded.timelapse.mode='full';decoded.timelapse.enabled=true;decoded.timelapse.recordUndoSteps=true;decoded.timelapse.fps=60;decoded.timelapse.speed=64;}
  const envelope={layers:[],timelapse:decoded.timelapse},row=costGraph('recording-'+name,envelope);
  recordingRows.push({name,file,graphName:row.name,compression,action,frames:decoded.timelapse.snapshots.length,backingLengths:decoded.timelapse.snapshots.map(frame=>frame.data.buffer.byteLength),sharesArchive:decoded.timelapse.snapshots.map(frame=>frame.data.buffer===encoded.buffer)});
  return decoded;
 };
 const recordingDocument=modelModule.createDocument('recording cost',1,1,'rgba');recordingCase('empty',recordingDocument);
 // A real one-pixel RGBA PNG; fixture construction is independent of costing.
 const recordingZlib=require('node:zlib'),pngChunk=(type,data)=>{const text=Buffer.from(type),body=Buffer.concat([text,data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(recordingZlib.crc32(body));return Buffer.concat([head,body,tail]);};
 const pngHeader=Buffer.alloc(13);pngHeader.writeUInt32BE(1,0);pngHeader.writeUInt32BE(1,4);pngHeader[8]=8;pngHeader[9]=6;
 const recordingPng=new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',pngHeader),pngChunk('IDAT',recordingZlib.deflateSync(new Uint8Array([0,1,2,3,255]))),pngChunk('IEND',Buffer.alloc(0))]));
 recordingDocument.timelapse={enabled:true,recordUndoSteps:true,quality:'low',fps:1,speed:64,mode:'full',snapshots:[1,2].map((n)=>({id:'rec-'+n,capturedAt:100+n,elapsedMs:n-1,width:1,height:1,...(n===1?{changeScore:.25}:{}),data:recordingPng.slice()}))};
 const storedRecording=recordingCase('stored',recordingDocument);assert.equal(storedRecording.timelapse.snapshots[0].data.buffer,storedRecording.timelapse.snapshots[1].data.buffer);
 const deflatedRecording=recordingCase('deflated',recordingDocument,{compression:'deflated'});assert.notEqual(deflatedRecording.timelapse.snapshots[0].data.buffer,deflatedRecording.timelapse.snapshots[1].data.buffer);
 recordingCase('mixed',recordingDocument,{compression:'mixed'});recordingCase('migrate-first',recordingDocument,{action:'migrate-first'});recordingCase('portable',recordingDocument,{action:'portable'});recordingCase('remove-first',recordingDocument,{action:'remove-first'});recordingCase('live-settings',recordingDocument,{action:'live-settings'});
 const localRecording=cloneHistoryDocument(recordingDocument);for(const frame of localRecording.timelapse.snapshots){frame.data=new Uint8Array();frame.local={store:'store-a',chunk:'chunk-b',offset:8,length:67,checksum:123};}
 recordingCase('local-only',localRecording);localRecording.timelapse.snapshots[1].data=recordingPng.slice();delete localRecording.timelapse.snapshots[1].local;recordingCase('local-and-embedded',localRecording);
 fs.writeFileSync(path.join(recordingDirectory,'cases.json'),JSON.stringify(recordingRows));
 const rasterObjectDirectory=path.join(out,'compiled-raster-objects');fs.mkdirSync(rasterObjectDirectory,{recursive:true});const rasterObjectRows=[];
 const rasterObjectCase=(name,encoded,includeMasks=false)=>{const file=name+'.moonsprite';fs.writeFileSync(path.join(rasterObjectDirectory,file),encoded);const decoded=decodeProject(encoded),animation={cels:decoded.animation.cels};
  if(includeMasks){animation.layerMasks=decoded.animation.layerMasks;animation.groupMasks=decoded.animation.groupMasks;const masks=[...animation.layerMasks,...animation.groupMasks].map(entry=>entry.mask);assert(masks.every(mask=>!Object.hasOwn(mask,'moveWithOwner')));for(let i=0;i<masks.length;i++){assert.equal(masks[i].pixels.buffer.byteLength,masks[i].width*masks[i].height*4);assert.notEqual(masks[i].pixels.buffer,encoded.buffer);for(let j=0;j<i;j++)assert.notEqual(masks[i].pixels.buffer,masks[j].pixels.buffer);}}
  const row=costGraph('raster-objects-'+name,{layers:decoded.layers,animation,timelapse:decoded.timelapse});rasterObjectRows.push({file,graphName:row.name,includeMasks,layerMaskName:decoded.animation.layerMasks[0]?.mask.name??'',groupMaskName:decoded.animation.groupMasks[0]?.mask.name??'',maskFirstPixels:[...decoded.animation.layerMasks,...decoded.animation.groupMasks].map(entry=>Array.from(entry.mask.pixels.subarray(0,4)))});fullDocumentCase('rasters-'+name,encoded,decoded);
 };
 const storageDirectory=path.join(out,'compiled-storage-cost');fs.mkdirSync(storageDirectory,{recursive:true});const storageRows=[];
 const storageCase=(name,document,compression)=>{
  const files=fflate.unzipSync(encodeProject(cloneHistoryDocument(document))),plan={};for(const [file,data] of Object.entries(files))plan[file]=[data,{level:compression==='deflated'?6:0}];
  const encoded=fflate.zipSync(plan),file=name+'.moonsprite';fs.writeFileSync(path.join(storageDirectory,file),encoded);
  rasterObjectCase(name,encoded);
  const decoded=decodeProject(encoded),transferred=budgetDelta.historyDocumentTransferView(decoded),storage=[],rasters=[];
  const view=(surface,type,index)=>{assert(surface);const value={pixels:surface.pixels};if(surface.runtimeRaster)value.runtimeRaster=surface.runtimeRaster;storage.push(value);rasters.push({type,index,sparse:!!surface.runtimeRaster});};
  transferred.layers.forEach((layer,index)=>view(layer,'layer',index));transferred.animation.cels.forEach((cel,index)=>{if(cel.surface)view(cel.surface,'cel',index);});
  const row=costGraph('storage-'+name,{layers:[],timelapse:decoded.timelapse,storage});storageRows.push({name,file,graphName:row.name,rasters});
  if(rasters[0].sparse){assert.notEqual(storage[0].pixels.buffer,storage[1].pixels.buffer);assert.equal(storage[0].runtimeRaster,storage[1].runtimeRaster);assert.equal(runtimeModule.surfacePixelsMaterialized(decoded.layers[0]),false);}
  else{assert.equal(storage[0].pixels,storage[1].pixels);if(compression==='stored')assert.equal(storage[0].pixels.buffer,decoded.timelapse.snapshots[0].data.buffer);}
 };
 const rawStorage=modelModule.createDocument('raw storage',2,2,'rgba');rawStorage.layers[0].pixels.set(new Uint8ClampedArray(16).fill(255));rawStorage.timelapse=cloneHistoryDocument(recordingDocument).timelapse;
 storageCase('raw-stored',rawStorage,'stored');storageCase('raw-deflated',rawStorage,'deflated');
 const sparseStorage=modelModule.createDocument('sparse edges',65,65,'rgba');sparseStorage.layers[0].pixels.set([1,2,3,255],(64*65+64)*4);sparseStorage.timelapse=cloneHistoryDocument(recordingDocument).timelapse;
 storageCase('sparse-stored',sparseStorage,'stored');storageCase('sparse-deflated',sparseStorage,'deflated');
 const emptyStorage=modelModule.createDocument('empty sparse',65,65,'rgba');emptyStorage.timelapse=cloneHistoryDocument(recordingDocument).timelapse;
 storageCase('empty-sparse-stored',emptyStorage,'stored');storageCase('empty-sparse-deflated',emptyStorage,'deflated');
 fs.writeFileSync(path.join(storageDirectory,'cases.json'),JSON.stringify(storageRows));
 const objectDocument=modelModule.createDocument('raster objects',2,2,'rgba'),objectLayer=modelModule.createLayer('第二层😀',2,2,'rgba');objectLayer.pixels.fill(255);objectDocument.layers.push(objectLayer);animationModule.syncActiveAnimationLayers(objectDocument);animationModule.addBlankAnimationFrame(objectDocument);
 objectDocument.groups=[{id:'raster-group',name:'组'}];objectDocument.layers[0].groupId='raster-group';objectDocument.layers[0].description='图层说明😀';objectDocument.layers[0].displayColor={r:1,g:2,b:3,a:4};objectDocument.layers[0].clippingMask=true;objectDocument.layers[0].autoLinkAnimationCels=true;
 objectDocument.layers[1].layerStyles=(await source('layer-styles.ts')).createDefaultLayerStyles();
 objectDocument.animation.cels.reverse();objectDocument.animation.cels[0].opacity=0;objectDocument.animation.cels[0].zIndex=-12;objectDocument.animation.cels[1].zIndex=999;
 rasterObjectCase('multilayer-frames',encodeProject(cloneHistoryDocument(objectDocument)));
 const objectLinkTarget=objectDocument.animation.cels.find(cel=>cel.frameId===objectDocument.animation.activeFrameId),objectLinkSource=objectDocument.animation.cels.find(cel=>cel.layerId===objectLinkTarget.layerId&&cel.id!==objectLinkTarget.id);
 objectLinkTarget.linkedCelId=objectLinkSource.id;delete objectLinkTarget.surface;
 rasterObjectCase('linked-no-own-surface',encodeProject(cloneHistoryDocument(objectDocument)));
 const maskObjectDocument=modelModule.createDocument('mask objects',2,2,'rgba');maskObjectDocument.layers[0].pixels.fill(255);animationModule.syncActiveAnimationLayers(maskObjectDocument);animationModule.addBlankAnimationFrame(maskObjectDocument);maskObjectDocument.groups=[{id:'mask-group',name:'蒙版组'}];maskObjectDocument.layers[0].groupId='mask-group';maskObjectDocument.timelapse=cloneHistoryDocument(recordingDocument).timelapse;
 const maskLayer=maskObjectDocument.layers[0],maskFrames=maskObjectDocument.animation.frames;
 const makeCostMask=(id,group=false)=>({id,name:'discarded name',description:'discarded description',visible:false,locked:true,opacity:.5,blendMode:'multiply',width:2,height:2,offsetX:-3,offsetY:4,format:'rgba',pixels:new Uint8ClampedArray([0,0,0,255,127,127,127,255,255,255,255,255,70,70,70,255]),ownerKind:group?'group':'cel',ownerId:group?'mask-group':maskLayer.id,autoLinkAnimationCels:true,moveWithOwner:false});
 maskObjectDocument.animation.layerMasks=maskFrames.map((frame,index)=>({layerId:maskLayer.id,frameId:frame.id,mask:makeCostMask('layer-mask-'+index)}));
 maskObjectDocument.animation.groupMasks=[{groupId:'mask-group',frameId:maskFrames[0].id,mask:makeCostMask('group-mask',true)}];
 const maskLocalization=await source('localization.ts');
 const maskObjectCase=(name,{scalar=false,deflated=false,shared=false,inline=false,locale='zh-CN'}={})=>{
  const files=fflate.unzipSync(encodeProject(cloneHistoryDocument(maskObjectDocument))),manifest=JSON.parse(fflate.strFromU8(files['manifest.json'])),animation=manifest.document.animation;
  if(scalar)for(const [file,data] of Object.entries(files))if(file.startsWith('masks/'))files[file]=Uint8Array.from({length:data.length/4},(_,i)=>data[i*4]);
  if(!scalar){const file=animation.layerMasks[0].mask.dataFile;files[file].set([19,20,21,0],0);}
  if(shared){animation.layerMasks[1].mask.linkedMaskId=animation.layerMasks[0].mask.id;for(const entry of [animation.layerMasks[1],animation.groupMasks[0]]){const oldFile=entry.mask.dataFile;entry.mask.dataFile=animation.layerMasks[0].mask.dataFile;delete files[oldFile];}}
  if(inline){const slot=animation.layerMasks[0],cel=animation.cels.find(cel=>cel.layerId===slot.layerId&&cel.frameId===slot.frameId);cel.mask={...slot.mask,id:'shadowed-inline-mask'};}
  files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const plan={};for(const [file,data] of Object.entries(files))plan[file]=[data,{level:deflated?6:0}];
  maskLocalization.setRuntimeAppLocale(locale);try{rasterObjectCase('masks-'+name,fflate.zipSync(plan),true);}finally{maskLocalization.setRuntimeAppLocale(null);}
 };
 maskObjectCase('rgba-stored');maskObjectCase('rgba-deflated',{deflated:true});maskObjectCase('scalar-stored',{scalar:true});maskObjectCase('scalar-deflated',{scalar:true,deflated:true});maskObjectCase('shared-linked',{shared:true});maskObjectCase('inline-shadowed',{inline:true});maskObjectCase('english',{locale:'en-US'});
 fs.writeFileSync(path.join(rasterObjectDirectory,'cases.json'),JSON.stringify(rasterObjectRows));
 const timelineCostDirectory=path.join(out,'compiled-timeline-cost');fs.mkdirSync(timelineCostDirectory,{recursive:true});const metadataRows=[];
 const metadataCase=(name,document,live=false)=>{
  const file=name+'.moonsprite',encoded=encodeProject(cloneHistoryDocument(document));fs.writeFileSync(path.join(timelineCostDirectory,file),encoded);const decoded=decodeProject(encoded);
  if(live){decoded.animation.loop=false;decoded.animation.frames[0].duration=37;decoded.animation.loopSections[0].name+=' live😀';}
  const {frames,loopSections,activeFrameId,loop}=decoded.animation;
  assert(frames.every(frame=>Object.hasOwn(frame,'disabled')===!!frame.disabled));assert(loopSections.every(section=>Object.hasOwn(section,'repeatCount')));
  const row=costGraph('timeline-'+name,{layers:[],frames,loopSections,activeFrameId,loop,tilesets:decoded.tilesets});metadataRows.push({file,graphName:row.name,live});
 };
 const metadataDocument=modelModule.createDocument('timeline metadata',2,2,'rgba');metadataCase('defaults',metadataDocument);
 const metadataLayer=metadataDocument.layers[0],metadataSurface=metadataDocument.animation.cels[0].surface;
 metadataDocument.animation.frames=[{id:'帧😀',duration:1},{id:'frame-b',duration:999,disabled:true},{id:'frame-c',duration:100}];
 metadataDocument.animation.cels=metadataDocument.animation.frames.map((frame,index)=>({id:'cel-'+index,layerId:metadataLayer.id,frameId:frame.id,surface:metadataSurface}));
 metadataDocument.animation.activeFrameId='frame-c';
 metadataDocument.animation.loopSections=['forward','reverse','ping-pong','ping-pong-reverse'].map((direction,index)=>({id:'loop-'+index,name:'循环😀 '+index,startFrameId:'帧😀',endFrameId:'frame-c',direction,repeatCount:index?index:null}));
 metadataCase('frames-loops',metadataDocument);metadataCase('live-metadata',metadataDocument,true);
 metadataDocument.tilesets=[{id:'set-a',name:'瓦片😀',tileWidth:2,tileHeight:1,columns:2,rows:1,tileIds:['tile-a','片😀'],tileSlots:[null,'片😀',null,'tile-a',null],pixels:new Uint8ClampedArray(16)},
  {id:'set-b',name:'second',tileWidth:1,tileHeight:2,columns:1,rows:1,tileIds:['one'],tileSlots:['one'],pixels:new Uint8ClampedArray(8)}];
 metadataCase('tileset-layout',metadataDocument);
 fs.writeFileSync(path.join(timelineCostDirectory,'cases.json'),JSON.stringify(metadataRows));
 const groupCostDirectory=path.join(out,'compiled-group-cost');fs.mkdirSync(groupCostDirectory,{recursive:true});const groupCostRows=[];
 const groupCostCase=(name,groups,live=false)=>{
  const document=modelModule.createDocument('group cost',2,2,'rgba');document.groups=groups;
  const encoded=encodeProject(cloneHistoryDocument(document)),file=name+'.moonsprite';fs.writeFileSync(path.join(groupCostDirectory,file),encoded);const decoded=decodeProject(encoded);
  if(live){const group=decoded.groups[0];group.name+=' live😀';group.blendMode='color-dodge';group.layerStyles.stroke.kernel='horizontal';group.layerStyles.stroke.position='both';group.layerStyles.gradientMap.stops.pop();group.layerStyles.gradientMap.dither='diagonal-reverse';group.layerStyles.gradientOverlay.dither='horizontal';}
  const row=costGraph('groups-'+name,{layers:[],groups:decoded.groups});groupCostRows.push({file,graphName:row.name,live,parentPresence:decoded.groups.map(group=>Object.hasOwn(group,'parentGroupId'))});if(!live)fullDocumentCase('groups-'+name,encoded,decoded);return row;
 };
 groupCostCase('empty',[]);
 const groupAbsent=groupCostCase('absent-parent',[{id:'group-a',name:'组😀'}]);
 const groupNull=groupCostCase('null-parent',[{id:'group-a',name:'组😀',parentGroupId:null}]);assert.equal(groupNull.bytes-groupAbsent.bytes,8);
 groupCostCase('nested-properties',[{id:'group-a',name:'组😀',parentGroupId:null,panelOrder:0,displayColor:{r:1,g:2,b:3,a:4},description:'说明😀',clippingMask:true,cumulativeBlend:true,blendMode:'multiply',opacity:.25},
  {id:'child',name:'child',parentGroupId:'group-a',visible:false,locked:true,blendMode:'screen'}]);
 const groupStyleModule=await source('layer-styles.ts');
 groupCostCase('default-style',[{id:'styled',name:'style',layerStyles:groupStyleModule.createDefaultLayerStyles()}]);
 const liveGroupStyle=groupStyleModule.createDefaultLayerStyles();liveGroupStyle.gradientMap.stops.push({position:.5,color:{r:1,g:2,b:3,a:255}});
 groupCostCase('live-style',[{id:'styled',name:'style',layerStyles:liveGroupStyle}],true);
 const groupDithers=['none','bayer-2','bayer-4','bayer-8','checker','diagonal','diagonal-reverse','horizontal','vertical'];
 groupCostCase('style-variants',groupDithers.map((dither,index)=>{
  const style=groupStyleModule.createDefaultLayerStyles();style.enabled=index%2===0;style.gradientMap.enabled=true;style.gradientMap.dither=dither;style.gradientMap.mode=index%2?'steps':'continuous';style.gradientMap.reverse=true;
  style.gradientMap.stops=Array.from({length:index===8?256:3},(_,n)=>({position:n/(index===8?255:2),color:{r:n%256,g:50,b:70,a:255}}));
  style.stroke.enabled=true;style.stroke.kernel=['round','square','horizontal','vertical'][index%4];style.stroke.position=['inside','outside','both'][index%3];style.gradientOverlay.dither=dither;style.shadow.enabled=true;style.colorOverlay.enabled=true;
  return {id:'variant-'+index,name:'样式😀 '+index,...(index?{parentGroupId:'variant-0'}:{}),layerStyles:style};
 }));
 fs.writeFileSync(path.join(groupCostDirectory,'cases.json'),JSON.stringify(groupCostRows));
 const rootMetadataDirectory=path.join(out,'compiled-root-metadata');fs.mkdirSync(rootMetadataDirectory,{recursive:true});const rootMetadataRows=[];
 const rootMetadataDocument=modelModule.createDocument('根元数据😀',2,2,'rgba');rootMetadataDocument.layers.push(modelModule.createLayer('second',2,2,'rgba'));animationModule.syncActiveAnimationLayers(rootMetadataDocument);rootMetadataDocument.groups=[{id:'root-group😀',name:'group'}];
 const rootMetadataCase=(name,change)=>{
  const files=fflate.unzipSync(encodeProject(cloneHistoryDocument(rootMetadataDocument))),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));change?.(manifest.document);files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level:0}),file=name+'.moonsprite';fs.writeFileSync(path.join(rootMetadataDirectory,file),encoded);const decoded=decodeProject(encoded);
  const envelope={layers:[],name:decoded.name,activeLayerId:decoded.activeLayerId};if(decoded.outlineSettings)envelope.outlineSettings=decoded.outlineSettings;envelope.displaySettings=decoded.displaySettings;envelope.statistics=decoded.statistics;envelope.createdAt=decoded.createdAt;envelope.updatedAt=decoded.updatedAt;envelope.layerPanelState=decoded.layerPanelState;
  const row=costGraph('root-metadata-'+name,envelope);rootMetadataRows.push({file,graphName:row.name,outline:!!decoded.outlineSettings,statistics:decoded.statistics});fullDocumentCase('metadata-'+name,encoded,decoded);
 };
 rootMetadataCase('defaults');
 rootMetadataCase('populated',document=>{const [a,b]=document.layers.map(layer=>layer.id),g=document.groups[0].id;document.layerPanelState={activeLayerId:b,selectedLayerIds:[a,a,'invalid',b,12],selectedGroupIds:[g,g,'invalid'],selectedGroupId:g,layerSelectionAnchorId:g,collapsedGroupIds:[g,'invalid',g]};document.displaySettings={showPixelGrid:true,showGrid:true,grid:{x:-3,y:7,width:5,height:8},symmetryCenter:{x:0,y:0}};document.statistics={strokeCount:123,operationCount:9007199254740991,drawingTimeMs:-1};document.createdAt='created 时间😀';document.updatedAt='updated 时间😀';});
 rootMetadataCase('group-only',document=>{const g=document.groups[0].id;document.layerPanelState={activeLayerId:'invalid',selectedLayerIds:[],selectedGroupIds:[g],selectedGroupId:'invalid',layerSelectionAnchorId:'invalid',collapsedGroupIds:[g]};});
 rootMetadataCase('invalid-panel',document=>{document.layerPanelState=[];document.statistics={strokeCount:1.5,operationCount:'2',drawingTimeMs:9007199254740992};document.outlineSettings=[];});
 for(let index=0;index<4;index++)rootMetadataCase('outline-'+index,document=>{document.outlineSettings={color:{r:1,g:2,b:3,a:4},backgroundColor:{r:10,g:20,b:30,a:40},thickness:64,position:['inside','outside','both'][index%3],kernel:['round','square','horizontal','vertical'][index],directions:{nw:true,n:false},smartHue:true,smartHueDarkness:12,followOpacity:true,previewEnabled:false};});
 rootMetadataCase('invalid-outline',document=>{document.outlineSettings={position:'invalid',kernel:'invalid',directions:null};document.layerPanelState={activeLayerId:'invalid',selectedLayerIds:[document.layers[1].id],selectedGroupIds:[],selectedGroupId:document.groups[0].id};});
 fs.writeFileSync(path.join(rootMetadataDirectory,'cases.json'),JSON.stringify(rootMetadataRows));
 for(const format of [...(await source('pixel-format.ts')).PIXEL_FORMATS,'invalid-layout']){const files=fflate.unzipSync(encodeProject(cloneHistoryDocument(rootMetadataDocument))),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));manifest.document.pixelFormat=format;manifest.document.id='persisted identity 中文😀 with a different length';files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level:0});fullDocumentCase('pixel-format-'+format,encoded,decodeProject(encoded));}
 // Text remains a decoded raster cache: do not render it to construct costs.
 const textDocument=modelModule.createDocument('text cost',2,2,'rgba');textDocument.layers[0].kind='text';textDocument.layers[0].pixels.set(new Uint8ClampedArray(16).fill(255));animationModule.syncActiveAnimationLayers(textDocument);
 const {translateTextCelData:translateCostText}=await source('text-cel-data.ts');
 const textCase=(name,text,change,options)=>{
  const files=fflate.unzipSync(encodeProject(cloneHistoryDocument(textDocument))),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));manifest.document.animation.cels[0].text=text;change?.(manifest.document);files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level:0}),decoded=decodeProject(encoded);
  assert.equal(decoded.layers[0].kind,'text');assert.equal(decoded.layers[0].pixels.buffer,decoded.animation.cels[0].surface.pixels.buffer);assert.equal(decoded.layers[0].pixels[0],255);
  if(name.startsWith('extended-')){const moved=cloneHistoryDocument(decoded);translateCostText(moved.animation.cels[0].text,7,-2);const reopened=decodeProject(encodeProject(moved));options={...options,movedText:reopened.animation.cels[0].text};}
  const reopened=decodeProject(encodeProject(cloneHistoryDocument(decoded)));options={...options,decodedText:decoded.animation.cels[0].text,reopenedText:reopened.animation.cels[0].text};
  fullDocumentCase('text-'+name,encoded,decoded,options);return decoded.animation.cels[0].text;
 };
 textCase('defaults',{});
 textCase('unicode',{text:'中文😀\ud800x\udfff',fontFamily:'\u3000Tiny5\u00a0',fontSize:42,lineSpacing:-12,letterSpacing:9,spacingMode:'actual',antialias:'smooth',textAlign:'right',originX:-8,originY:4});
 textCase('box',{text:'boxed',layoutMode:'box',boxWidth:123,boxHeight:45,textAlign:'center',color:{r:12,g:34,b:56,a:78}});
 const textRuns=textCase('styles',{text:'abcdef😀',styleRuns:[{start:0,end:8,fontSize:12},{start:2,end:5,lineSpacing:3,letterSpacing:2,color:{r:1,g:2,b:3,a:4}}]});assert(textRuns.styleRuns.some(run=>!run.color&&Object.hasOwn(run,'color')));
 const transform={source:{x:-2,y:3,width:4,height:5},target:{x:6,y:-7,width:8,height:9},angle:45};
 textCase('transforms',{text:'transform',transforms:[transform,{...transform,shear:{axis:'y',edge:'w',amount:-.25}}]});
 const filtered=textCase('filtered-transforms',{text:'invalid transform',transforms:[{...transform,source:{...transform.source,width:0}}]});assert(!Object.hasOwn(filtered,'transforms'));
 textCase('font-boundary',{text:'boundary',fontFamily:'a'.repeat(127)+'😀'});
 textCase('fractional-style-offsets',{text:'a',styleRuns:[{start:.9,end:1.9,fontSize:12}]});
 const linkedText=textCase('linked',{text:'owner'},document=>{const frame={...document.animation.frames[0],id:'linked-text-frame'};document.animation.frames.push(frame);const cel=document.animation.cels[0];document.animation.cels.push({id:'linked-text-cel',layerId:cel.layerId,frameId:frame.id,linkedCelId:cel.id,text:{text:'own linked metadata',layoutMode:'box',boxWidth:20,boxHeight:10}});});assert.equal(linkedText.text,'owner');
 const extended=textCase('extended-rectangle',{text:'extension',transforms:[{...transform,source:{...transform.source,label:'retained extra 中文',nested:{value:'retained'}}}]});assert.equal(extended.transforms[0].source.label,'retained extra 中文');assert.equal(extended.transforms[0].source.nested.value,'retained');
 textCase('extended-key-order',{text:'order',transforms:[{...transform,source:{label:'first',...transform.source,'10':'ten','2':'two','01':'leading','4294967295':'max','4294967294':'index'},target:{...transform.target,label:'target'}}]});
 textCase('extended-nested',{text:'nested',transforms:[{...transform,source:{...transform.source,values:[null,true,123,'\ud800',{},['array中文']],object:{'8':'eight','3':'three',last:'last'}},target:{note:'before geometry',...transform.target}}]});
 textCase('extended-escaped',{text:'pairs😀before\ud800middle😀after\udfff',transforms:[{...transform,source:{...transform.source,'quote" slash\\ colon: comma, braces{}[]':{value:'},":['},tail:'😀\ud800x\udfff😀'},target:{...transform.target,'\\u0031':'literal escape'}}]});
 const missing=textCase('missing-rectangle-fields',{text:'invalid geometry',transforms:[{...transform,source:{width:4,height:5}}]});assert(!Object.hasOwn(missing,'transforms'));
 const shearMissing=textCase('missing-shear-amount',{text:'invalid shear',transforms:[{...transform,shear:{axis:'x',edge:'n'}}]});assert(!Object.hasOwn(shearMissing.transforms[0],'shear'));
 textCase('font-source-surrogates',{text:'font',fontFamily:'\ud800font😀\udfff'});
 textCase('font-empty',{text:'font',fontFamily:'\u3000\ufeff\n\u00a0'});
 textCase('scalar-coercion',{text:'a',fontSize:null,lineSpacing:['3.5'],letterSpacing:true,color:{r:null,g:'255.5',b:[],a:[null]},styleRuns:[{start:null,end:true,fontSize:12,color:{r:'0x10',g:false,b:[' 2 '],a:'0b11'}}]});
 textCase('optional-strict',{text:'a',originX:'2',originY:false,layoutMode:'invalid',boxWidth:'10',boxHeight:20,styleRuns:[{start:'0',end:['1'],fontSize:'12',color:false}]});
 textCase('invalid-containers',{text:123,fontFamily:true,styleRuns:{start:0,end:4,fontSize:12},transforms:{source:transform.source,target:transform.target},color:true,layoutMode:'box',boxWidth:[],boxHeight:null});
 textCase('malformed-transform-array',{text:'transforms',transforms:[null,3,[],{}, {source:[],target:transform.target},{...transform,angle:'90',shear:[]},{...transform,angle:[true],shear:{axis:'x',edge:'n',amount:'2'}}]});
 textCase('style-filter',{text:'abcdef',styleRuns:[null,3,'x',[],{start:0,end:2,fontSize:.5,lineSpacing:null,color:[]},{start:2,end:3,letterSpacing:-64.5,color:'color'},{start:3,end:4,color:0},{start:4,end:5,lineSpacing:512.5}]});
 textCase('metadata-array',[]);for(const [name,value] of [['zero',0],['false',false],['string','text'],['null',null]])textCase('metadata-'+name,value);
 const specialDocument=modelModule.createDocument('special layer cost',2,2,'rgba');specialDocument.layers[0].pixels.fill(255);animationModule.syncActiveAnimationLayers(specialDocument);let specialCases=0;
 const specialCase=(name,change)=>{
  const files=fflate.unzipSync(encodeProject(cloneHistoryDocument(specialDocument))),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));change(manifest.document.layers[0],manifest.document);files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level:0}),decoded=decodeProject(encoded),layer=decoded.layers[0];assert.equal(layer.pixels.buffer,decoded.animation.cels[0].surface.pixels.buffer);assert.equal(layer.pixels[0],255);
  fullDocumentCase('special-'+name,encoded,decoded,{specialLayer:{background:layer.background??null,adjustment:layer.adjustment??null,layerStyles:layer.layerStyles??null,hasLayerStyles:Object.hasOwn(layer,'layerStyles')}});specialCases++;
 };
 specialCase('canvas',layer=>{layer.background={mode:'canvas'};});specialCase('canvas-repeat',layer=>{layer.background={mode:'canvas',repeatWidth:13,repeatHeight:7};});
 specialCase('canvas-area-boundary',layer=>{layer.background={mode:'canvas',repeatWidth:65536,repeatHeight:4096};});specialCase('canvas-area-overflow',layer=>{layer.background={mode:'canvas',repeatWidth:65536,repeatHeight:4097};});
 specialCase('canvas-fractional',layer=>{layer.background={mode:'canvas',repeatWidth:1.5,repeatHeight:4};});specialCase('background-mode-type',layer=>{layer.background={mode:12};});specialCase('background-invalid-preset',layer=>{layer.background={mode:'preset',pattern:'missing'};});specialCase('background-array',layer=>{layer.background=[];});
 for(const pattern of ['solid','grid','stripes','diamond','diamond-nested','circles'])specialCase('preset-'+pattern,layer=>{layer.background={mode:'preset',pattern};});
 specialCase('adjustment-default',layer=>{layer.kind='adjustment';});
 specialCase('adjustment-populated',layer=>{layer.kind='adjustment';layer.adjustment={kind:'gradient-map',enabled:false,gradientMap:{stops:[{position:1,color:{r:255,g:0,b:3,a:1}},{position:0,color:{r:12,g:34,b:56,a:0}}],mode:'steps',dither:'diagonal-reverse',reverse:true}};});
 specialCase('adjustment-no-stops',layer=>{layer.kind='adjustment';layer.adjustment={gradientMap:{mode:'steps',dither:'checker',reverse:true}};});
 specialCase('adjustment-beta',layer=>{layer.kind='adjustment';layer.layerStyles={enabled:true,gradientMap:{enabled:true,mode:'steps',dither:'horizontal',reverse:true}};});
 specialCase('adjustment-beta-disabled',layer=>{layer.kind='adjustment';layer.layerStyles={enabled:false,gradientMap:{enabled:true}};});
 specialCase('adjustment-enabled-types',layer=>{layer.kind='adjustment';layer.adjustment={enabled:0,gradientMap:{stops:false,mode:'steps',reverse:1}};});
 specialCase('adjustment-array-stop-color',layer=>{layer.kind='adjustment';layer.adjustment={gradientMap:{stops:[{position:0,color:[]},{position:.5,color:{r:100}},{position:1,color:{r:255}}]}};});
 for(const [index,dither] of ['none','bayer-2','bayer-4','bayer-8','checker','diagonal','diagonal-reverse','horizontal','vertical'].entries())specialCase('adjustment-dither-'+index,layer=>{layer.kind='adjustment';layer.adjustment={enabled:index%2===0,gradientMap:{stops:Array.from({length:index===8?256:3},(_,i)=>({position:index===8?i/255:i/2,color:{r:i%256,g:2,b:3}})),mode:index%2?'steps':'continuous',dither,reverse:index%2===0}};});
 specialCase('adjustment-beta-default',layer=>{layer.kind='adjustment';layer.layerStyles={};});
 specialCase('adjustment-beta-types',layer=>{layer.kind='adjustment';layer.layerStyles={enabled:0,gradientMap:{enabled:1}};});
 specialCase('adjustment-falsy-beta',layer=>{layer.kind='adjustment';layer.adjustment=false;layer.layerStyles={gradientMap:{enabled:true,mode:'steps',dither:'checker'}};});
 specialCase('adjustment-map-fallback',layer=>{layer.kind='adjustment';layer.adjustment={enabled:false,gradientMap:null};layer.layerStyles={gradientMap:{enabled:true,mode:'steps',reverse:true}};});
 specialCase('adjustment-kind-normalize',layer=>{layer.kind='adjustment';layer.adjustment={kind:'unknown',enabled:'false',gradientMap:[]};});
 specialCase('adjustment-primitive',layer=>{layer.kind='adjustment';layer.adjustment=true;layer.layerStyles={enabled:false,gradientMap:{enabled:false,reverse:true}};});
 specialCase('background-pattern-type',layer=>{layer.background={mode:'preset',pattern:[]};});
 specialCase('background-styled-map-no-stops',layer=>{layer.background={mode:'preset',pattern:'grid'};layer.layerStyles={gradientMap:{enabled:true,mode:'steps',dither:'bayer-4',reverse:true}};});
 specialCase('adjustment-background',layer=>{layer.kind='adjustment';layer.adjustment={enabled:true,gradientMap:{dither:'bayer-8'}};layer.background={mode:'canvas',repeatWidth:2,repeatHeight:3};});
 specialCase('mixed-shared-storage',(layer,document)=>{const second={...layer,id:'special-background',name:'背景共享😀',background:{mode:'preset',pattern:'circles'}};document.layers.push(second);document.animation.cels.push({...document.animation.cels[0],id:'special-second-cel',layerId:second.id});layer.kind='adjustment';layer.adjustment={gradientMap:{reverse:true}};});
 // Actual decoder oracle for native tilemap manifest normalization. These
 // documents stay outside the cost admission matrix until rendered identity is ported.
 const tileModule=await source('tilemap.ts');
 const tileDocument=modelModule.createDocument('tile normalization',2,2,'rgba');
 const tileSet=tileModule.createSolidTileset('s','Solid',2,2,{r:10,g:20,b:30,a:255},'t');
 tileDocument.tilesets=[tileSet];tileDocument.layers[0].kind='tilemap';tileDocument.layers[0].tilemapTilesetId='s';
 const tileCel=animationModule.ensureAnimationDocument(tileDocument).cels[0];
 tileCel.tilemap=tileModule.createTilemapCelData(2,2,2,2);tileCel.tilemap.cells[0]={tilesetId:'s',tileId:'t'};
 tileCel.surface=tileModule.renderTilemapSurface(tileCel.tilemap,tileDocument.tilesets,'rgba');animationModule.refreshActiveAnimationFrame(tileDocument);
 const tileArchive=encodeProject(tileDocument);
 const tileDecode=(grid)=>{const files=fflate.unzipSync(tileArchive),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));manifest.document.animation.cels[0].tilemap=grid;files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));return decodeProject(fflate.zipSync(files,{level:0}));};
 const tileGrid={tileWidth:'0x2',tileHeight:[2],columns:true,rows:' 1 ',cells:[{index:0,tilesetId:'s',tileId:'t',flipHorizontal:1,flipVertical:true,rotation:'1'}]};
 let tileDecoded=tileDecode(tileGrid),normalized=tileDecoded.animation.cels[0].tilemap;
 assert.deepEqual(normalized,{tileWidth:2,tileHeight:2,columns:1,rows:1,cells:[{tilesetId:'s',tileId:'t',flipVertical:true}]});
 assert.deepEqual(Array.from(tileDecoded.animation.cels[0].surface.pixels),[10,20,30,255,10,20,30,255,10,20,30,255,10,20,30,255]);
 for(const value of [null,false,[],{},1.5,-1,4,0,'3']){const grid=structuredClone(tileGrid);grid.cells[0].rotation=value;grid.cells[0].flipVertical=value;assert.deepEqual(tileDecode(grid).animation.cels[0].tilemap.cells[0],{tilesetId:'s',tileId:'t'});}
 for(const rotation of [1,2,3]){const grid=structuredClone(tileGrid);grid.cells[0].rotation=rotation;assert.equal(tileDecode(grid).animation.cels[0].tilemap.cells[0].rotation,rotation);}
 for(const value of [null,false,[],{},1.5,0,257]){const grid=structuredClone(tileGrid);grid.tileWidth=value;assert.throws(()=>tileDecode(grid));}
 {const grid=structuredClone(tileGrid);grid.cells[0].index='0';assert.throws(()=>tileDecode(grid));}
 {const grid=structuredClone(tileGrid);grid.cells.push({...grid.cells[0]});assert.throws(()=>tileDecode(grid));}
 console.log('Actual legacy tilemap decoder: coerced dimensions, literal flags, strict rotations/indexes, invalid dimensions and duplicates verified');
 const tileProbes=[];
 const tileCostCase=(name,change,level=0)=>{const files=fflate.unzipSync(tileArchive),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));change?.(manifest.document,files);files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level}),decoded=decodeProject(encoded);tileProbes.push({name,layers:decoded.layers.map(l=>Object.keys(l)),cels:decoded.animation.cels.map(c=>({keys:Object.keys(c),surface:c.surface?Object.keys(c.surface):null,tilemap:c.tilemap??null,shares:decoded.animation.cels.map(other=>!!c.surface&&c.surface.pixels.buffer===other.surface?.pixels.buffer)}))});fullDocumentCase('tilemap-'+name,encoded,decoded,{tilemapRuntime:{pixels:Array.from(new Uint32Array(decoded.layers[0].pixels.buffer,decoded.layers[0].pixels.byteOffset,decoded.layers[0].pixels.byteLength/4)),width:decoded.layers[0].width,height:decoded.layers[0].height,owners:decoded.animation.cels.filter(c=>!c.linkedCelId).map(c=>({id:c.id,tilemap:{tileWidth:c.tilemap.tileWidth,tileHeight:c.tilemap.tileHeight,columns:c.tilemap.columns,rows:c.tilemap.rows,cells:c.tilemap.cells.flatMap((cell,index)=>cell?[{index,...cell}]:[])}}))}});};
 tileCostCase('dense');tileCostCase('deflated',null,6);
 tileCostCase('empty',d=>{d.animation.cels[0].tilemap.cells=[];});
 tileCostCase('sparse',d=>{d.animation.cels[0].tilemap.columns=2;});
 tileCostCase('coercion',d=>{d.animation.cels[0].tilemap=tileGrid;});
 for(const metadata of ['none','dense','sparse','surface'])tileCostCase('linked-'+metadata,d=>{const owner=d.animation.cels[0],linked={id:'linked-tile',layerId:owner.layerId,frameId:'linked-frame',linkedCelId:owner.id};d.animation.frames.push({id:'linked-frame',duration:100});d.animation.activeFrameId='linked-frame';if(metadata!=='none')linked.tilemap=structuredClone(owner.tilemap);if(metadata==='sparse')linked.tilemap.cells=[];if(metadata==='surface')Object.assign(linked,{...owner,id:linked.id,frameId:linked.frameId,linkedCelId:owner.id});d.animation.cels.push(linked);});
 tileCostCase('dense-reordered',d=>{const grid=d.animation.cels[0].tilemap;grid.columns=2;grid.cells=[{...grid.cells[0],index:1,rotation:3},{...grid.cells[0],index:0,flipHorizontal:true}];});
 tileCostCase('linked-reordered',d=>{const owner=d.animation.cels[0];owner.tilemap.columns=2;owner.tilemap.cells=[{...owner.tilemap.cells[0],index:1,rotation:3},{...owner.tilemap.cells[0],index:0,flipHorizontal:true}];d.animation.frames.push({id:'reordered-frame',duration:100});d.animation.activeFrameId='reordered-frame';d.animation.cels.push({id:'reordered-linked',layerId:owner.layerId,frameId:'reordered-frame',linkedCelId:owner.id,tilemap:structuredClone(owner.tilemap)});});
 tileCostCase('independent-shared-cache',d=>{const owner=d.animation.cels[0];d.animation.frames.push({id:'other-tile-frame',duration:250});d.animation.cels.push({...owner,id:'other-tile',frameId:'other-tile-frame',tilemap:structuredClone(owner.tilemap)});});
 for(let rotation=0;rotation<4;++rotation)for(const flip of [false,true])tileCostCase('transform-'+rotation+'-'+flip,(d,files)=>{const grid=d.animation.cels[0].tilemap;grid.cells[0].rotation=rotation;grid.cells[0].flipHorizontal=flip;grid.cells[0].flipVertical=!flip;files[d.tilesets[0].dataFile]=new Uint8Array([10,20,30,255,40,50,60,128,70,80,90,0,100,110,120,255]);});
 tileCostCase('long-reversed-link-chain',d=>{const owner=d.animation.cels[0];let previous=owner.id;for(let n=1;n<192;++n){const frameId='chain-frame-'+n,id='chain-cel-'+n;d.animation.frames.push({id:frameId,duration:100});d.animation.cels.push({id,layerId:owner.layerId,frameId,linkedCelId:previous});previous=id;d.animation.activeFrameId=frameId;}d.animation.cels.reverse();});
 fs.writeFileSync(path.join(fullCostDirectory,'tilemap-probes.json'),JSON.stringify(tileProbes,null,2));

 const freeModule=await source('free-tile.ts');
 const freeDocument=modelModule.createDocument('free cost',6,5,'rgba'),freeSet=tileModule.createSolidTileset('free-resource','Source',2,1,{r:10,g:20,b:30,a:255},'free-pixels');
 freeSet.pixels.set([10,20,30,255,100,110,120,128]);freeDocument.tilesets=[freeSet];
 const freeLayer=freeDocument.layers[0];freeLayer.kind='free-tile';freeLayer.freeTileSetId='free-set';freeLayer.freeTileSources=[{id:'free-source',name:'Source',tilesetId:freeSet.id,visible:true,locked:false,opacity:1,blendMode:'normal',offsetX:-1,offsetY:0}];
 const freeCel=animationModule.ensureAnimationDocument(freeDocument).cels[0];freeCel.freeTiles={instances:[{id:'instance',sourceId:'free-source',x:3,y:2}]};freeCel.surface=freeModule.renderFreeTileSurface(freeCel.freeTiles,freeModule.freeTileSourceRefs(freeLayer.freeTileSources,freeDocument.tilesets),'rgba',6,5,-1,1);animationModule.refreshActiveAnimationFrame(freeDocument);
 const freeArchive=encodeProject(freeDocument),freeProbes=[];let freeCases=0;
 const freeCostCase=(name,change,level=0)=>{const files=fflate.unzipSync(freeArchive),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));change?.(manifest.document,files);files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level}),decoded=decodeProject(encoded);freeProbes.push({name,layers:decoded.layers.map(l=>Object.keys(l)),cels:decoded.animation.cels.map(c=>({keys:Object.keys(c),surface:c.surface?Object.keys(c.surface):null,freeTiles:c.freeTiles??null})),sources:decoded.layers[0].freeTileSources});
 const runtime=value=>({sources:value.layers[0].freeTileSources,cels:value.animation.cels.filter(c=>!c.linkedCelId).map(c=>({id:c.id,freeTiles:c.freeTiles,width:c.surface.width,height:c.surface.height,offsetX:c.surface.offsetX,offsetY:c.surface.offsetY,pixels:Array.from(new Uint32Array(c.surface.pixels.buffer,c.surface.pixels.byteOffset,c.surface.pixels.byteLength/4))}))});
 const saved=encodeProject(cloneHistoryDocument(decoded)),savedDocument=JSON.parse(fflate.strFromU8(fflate.unzipSync(saved)['manifest.json'])).document;
 fullDocumentCase('free-'+name,encoded,decoded,{freeRuntime:runtime(decoded),freeReopenedRuntime:runtime(decodeProject(saved)),freeSaved:{layers:savedDocument.layers.map(l=>({id:l.id,sources:l.freeTileSources})),cels:savedDocument.animation.cels.filter(c=>c.freeTiles).map(c=>({id:c.id,freeTiles:c.freeTiles}))}});++freeCases;};
 freeCostCase('defaults');
 freeCostCase('unknown-fields',d=>{const source=d.layers[0].freeTileSources[0],cel=d.animation.cels[0].freeTiles;source.customSource={nested:[1,null,'extra']};source.displayColor={r:1,g:2,b:3,a:4,customColor:9};cel.customCel='discard';cel.instances[0].customInstance={nested:true};});
 freeCostCase('deflated',null,6);
 freeCostCase('empty',d=>{d.animation.cels[0].freeTiles.instances=[];});
 for(const alias of ['free-resource','free-pixels'])freeCostCase('alias-'+alias,d=>{d.animation.cels[0].freeTiles.instances[0].sourceId=alias;});
 freeCostCase('source-sheet-name',d=>{d.layers[0].freeTileSources[0].name='Owned source name';});
 freeCostCase('source-name-missing',d=>{delete d.layers[0].freeTileSources[0].name;});
 for(const [index,name] of [null,false,true,0,1.5,[],{},'','   ','Source🌙'].entries())freeCostCase('source-name-normalize-'+index,d=>{d.layers[0].freeTileSources[0].name=name;});
 freeCostCase('source-metadata',d=>{const source=d.layers[0].freeTileSources[0];source.description='description';source.displayColor={r:1,g:2,b:3,a:4};source.locked=true;source.opacity=.6;source.blendMode='multiply';});
 freeCostCase('hidden-source',d=>{d.layers[0].freeTileSources[0].visible=false;});
 freeCostCase('hidden-instance',d=>{d.animation.cels[0].freeTiles.instances[0].visible=false;});
 freeCostCase('instance-metadata',d=>{const instance=d.animation.cels[0].freeTiles.instances[0];instance.locked=true;instance.opacity=0;instance.blendMode='screen';instance.rotation=0;instance.flipHorizontal=false;});
 for(let rotation=0;rotation<4;++rotation)for(const flip of [false,true])freeCostCase('transform-'+rotation+'-'+flip,d=>{const instance=d.animation.cels[0].freeTiles.instances[0];instance.rotation=rotation;instance.flipHorizontal=flip;instance.flipVertical=!flip;});
 for(const blendMode of ['normal','multiply','screen','overlay'])freeCostCase('overlap-'+blendMode,d=>{const instances=d.animation.cels[0].freeTiles.instances;instances.push({...instances[0],id:'top',x:2,opacity:.45,blendMode});});
 freeCostCase('shared-source-layers',d=>{const layer=d.layers[0],cel=d.animation.cels[0];d.layers.push({...layer,id:'shared-free-layer',name:'Shared layer'});d.animation.cels.push({...cel,id:'shared-free-cel',layerId:'shared-free-layer',freeTiles:{instances:[{id:'shared-instance',sourceId:'free-source',x:2,y:1}]}});});
 freeCostCase('independent-shared-cache',d=>{const cel=d.animation.cels[0];d.animation.frames.push({id:'second-free-frame',duration:230});d.animation.cels.push({...cel,id:'second-free-cel',frameId:'second-free-frame',freeTiles:{instances:[{id:'second-instance',sourceId:'free-source',x:1,y:1}]}});});
 for(const [index,value] of [null,true,false,0,1.5,'2',[],{},9007199254740992].entries())freeCostCase('source-normalize-'+index,d=>{const source=d.layers[0].freeTileSources[0];for(const key of ['visible','locked','opacity','blendMode','offsetX','offsetY','description','displayColor'])source[key]=value;});
 for(const opacity of [-2,2])freeCostCase('source-opacity-'+opacity,d=>{d.layers[0].freeTileSources[0].opacity=opacity;});
 freeCostCase('source-color-round-clamp',d=>{d.layers[0].freeTileSources[0].displayColor={r:-.5,g:.5,b:254.5,a:999};});
 freeCostCase('source-color-incomplete',d=>{d.layers[0].freeTileSources[0].displayColor={r:1,g:2,b:3};});
 freeCostCase('source-color-string-channel',d=>{d.layers[0].freeTileSources[0].displayColor={r:'1',g:2,b:3,a:4};});
 for(const offset of [-67108864,67108864])freeCostCase('source-offset-boundary-'+offset,d=>{const source=d.layers[0].freeTileSources[0];source.offsetX=offset;source.offsetY=offset;});
 for(const [index,value] of [null,false,true,0,[],{}].entries())freeCostCase('instance-nonstring-tile-id-'+index,d=>{d.animation.cels[0].freeTiles.instances[0].tileId=value;});
 const addFreeSources=(d,files,collision=false)=>{
  const layer=d.layers[0],original=d.tilesets[0];
  for(let n=1;n<=2;++n){const id='multi-sheet-'+n,file='tilesets/'+id+'.rgba';d.tilesets.push({...original,id,name:'Original sheet '+n,tileIds:['multi-tile-'+n],tileSlots:['multi-tile-'+n],dataFile:file});files[file]=new Uint8Array(n===1?[220,30,40,255,10,150,20,128]:[20,30,220,255,200,100,10,255]);layer.freeTileSources.push({id:collision&&n===1?'free-pixels':'multi-source-'+n,name:'Source '+n,tilesetId:id,description:'source '+n,visible:true,locked:false,opacity:n===1?.7:1,blendMode:n===1?'screen':'normal',offsetX:n-1,offsetY:n-1});}
  d.animation.cels[0].freeTiles.instances.push({id:'multi-instance-1',sourceId:'multi-sheet-1',x:2,y:1},{id:'multi-instance-2',sourceId:'multi-tile-2',x:1,y:2});
 };
 freeCostCase('multiple-sources',addFreeSources);
 freeCostCase('multiple-reversed',(d,files)=>{addFreeSources(d,files);d.layers[0].freeTileSources.reverse();d.animation.cels[0].freeTiles.instances.reverse();});
 freeCostCase('alias-collision-first-source',(d,files)=>{addFreeSources(d,files,true);d.animation.cels[0].freeTiles.instances.push({id:'collision',sourceId:'free-pixels',x:0,y:0});});
 freeCostCase('alias-collision-reversed',(d,files)=>{addFreeSources(d,files,true);d.layers[0].freeTileSources.reverse();d.animation.cels[0].freeTiles.instances.push({id:'collision',sourceId:'free-pixels',x:0,y:0});});
 freeCostCase('multiple-shared-layers',(d,files)=>{addFreeSources(d,files);const layer=d.layers[0],cel=d.animation.cels[0];d.layers.push({...layer,id:'multi-shared-layer',name:'Shared multiple'});d.animation.cels.push({...cel,id:'multi-shared-cel',layerId:'multi-shared-layer',freeTiles:{instances:[{id:'other',sourceId:'multi-tile-2',x:2,y:0}]}});});
 console.log('Actual legacy free-tile cost archives: '+freeCases);

 for(const key of ['visible','locked','flipHorizontal','flipVertical','rotation','opacity','blendMode']){const files=fflate.unzipSync(freeArchive),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));manifest.document.animation.cels[0].freeTiles.instances[0][key]=null;files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));assert.throws(()=>decodeProject(fflate.zipSync(files,{level:0})),key+' explicit null is corrupt');}
 const rejectedFree=[];
 const freeReject=(name,change)=>{const files=fflate.unzipSync(freeArchive),manifest=JSON.parse(fflate.strFromU8(files['manifest.json']));change(manifest.document,files);files['manifest.json']=fflate.strToU8(JSON.stringify(manifest));const encoded=fflate.zipSync(files,{level:0});assert.throws(()=>decodeProject(encoded),name);const file='free-rejected-'+name+'.moonsprite';fs.writeFileSync(path.join(fullCostDirectory,file),encoded);rejectedFree.push({name,file});};
 const duplicateFreeLayer=d=>{const layer=d.layers[0],cel=d.animation.cels[0];d.layers.push({...layer,id:'second-free-owner',name:'Second owner',freeTileSources:structuredClone(layer.freeTileSources)});d.animation.cels.push({...cel,id:'second-owner-cel',layerId:'second-free-owner'});return d.layers[1];};
 for(const setId of ['',' ',' free-set','free-set ','\u00a0free-set','free-set\ufeff'])freeReject('set-id-'+rejectedFree.length,d=>{d.layers[0].freeTileSetId=setId;});
 freeReject('duplicate-source',d=>{d.layers[0].freeTileSources.push({...d.layers[0].freeTileSources[0]});});
 freeReject('duplicate-sheet',d=>{d.layers[0].freeTileSources.push({...d.layers[0].freeTileSources[0],id:'other-source'});});
 freeReject('cross-set-sheet',d=>{duplicateFreeLayer(d).freeTileSetId='other-set';});
 freeReject('cross-set-source',d=>{const other=duplicateFreeLayer(d);other.freeTileSetId='other-set';const sheet={...d.tilesets[0],id:'other-sheet'};d.tilesets.push(sheet);other.freeTileSources[0].tilesetId=sheet.id;});
 freeReject('inconsistent-shared-source',d=>{duplicateFreeLayer(d).freeTileSources[0].opacity=.5;});
 freeReject('sheet-multiple-tiles',(d,files)=>{const sheet=d.tilesets[0];sheet.columns=2;sheet.tileIds.push('extra');files[sheet.dataFile]=new Uint8Array([...files[sheet.dataFile],...files[sheet.dataFile]]);});
 freeReject('sheet-padded-grid',(d,files)=>{const sheet=d.tilesets[0];sheet.rows=2;files[sheet.dataFile]=new Uint8Array([...files[sheet.dataFile],...files[sheet.dataFile]]);});
 freeReject('grid-owner-claim',d=>{const other=duplicateFreeLayer(d);other.kind='tilemap';other.tilemapTilesetId='free-resource';delete other.freeTileSetId;delete other.freeTileSources;const cel=d.animation.cels[1];delete cel.freeTiles;cel.tilemap={tileWidth:2,tileHeight:1,columns:3,rows:5,cells:[]};});
 for(const [index,value] of ['', 'free-pixels'].entries())freeReject('instance-string-tile-id-'+index,d=>{d.animation.cels[0].freeTiles.instances[0].tileId=value;});
 for(const [index,value] of [null,'',false,0,[],{}].entries())freeReject('instance-invalid-source-id-'+index,d=>{d.animation.cels[0].freeTiles.instances[0].sourceId=value;});
 freeReject('instance-missing-source-id',d=>{delete d.animation.cels[0].freeTiles.instances[0].sourceId;});
 for(const field of ['freeTileSetId','freeTileSources']){
  freeReject('missing-'+field,d=>{delete d.layers[0][field];d.animation.cels[0].freeTiles.instances=[];});
  for(const [index,value] of [null,false,0,[],{}].entries())freeReject('invalid-'+field+'-'+index,d=>{d.layers[0][field]=value;d.animation.cels[0].freeTiles.instances=[];});
 }
 freeReject('empty-source-list',d=>{d.layers[0].freeTileSources=[];d.animation.cels[0].freeTiles.instances=[];});
 freeReject('legacy-only-at-schema21',d=>{const layer=d.layers[0];delete layer.freeTileSetId;delete layer.freeTileSources;layer.freeTileTilesetId='free-resource';d.animation.cels[0].freeTiles.instances=[];});
 fs.writeFileSync(path.join(fullCostDirectory,'free-rejected.json'),JSON.stringify(rejectedFree));assert.equal(rejectedFree.length,37);
 fs.writeFileSync(path.join(fullCostDirectory,'free-probes.json'),JSON.stringify(freeProbes,null,2));
 fs.writeFileSync(path.join(fullCostDirectory,'cases.json'),JSON.stringify(fullCostRows));assert.equal(specialCases,40);assert.equal(fullCostRows.length,193);assert.equal(freeCases,63);
 const costDirectory=path.join(out,'compiled-cost');fs.mkdirSync(costDirectory,{recursive:true});fs.writeFileSync(path.join(costDirectory,'graphs.json'),JSON.stringify(costCases));
 console.log('Actual legacy historyDocumentBytes transfer graphs: '+costCases.length+' dense/indexed/sparse/alias/UTF16/Map/cycle cases; sparse getters remain lazy');
 fs.writeFileSync(path.join(fixtureRoot,'compiled-latest.txt'),run);
 console.log('Actual legacy compiler + hydrate produced independent unaligned channel transitions');
})().catch(error=>{console.error(error);process.exitCode=1;});
