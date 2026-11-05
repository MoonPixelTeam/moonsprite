// Uses the actual legacy createDocument/encodeProject via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
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
 const {zipSync,unzipSync,strToU8,strFromU8,Zip,ZipPassThrough}=await import('fflate');
 const {encodeHistoryDelta,decodeHistoryDelta,packLocalHistory,unpackLocalHistorySnapshots}=await source('local-history-archive.ts');
 const {createDocument}=await source('document-model.ts');
 const {encodeProject}=await source('project-format-encode.ts');
 const {cloneHistoryDocument,compileLocalHistoryDelta}=await source('local-history-delta.ts');
 const write=(name,data)=>{const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
 const normalize=delta=>({...delta,patches:delta.patches.map(patch=>({...patch,
   before:ArrayBuffer.isView(patch.before)?{type:patch.before.constructor.name,hex:Buffer.from(patch.before.buffer,patch.before.byteOffset,patch.before.byteLength).toString('hex')}:patch.before,
   after:ArrayBuffer.isView(patch.after)?{type:patch.after.constructor.name,hex:Buffer.from(patch.after.buffer,patch.after.byteOffset,patch.after.byteLength).toString('hex')}:patch.after}))});
 if(process.argv.includes('--verify')){
  const cases=JSON.parse(fs.readFileSync(path.join(out,'cases.json'),'utf8'));
  for(const name of cases.valid){
   const input=unzipSync(fs.readFileSync(path.join(out,name,'legacy.zip'))),im=JSON.parse(strFromU8(input['manifest.json']));
   const files=unzipSync(fs.readFileSync(path.join(out,name,'native.zip'))),manifest=JSON.parse(strFromU8(files['manifest.json']));
   assert.equal(manifest.projectKey,im.projectKey);assert.equal(manifest.position,im.position);assert.deepEqual(manifest.labels,im.labels);assert.deepEqual(manifest.futureMetadata,im.futureMetadata);
   const expected=unpackLocalHistorySnapshots(input,im),actual=unpackLocalHistorySnapshots(files,manifest);
   actual.forEach((snapshot,index)=>{
    if('base' in snapshot){assert.deepEqual(normalize(snapshot.delta),normalize(expected[index].delta));assert.equal(snapshot.base,actual[index-1]);}
    else assert.deepEqual(Buffer.from(snapshot.archive),Buffer.from(expected[index].archive));
   });
  }
  for(const name of cases.deltas){
   const expected=decodeHistoryDelta(fs.readFileSync(path.join(out,name+'.zip'))),actual=decodeHistoryDelta(fs.readFileSync(path.join(out,name+'-native.zip')));
   assert.deepEqual(normalize(actual),normalize(expected));
  }
  const policyProject=path.join(out,'policy-native.moonsprite');
  if(fs.existsSync(policyProject)){
   const {decodeProject}=await source('project-format.ts');
   const serviceText=fs.readFileSync(path.join(legacy,'src/renderer/src/store/local-history-service.ts'),'utf8');
   const start=serviceText.indexOf('const documentFingerprint ='),end=serviceText.indexOf('const clampPosition =',start);
   assert(start>=0&&end>start);const context={result:{}};
   require('node:vm').runInNewContext(stripTypeScriptTypes(serviceText.slice(start,end))+'\nresult.fingerprint=documentFingerprint;',context);
   const decoded=decodeProject(fs.readFileSync(policyProject));
   assert.equal(context.result.fingerprint(decoded),fs.readFileSync(path.join(out,'policy-native-fingerprint.txt'),'utf8'));
   console.log('Actual legacy decoder matches native live-document fingerprint');
  }
  const persistenceIndex=process.argv.indexOf('--persistence-root');
  if(persistenceIndex>=0){
   assert(process.argv[persistenceIndex+1]);const owned=path.resolve(process.argv[persistenceIndex+1]),run=fs.readFileSync(path.join(owned,'latest.txt'),'utf8');assert(/^run-[0-9]+$/.test(run));
   const directory=path.join(owned,run,'中文&history'),names=fs.readdirSync(directory);assert.equal(names.length,1);assert(names[0].endsWith('.history'));
   const files=unzipSync(fs.readFileSync(path.join(directory,names[0]))),manifest=JSON.parse(strFromU8(files['manifest.json']));
   const input=unzipSync(fs.readFileSync(path.join(out,'incremental','legacy.zip'))),im=JSON.parse(strFromU8(input['manifest.json']));
   assert.equal(manifest.projectKey,im.projectKey);assert.equal(manifest.position,0);assert.equal(manifest.documentFingerprint,'closing-last');assert.deepEqual(manifest.labels,im.labels);assert.deepEqual(manifest.futureMetadata,im.futureMetadata);
   const expected=unpackLocalHistorySnapshots(input,im),actual=unpackLocalHistorySnapshots(files,manifest);assert.equal(actual.length,expected.length);
   actual.forEach((snapshot,index)=>{if('base' in snapshot){assert.deepEqual(normalize(snapshot.delta),normalize(expected[index].delta));assert.equal(snapshot.base,actual[index-1]);}else assert.deepEqual(Buffer.from(snapshot.archive),Buffer.from(expected[index].archive));});
   console.log('Actual legacy reader accepted asynchronously persisted native history and close-flushed latest generation');
  }
  console.log('Actual legacy reader accepted all native history archives and typed deltas');return;
 }
 const cases={valid:[],invalid:[],deltas:['typed','rgba','indexed'],badDeltas:[]};
 const base=createDocument('本地历史',4,4,'rgba'),baseBytes=encodeProject(base,{includePreview:false});
 const allTypes=[Uint8Array,Uint8ClampedArray,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array];
 const delta={label:'全部类型',bytes:512,origins:{before:[{x:-3,y:4}],after:[{x:5,y:-6}]},invalidation:{kind:'full'},affectedLayerIds:['图层'],requiresAnimationSelectionNormalization:true,snapshotFrameId:base.animation.activeFrameId,celTarget:{index:0,id:'cel',layerId:'layer',frameId:'frame'},futureMetadata:{kept:true},
  patches:allTypes.map((Type,index)=>({path:['layers','0','typed'+index],before:new Type([0,1,2,3]),after:new Type([4,5,6,7]),...(index===0?{offset:3,aliases:[['animation','cels','0','surface','pixels']]}:{})}))};
 write('typed.zip',encodeHistoryDelta(delta));
 for(const mode of ['rgba','indexed']){
  const before=createDocument(mode,4,4,mode),after=cloneHistoryDocument(before);after.layers[0].pixels[13]=123;
  const compiled=compileLocalHistoryDelta(before,after,'paint');assert(compiled);write(mode+'.zip',encodeHistoryDelta(compiled));
 }
 const saveCase=(name,manifest,snapshots,increments)=>{
  const deltas=manifest.labels.map(()=>null);
  const packed=packLocalHistory({manifest,snapshots,cachedDeltas:deltas,...(increments?{incrementalDeltas:increments}:{})});
  assert.equal(packed.decodedSnapshots,0);assert.equal(packed.compiledDeltas,0);
  write(name+'/legacy.zip',packed.archive);snapshots.forEach((bytes,index)=>write(name+'/input-'+index+'.bin',bytes));
  cases.valid.push(name);return packed.archive;
 };
 const oldManifest={version:2,projectKey:'project-old',position:1,labels:['修改'],futureMetadata:{kept:'原样'}};
 write('v2/legacy.zip',zipSync({'manifest.json':strToU8(JSON.stringify(oldManifest)),'snapshots/0.moonsprite':baseBytes,'snapshots/1.moonsprite':baseBytes}));cases.valid.push('v2');
 saveCase('opaque',{...oldManifest,projectKey:'project-opaque',labels:['一','二'],position:1.9},[new Uint8Array([7,8,9]),new Uint8Array([1,2]),new Uint8Array([3,4,5])]);
 const first=zipSync({same:new Uint8Array([1,2,3])},{level:0}),second=first.slice();second[34]^=1;
 saveCase('collision',{...oldManifest,projectKey:'project-collision'},[first,second]);
 for(const streaming of [false,true]){
  const recording=Uint8Array.from({length:32768},(_,index)=>index%251);
  const encode=files=>{if(!streaming)return zipSync(files,{level:0});const chunks=[],zip=new Zip((error,data)=>{if(error)throw error;chunks.push(data);});for(const [name,bytes] of Object.entries(files)){const file=new ZipPassThrough(name);zip.add(file);file.push(bytes,true);}zip.end();return Buffer.concat(chunks);};
  const snapshots=Array.from({length:8},(_,index)=>{const bytes=encode({'layer.rgba':new Uint8Array(100+index*23).fill(index),'timelapse/frame.png':recording});bytes[10]=index;return bytes;});
  saveCase(streaming?'streaming':'shared',{...oldManifest,projectKey:'project-shared',labels:snapshots.slice(1).map(()=> 'paint'),position:5},snapshots);
 }
 const increment=compileLocalHistoryDelta(base,Object.assign(cloneHistoryDocument(base),{name:'改名'}),'改名');assert(increment);
 saveCase('incremental',{...oldManifest,projectKey:'project-increment',labels:['改名'],position:1,documentFingerprint:'saved-generation'},[baseBytes,new Uint8Array()],[null,increment]);
 const invalid=(name,files,manifest)=>{files={...files,'manifest.json':strToU8(JSON.stringify(manifest))};let rejected=false;try{unpackLocalHistorySnapshots(files,manifest);}catch{rejected=true;}assert(rejected,name);write('invalid/'+name+'.zip',zipSync(files));cases.invalid.push(name);};
 const shared=unzipSync(fs.readFileSync(path.join(out,'shared/legacy.zip'))),sm=JSON.parse(strFromU8(shared['manifest.json']));
 invalid('negative-chunk',shared,{...sm,chunkLengths:[-1]});
 invalid('extra-bytes',shared,{...sm,chunkLengths:sm.chunkLengths.slice(1)});
 invalid('bad-id',shared,{...sm,snapshotChunks:sm.snapshotChunks.map(()=>[999999])});
 invalid('fractional-id',shared,{...sm,snapshotChunks:sm.snapshotChunks.map(()=>[.5])});
 invalid('empty-ids',shared,{...sm,snapshotChunks:sm.snapshotChunks.map(()=>[])});
 invalid('missing-index',shared,{...sm,snapshotChunks:[]});
 const incFiles=unzipSync(fs.readFileSync(path.join(out,'incremental/legacy.zip'))),incManifest=JSON.parse(strFromU8(incFiles['manifest.json']));
 invalid('increment-first',incFiles,{...incManifest,snapshotDeltas:[true,true]});
 invalid('increment-type',incFiles,{...incManifest,snapshotDeltas:[false,1]});
 invalid('increment-count',incFiles,{...incManifest,snapshotDeltas:[]});
 const missing={...unzipSync(fs.readFileSync(path.join(out,'v2/legacy.zip')))};delete missing['snapshots/1.moonsprite'];invalid('missing-v2',missing,oldManifest);
 const badDelta=(name,mutate)=>{const files=unzipSync(encodeHistoryDelta(delta)),value=JSON.parse(strFromU8(files['delta.json']));mutate(value,files);files['delta.json']=strToU8(JSON.stringify(value));const archive=zipSync(files);assert.throws(()=>decodeHistoryDelta(archive),undefined,name);write('invalid-deltas/'+name+'.zip',archive);cases.badDeltas.push(name);};
 badDelta('prototype',d=>d.patches[0].path=['__proto__','polluted']);
 badDelta('alias',d=>d.patches[0].aliases=[['constructor']]);
 badDelta('offset-negative',d=>d.patches[0].offset=-1);
 badDelta('offset-fractional',d=>d.patches[0].offset=.5);
 badDelta('offset-clamped',d=>d.patches[0].before.type='Uint8ClampedArray');
 badDelta('offset-size',(d,f)=>f[d.patches[0].after.bufferFile]=new Uint8Array(2));
 badDelta('type',d=>d.patches[0].before.type='BigInt64Array');
 badDelta('alignment',(d,f)=>f[d.patches[2].before.bufferFile]=new Uint8Array(3));
 badDelta('missing-buffer',(d,f)=>delete f[d.patches[0].before.bufferFile]);
 badDelta('cel-index',d=>d.celTarget.index=-1);
 badDelta('frame',d=>d.snapshotFrameId=null);
 badDelta('bytes',d=>d.bytes=-1);
 badDelta('origins',d=>d.origins.after[0].x='5');
 badDelta('invalidation',d=>d.invalidation.kind='none');
 badDelta('path-empty',d=>d.patches[0].path=[]);
 write('cases.json',JSON.stringify(cases,null,2));console.log('Generated actual legacy history cases:',cases.valid.length,'archives,',cases.deltas.length,'typed deltas,',cases.invalid.length+cases.badDeltas.length,'rejections');
})().catch(error=>{console.error(error);process.exitCode=1;});
