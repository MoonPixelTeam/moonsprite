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
 if(process.argv[4]==='--verify')console.log('Verify stage: load legacy compiler');
 const {compileLocalHistoryDelta}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/local-history-delta.ts')));
 const rows=[];
 const run=(name,length,ao,bo,changes,afterLength=length,type='Uint8Array',otherType=type)=>{
  const make=(n,offset,tag)=>{const buffer=new ArrayBuffer(n+offset);const value=tag==='DataView'?new DataView(buffer,offset,n):new globalThis[tag](buffer,offset,n/globalThis[tag].BYTES_PER_ELEMENT);const bytes=new Uint8Array(buffer,offset,n);for(let i=0;i<n;i++)bytes[i]=(i*17+3)&255;return value;};
  const a=make(length,ao,type),b=make(afterLength,bo,otherType),bb=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);for(const index of changes)bb[index]^=0x55;
  const result=compileLocalHistoryDelta({layers:[],payload:a},{layers:[],payload:b},name);
  rows.push({name,type,otherType,a:{offset:ao,bytes:[...new Uint8Array(a.buffer)]},b:{offset:bo,bytes:[...new Uint8Array(b.buffer)]},length,afterLength,
   result:result?{bytes:result.bytes,patches:result.patches.map(p=>({offset:p.offset??null,before:[...new Uint8Array(p.before.buffer,p.before.byteOffset,p.before.byteLength)],after:[...new Uint8Array(p.after.buffer,p.after.byteOffset,p.after.byteLength)]}))}:null});
 };
 run('empty',0,0,0,[]);run('equal-aligned',4096,0,0,[]);run('equal-unaligned',2051,1,3,[]);
 for(const offset of [0,1,2,3])for(const length of [1,3,4,1023,1024,1025,2048,3077]){
  run('single-'+offset+'-'+length,length,offset,offset===0?4:offset,[length-1]);
  run('sparse-'+offset+'-'+length,length,offset,offset,[...new Set([0,Math.floor(length/2),length-1])]);
 }
 run('dense',4096,0,4,Array.from({length:4096},(_,i)=>i));
 run('uint32',4096,4,8,[1,1024,2047,4095],4096,'Uint32Array');run('uint16',2048,2,4,[0,1023,2047],2048,'Uint16Array');
 run('data-view',2051,1,3,[0,1024,2050],2051,'DataView');
 run('type-change',8,0,0,[],8,'Uint8Array','Uint8ClampedArray');run('grow',2,1,3,[0,7],8);run('shrink',8,0,0,[1],2);
 const {encodeHistoryDelta,decodeHistoryDelta}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/local-history-archive.ts')));
 const archiveDirectory=out.replace(/\.json$/,'-archives');fs.mkdirSync(archiveDirectory,{recursive:true});
 if(process.argv[4]==='--verify'){
  console.log('Verify stage: read case manifest');
  const assert=require('node:assert/strict');const allCases=JSON.parse(fs.readFileSync(out.replace(/\.json$/,'-objects.json'),'utf8'));const prefix=process.argv[5];const cases=prefix?allCases.filter(row=>row.name.startsWith(prefix)):allCases;if(prefix&&!cases.length)throw new Error('No verification cases match '+prefix);let verified=0,tilesetSaved=0;
  console.log('Verify stage: load legacy project decoder; selected cases='+cases.length);
  const {decodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format.ts')));let saved=0,metadataSaved=0,groupMaskSaved=0;
  const {encodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-encode.ts')));
  // Legacy expects browser Uint8Array.slice copies, not Buffer.slice aliases.
  const readDecodedProject=source=>decodeProject(new Uint8Array(fs.readFileSync(path.join(archiveDirectory,source))));
  for(const row of cases){if(prefix)console.log('Verify case: '+row.name);if(row.name.startsWith('document-tileset-name-'))for(const source of [row.documentBefore,row.documentAfter]){if(prefix)console.log('Decode source: '+source);const original=readDecodedProject(source);if(prefix)console.log('Decode native: '+source);const native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));assert.deepStrictEqual(native.tilesets,original.tilesets,source+' normalized tileset');tilesetSaved++;}
  if(row.name.startsWith('document-cel-normalize-')||row.name.startsWith('document-linked-cel'))for(const source of [row.documentBefore,row.documentAfter]){const original=readDecodedProject(source),native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));const expected=decodeProject(encodeProject(original,{includePreview:false}));assert.deepStrictEqual(native.animation.cels.map(c=>({id:c.id,zIndex:c.zIndex,opacity:c.opacity})),expected.animation.cels.map(c=>({id:c.id,zIndex:c.zIndex,opacity:c.opacity})),source+' normalized cels');if(row.name.startsWith('document-cel-normalize-mask-')){assert.deepStrictEqual(native.animation.layerMasks,expected.animation.layerMasks,source+' recovered inline mask');assert.deepStrictEqual(native.animation.groupMasks,expected.animation.groupMasks,source+' recovered group mask');}if(row.name.startsWith('document-cel-normalize-tile-raw-'))assert.deepStrictEqual(native.animation.cels.map(c=>c.tilemap),expected.animation.cels.map(c=>c.tilemap),source+' recovered tilemap');if(row.name.startsWith('document-cel-normalize-free-raw-'))assert.deepStrictEqual(native.animation.cels.map(c=>c.freeTiles),expected.animation.cels.map(c=>c.freeTiles),source+' recovered free tiles');if(row.name.startsWith('document-cel-normalize-text-raw-'))assert.deepStrictEqual(native.animation.cels.map(c=>c.text),expected.animation.cels.map(c=>c.text),source+' recovered text');if(['document-cel-normalize-offset-','document-cel-normalize-resource-','document-cel-normalize-tile-raw-','document-cel-normalize-free-raw-'].some(prefix=>row.name.startsWith(prefix))){const surfaces=d=>d.animation.cels.map(c=>({id:c.id,width:c.surface?.width,height:c.surface?.height,x:c.surface?.offsetX,y:c.surface?.offsetY,pixels:c.surface?[...c.surface.pixels]:null}));assert.deepStrictEqual(surfaces(native),surfaces(expected),source+' recovered raster');}}
  if(row.name.startsWith('document-frame-normalize-'))for(const source of [row.documentBefore,row.documentAfter]){const original=readDecodedProject(source),native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));assert.deepStrictEqual(native.animation.frames,original.animation.frames,source+' normalized frames');assert.equal(native.animation.activeFrameId,original.animation.activeFrameId,source+' active frame');assert.equal(native.animation.loop,original.animation.loop,source+' loop');}
  if(row.name.startsWith('document-loop-normalize-'))for(const source of [row.documentBefore,row.documentAfter]){const original=readDecodedProject(source),native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));assert.deepStrictEqual(native.animation.loopSections,original.animation.loopSections,source+' normalized loops');}
  if(row.name.startsWith('document-group-normalization-'))for(const source of [row.documentBefore,row.documentAfter]){const original=readDecodedProject(source),native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));assert.deepStrictEqual(native.layers.map(l=>l.groupId),original.layers.map(l=>l.groupId),source+' normalized group membership');}
  if(row.name.startsWith('document-linked-layers-'))for(const source of [row.documentBefore,row.documentAfter]){const original=readDecodedProject(source);const native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));const expected=decodeProject(encodeProject(original,{includePreview:false}));assert.deepStrictEqual(native.layers.map(l=>({id:l.id,displayColor:l.displayColor})),expected.layers.map(l=>({id:l.id,displayColor:l.displayColor})),source+' linked colors');assert.deepStrictEqual(native.animation.cels.map(c=>({id:c.id,zIndex:c.zIndex,opacity:c.opacity})),expected.animation.cels.map(c=>({id:c.id,zIndex:c.zIndex,opacity:c.opacity})),source+' independent linked-layer scalars');}
  if(row.result){const native=decodeHistoryDelta(new Uint8Array(fs.readFileSync(path.join(archiveDirectory,row.name+'-native.zip')))),legacy=decodeHistoryDelta(new Uint8Array(fs.readFileSync(path.join(archiveDirectory,row.name+'-legacy.zip'))));assert.deepStrictEqual(native,legacy,row.name);verified++;}
   if(row.groupBefore||row.maskBefore)for(const source of [row.groupBefore??row.maskBefore,row.groupAfter??row.maskAfter]){const original=readDecodedProject(source);const canonical=decodeProject(encodeProject(original,{includePreview:false})),native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));if(row.groupBefore)assert.deepStrictEqual(native.groups,canonical.groups,source+' groups');else{assert.deepStrictEqual(native.animation.layerMasks,canonical.animation.layerMasks,source+' layerMasks');assert.deepStrictEqual(native.animation.groupMasks,canonical.animation.groupMasks,source+' groupMasks');}groupMaskSaved++;}
   if(row.metadataBefore)for(const source of [row.metadataBefore,row.metadataAfter]){const original=readDecodedProject(source);if(!original.displaySettings.symmetryCenter)continue;const native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));for(const key of ['name','width','height','colorMode','pixelFormat','displaySettings','statistics','createdAt','updatedAt'])assert.deepStrictEqual(native[key],original[key],source+' '+key);metadataSaved++;}
   if(row.recordingBefore)for(const source of [row.recordingBefore,row.recordingAfter]){const original=readDecodedProject(source),native=readDecodedProject(source.replace('.moonsprite','-native-saved.moonsprite'));assert.deepStrictEqual(native.timelapse,original.timelapse,source);original.timelapse.snapshots.forEach((frame,index)=>{if(frame.local)assert.deepStrictEqual(Object.keys(native.timelapse.snapshots[index].local),Object.keys(frame.local),source+' local keys');});saved++;}
  }
  console.log('Verification scope: '+(prefix??'all')+'; '+cases.length+' object cases');
  console.log('Actual legacy decoder verified '+tilesetSaved+' native-saved tileset-name projects');
  console.log('Actual legacy decoder verified '+groupMaskSaved+' native-saved group/mask projects');
  console.log('Actual legacy decoder verified '+metadataSaved+' native-saved metadata projects');
  console.log('Actual legacy decoder verified '+saved+' native-saved recording projects');
  console.log('Actual legacy decodeHistoryDelta verified '+verified+' native compiler-result archives');return;
 }

 const {getLayerStorageOrigin}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const objects=[];
 const scalar=value=>typeof value==='undefined'?{kind:'undefined'}:value===null?{kind:'null'}:typeof value==='number'?{kind:'number',value:Object.is(value,-0)?'-0':String(value)}:typeof value==='string'?{kind:'string',value}:typeof value==='boolean'?{kind:'boolean',value}:ArrayBuffer.isView(value)?{kind:'view',type:Object.prototype.toString.call(value).slice(8,-1),offset:value.byteOffset,length:value.byteLength,bytes:[...new Uint8Array(value.buffer)]}:null;
 const pair=(name,a,b,extra={})=>{
  let identitySerial=0;const identities=new Map();
  const graph=document=>{const ids=new Map(),values=[];const visit=value=>{
   if(value&&typeof value==='object'&&ids.has(value))return ids.get(value);
   const index=values.length;values.push(null);const primitive=scalar(value);
   if(value&&typeof value==='object'){ids.set(value,index);if(!identities.has(value))identities.set(value,++identitySerial);}
   values[index]=primitive??{kind:Array.isArray(value)?'array':Object.getPrototypeOf(value)?.constructor?.name==='Object'?'object':'other'};
   if(value&&typeof value==='object')values[index].identity=identities.get(value);
   if(!primitive){if(Array.isArray(value))values[index].length=value.length;values[index].properties=Object.keys(value).map(key=>[key,visit(value[key])]);}return index;
  };const root=visit(document);return {root,values,layers:document.layers.map(layer=>({id:layer.id,width:layer.width,x:layer.offsetX,y:layer.offsetY,origin:getLayerStorageOrigin(layer),runtimeRaster:!!layer.runtimeRaster})),activeFrameId:document.animation?.activeFrameId??null};};
  const before=graph(a),after=graph(b),result=compileLocalHistoryDelta(a,b,name);
  if(result)fs.writeFileSync(path.join(archiveDirectory,name+'-legacy.zip'),encodeHistoryDelta(result));
  objects.push({name,before,after,...extra,result:result?{bytes:result.bytes,normalize:result.requiresAnimationSelectionNormalization,affected:result.affectedLayerIds,origins:result.origins,invalidation:result.invalidation,patches:result.patches.map(p=>({path:p.path,offset:p.offset??null,aliases:p.aliases??null,before:scalar(p.before),after:scalar(p.after)}))}:null});
 };
 const doc=payload=>({layers:[],payload});
 for(const [name,a,b] of [['unicode','\uD83D\uDE00','abc'],['negative-zero',-0,0],['nan',NaN,NaN],['nan-change',NaN,Infinity],['undefined-null',undefined,null],['bool',false,true],['million',1e6,1e21],['tiny',1e-6,1e-7],['negative',-1e-7,-123.456],['wide',1000000000000000100,1.7976931348623157e308]])pair(name,doc(a),doc(b));
 pair('field-order',doc({z:1,a:2}),doc({a:4,z:3}));pair('field-add',doc({a:1}),doc({a:1,b:undefined}));pair('primitive-object',doc(null),doc({}));pair('array-length',doc([1]),doc([1,2]));
 pair('root-identities',{layers:[],id:'a',filePath:'one',payload:1},{layers:[],id:'b',sourceFilePath:'two',payload:1});
 pair('pixel-exempt-scalars',{layers:[],dirty:false,updatedAt:'a',statistics:{operations:1}},{layers:[],dirty:true,updatedAt:'b',statistics:{operations:2}});
 const sharedA={n:1},sharedB={n:2};pair('alias-same',doc([sharedA,sharedA]),doc([sharedB,sharedB]));pair('alias-split',doc([sharedA,sharedA]),doc([{n:2},{n:2}]));pair('alias-merge',doc([{n:1},{n:1}]),doc([sharedB,sharedB]));
 const v1=new Uint8Array([1,2]),v2=new Uint8Array([3,4,5]);pair('view-replacement-alias',doc([v1,v1]),doc([v2,v2]));
 const v3=new Uint8Array([1,3]);pair('view-run-alias',doc([v1,v1]),doc([v3,v3]));
 const cycleA={n:1},cycleB={n:2};cycleA.self=cycleA;cycleB.self=cycleB;pair('cycles',doc(cycleA),doc(cycleB));
 pair('other-object',doc(new Date(0)),doc(new Date(1)));const sameDate=new Date(0);pair('shared-object-is',doc(sameDate),doc(sameDate));
 const pixel=(runtime=false)=>({id:'layer',width:2,height:2,offsetX:-2,offsetY:3,pixels:new Uint8Array(16),...(runtime?{runtimeRaster:{}}:{})});
 const layerA=pixel(),layerB=pixel();layerB.pixels[1]=5;layerB.pixels[15]=9;
 pair('layer-region',{layers:[layerA],animation:{activeFrameId:'frame'}},{layers:[layerB],animation:{activeFrameId:'frame'}});
 pair('layer-rename',{layers:[layerA]},{layers:[{...layerB,id:'other'}]});pair('runtime-gate',{layers:[pixel(true)]},{layers:[pixel(true)]});
 pair('array-hole',doc(new Array(2)),doc([undefined,undefined]));pair('nested-identity',doc({id:'one'}),doc({id:'two'}));
 const layerC=pixel();layerC.pixels=new Uint8Array([1,2,3]);pair('layer-resize',{layers:[layerA]},{layers:[layerC]});
 const floatA=new Float64Array([NaN,-0,1]),floatB=new Float64Array([NaN,0,1]);pair('float64-byte-pattern',doc(floatA),doc(floatB));
 const sharedObject={value:1};pair('shared-fast-path-bijection',doc([sharedObject,sharedObject]),doc([sharedObject,{value:2}]));
 // Resource graph adapters must expose the actual decoder's keys, scalar
 // values, typed tags and byte contents, rather than the encoded project JSON.
 const {createDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const {encodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-encode.ts')));
 const {decodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format.ts')));
 // Execute the actual sparse pixel commit lifecycle before fixture generation.
 {const assert=require('node:assert/strict');const animation=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/animation.ts')));const history=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/history.ts')));const d=createDocument('Sparse commit oracle',2,2,'rgba'),layer=d.layers[0];const timeline=animation.ensureAnimationDocument(d);timeline.cels=[];animation.refreshActiveAnimationFrame(d);assert.equal(timeline.cels.length,0);const edit=history.beginPixelEdit(layer.id);history.recordPixel(d,layer,edit,0,0xff123456);assert.equal(timeline.cels.length,0);const entry=history.commitPixelEdit(d,edit,'Sparse paint');assert.ok(entry);assert.equal(timeline.cels.length,0);animation.syncActiveAnimationLayer(d,layer.id);assert.equal(timeline.cels.length,1);const id=timeline.cels[0].id;entry.undo();animation.syncActiveAnimationLayer(d,layer.id);assert.equal(timeline.cels.length,1);assert.equal(timeline.cels[0].id,id);entry.redo();animation.syncActiveAnimationLayer(d,layer.id);assert.equal(timeline.cels.length,1);assert.equal(timeline.cels[0].id,id);console.log('Actual legacy sparse commit: no Cel before sync; undo/redo retain created Cel identity');}
 const resourceDocument=()=>{const d=createDocument('Resources',8,8,'rgba');d.customBrushes=[{id:'brush',name:'画笔😀',width:2,height:1,coverage:new Uint8Array([0,255]),colors:new Uint32Array([0x00123456,0xffabcdef]),sourceY:-2}];d.referenceImages=[{id:'reference',width:2,height:1,pixels:new Uint8ClampedArray([1,2,3,0,4,5,6,255])}];d.slices=[{id:'slice',name:'切片😀',x:1,y:2,width:3,height:4}];return d;};
 const resourcePair=(name,mutate,beforeMutate=()=>{})=>{
  const a=resourceDocument(),b=resourceDocument();beforeMutate(a);mutate(b);
  const decoded=[];const files=[];
  for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}
  const fragment=d=>({layers:[],customBrushes:d.customBrushes,referenceImages:d.referenceImages,slices:d.slices});
  pair(name,fragment(decoded[0]),fragment(decoded[1]),{resourceBefore:files[0],resourceAfter:files[1]});
 };
 resourcePair('resources-equal',()=>{});
 resourcePair('resources-empty',d=>{d.customBrushes=[];d.referenceImages=[];d.slices=[];},d=>{d.customBrushes=[];d.referenceImages=[];d.slices=[];});
 resourcePair('resources-scalars',d=>{d.customBrushes[0].name='更新';d.customBrushes[0].sourceX=0;d.customBrushes[0].sourceY=3;d.slices[0].name='另一片🚀';d.slices[0].x=2;});
 resourcePair('resources-bytes',d=>{d.customBrushes[0].coverage[1]=128;d.customBrushes[0].colors[0]=0x12345678;d.referenceImages[0].pixels[0]=22;d.referenceImages[0].pixels[7]=1;});
 resourcePair('resources-colors-undefined',d=>{delete d.customBrushes[0].colors;});
 resourcePair('resources-colors-absent-equal',d=>{delete d.customBrushes[0].colors;},d=>{delete d.customBrushes[0].colors;});
 resourcePair('resources-grow',d=>{d.customBrushes[0].width=3;d.customBrushes[0].coverage=new Uint8Array([1,2,3]);d.customBrushes[0].colors=new Uint32Array([0,1,2]);d.referenceImages[0].width=3;d.referenceImages[0].pixels=new Uint8ClampedArray(12);});
 resourcePair('resources-source-remove',d=>{delete d.customBrushes[0].sourceY;});
 resourcePair('resources-add-brush',d=>{d.customBrushes.push({...d.customBrushes[0],id:'second'});});
 resourcePair('resources-remove-reference',d=>{d.referenceImages=[];});
 resourcePair('resources-add-slice',d=>{d.slices.push({id:'second',name:'second',x:0,y:0,width:1,height:1});});
 resourcePair('resources-two-references',d=>{d.referenceImages.push({...d.referenceImages[0],id:'second'});},d=>{d.referenceImages.push({...d.referenceImages[0],id:'second'});});
 const timelineDocument=()=>{const d=resourceDocument();const first=d.animation.frames[0].id;d.animation.frames.push({id:'frame-two',duration:150},{id:'frame-three',duration:250,disabled:true});
  d.animation.loopSections=[{id:'loop',name:'循环😀',startFrameId:first,endFrameId:'frame-three',direction:'forward',repeatCount:null}];
  d.tilesets=[{id:'tileset',name:'图块😀',tileWidth:1,tileHeight:1,columns:2,rows:1,tileIds:['tile-a','tile-b'],tileSlots:['tile-a',null,'tile-b'],pixels:new Uint8ClampedArray([1,2,3,0,4,5,6,255])}];return d;};
 const timelinePair=(name,mutate,beforeMutate=()=>{})=>{const a=timelineDocument(),b=timelineDocument();
  // createDocument IDs are session-generated. Both project decoders must see
  // the same stable frame IDs before comparing timeline metadata fragments.
  const id=a.animation.frames[0].id,other=b.animation.frames[0].id;b.animation.frames[0].id=id;b.animation.activeFrameId=id;b.animation.loopSections[0].startFrameId=id;for(const cel of b.animation.cels)if(cel.frameId===other)cel.frameId=id;
  beforeMutate(a);mutate(b);const decoded=[],files=[];
  for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}
  const fragment=d=>({layers:[],tilesets:d.tilesets,animation:{frames:d.animation.frames,loopSections:d.animation.loopSections,activeFrameId:d.animation.activeFrameId,loop:d.animation.loop}});
  pair(name,fragment(decoded[0]),fragment(decoded[1]),{timelineBefore:files[0],timelineAfter:files[1]});
 };
 timelinePair('timeline-equal',()=>{});
 timelinePair('timeline-duration',d=>{d.animation.frames[1].duration=60000;});
 timelinePair('timeline-disabled',d=>{d.animation.frames[0].disabled=true;});
 timelinePair('timeline-active-loop',d=>{d.animation.activeFrameId='frame-two';d.animation.loop=false;});
 timelinePair('timeline-repeat-null-number',d=>{d.animation.loopSections[0].repeatCount=9999;});
 for(const direction of ['reverse','ping-pong','ping-pong-reverse'])timelinePair('timeline-direction-'+direction,d=>{d.animation.loopSections[0].direction=direction;d.animation.loopSections[0].name='新循环🚀';});
 timelinePair('timeline-section-range',d=>{d.animation.loopSections[0].startFrameId='frame-two';});
 timelinePair('timeline-add-frame',d=>{d.animation.frames.push({id:'frame-four',duration:1});});
 timelinePair('timeline-remove-loop',d=>{d.animation.loopSections=[];});
 timelinePair('timeline-tile-bytes',d=>{d.tilesets[0].pixels[0]=12;d.tilesets[0].pixels[3]=128;});
 timelinePair('timeline-tile-name',d=>{d.tilesets[0].name='另一图块🚀';});
 timelinePair('timeline-tile-slot-move',d=>{d.tilesets[0].tileSlots=[null,'tile-b','tile-a'];});
 timelinePair('timeline-tile-grow',d=>{d.tilesets[0].columns=3;d.tilesets[0].pixels=new Uint8ClampedArray([1,2,3,0,4,5,6,255,7,8,9,255]);});
 timelinePair('timeline-empty-tilesets',d=>{d.tilesets=[];},d=>{d.tilesets=[];});
 timelinePair('timeline-add-tileset',d=>{d.tilesets.push({...d.tilesets[0],id:'tileset-two'});});
 const {historyDocumentTransferView,historyDocumentBytes}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/local-history-delta.ts')));
 const rasterDocument=()=>{const d=resourceDocument();const layer=d.layers[0];layer.width=8;layer.height=8;layer.offsetX=-2;layer.offsetY=3;layer.pixels=new Uint8ClampedArray(256);for(let i=0;i<64;i++)layer.pixels.set([i,255-i,12,255],i*4);const cel=d.animation.cels[0];cel.surface={format:'rgba',width:8,height:8,offsetX:-2,offsetY:3,storageOriginX:0,storageOriginY:0,pixels:layer.pixels};return d;};
 const rasterPair=async(name,mutate,beforeMutate=()=>{},compression)=>{const a=rasterDocument(),b=structuredClone(a);beforeMutate(a);mutate(b);const decoded=[],files=[];for(const [side,d] of [['before',a],['after',b]]){let bytes=encodeProject(d,{includePreview:false});if(compression!==undefined){const {unzipSync,zipSync}=await import('fflate');bytes=zipSync(unzipSync(bytes),{level:compression});}const file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(historyDocumentTransferView(decodeProject(bytes)));}const fragment=d=>({layers:[],surfaces:[...d.layers,...d.animation.cels.filter(c=>c.surface).map(c=>c.surface)].map(s=>({pixels:s.pixels,...(s.runtimeRaster?{runtimeRaster:s.runtimeRaster}:{})}))});pair(name,fragment(decoded[0]),fragment(decoded[1]),{rasterBefore:files[0],rasterAfter:files[1]});};
 await rasterPair('raster-storage-equal',()=>{});
 await rasterPair('raster-storage-bytes',d=>{d.layers[0].pixels[0]=42;});
 const sparse=d=>{d.width=130;d.height=70;for(const s of [d.layers[0],d.animation.cels[0].surface]){s.width=130;s.height=70;}const pixels=new Uint8ClampedArray(130*70*4);pixels.set([1,2,3,255],(69*130+129)*4);d.layers[0].pixels=pixels;d.animation.cels[0].surface.pixels=pixels;};
 await rasterPair('raster-storage-sparse-equal',sparse,sparse);
 await rasterPair('raster-storage-sparse-change',d=>{sparse(d);d.layers[0].pixels[(69*130+129)*4]=22;},sparse);
 await rasterPair('raster-storage-sparse-two-tiles',d=>{sparse(d);d.layers[0].pixels.set([7,8,9,255],0);},sparse);
 const empty=d=>{sparse(d);d.layers[0].pixels.fill(0);};
 await rasterPair('raster-storage-sparse-empty',empty,empty);
 await rasterPair('raster-storage-sparse-empty-to-content',sparse,empty);
 await rasterPair('raster-storage-sparse-to-raw',()=>{},sparse);
 await rasterPair('raster-storage-two-cels',d=>{const cel=d.animation.cels[0];d.animation.frames.push({id:'storage-frame-two',duration:100});d.animation.cels.push({...cel,id:'storage-cel-two',frameId:'storage-frame-two',surface:{...cel.surface}});},d=>{const cel=d.animation.cels[0];d.animation.frames.push({id:'storage-frame-two',duration:100});d.animation.cels.push({...cel,id:'storage-cel-two',frameId:'storage-frame-two',surface:{...cel.surface}});});
 await rasterPair('raster-storage-raw-stored',d=>{d.layers[0].pixels[12]=99;},()=>{},0);
 await rasterPair('raster-storage-raw-deflated',d=>{d.layers[0].pixels[12]=99;},()=>{},6);
 await rasterPair('raster-storage-sparse-deflated',d=>{sparse(d);d.layers[0].pixels[(69*130+129)*4]=44;},sparse,6);
 const layerPair=(name,mutate,beforeMutate=()=>{})=>{const a=rasterDocument(),b=structuredClone(a);beforeMutate(a);mutate(b);const decoded=[],files=[];for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(historyDocumentTransferView(decodeProject(bytes)));}const fragment=d=>({layers:d.layers,animation:{cels:d.animation.cels,activeFrameId:d.animation.activeFrameId}});pair(name,fragment(decoded[0]),fragment(decoded[1]),{layerBefore:files[0],layerAfter:files[1]});};
 layerPair('layers-equal',()=>{});
 layerPair('layers-values',d=>{Object.assign(d.layers[0],{name:'新图层🚀',description:'备注',visible:false,locked:true,blendMode:'screen',autoLinkAnimationCels:true,clippingMask:true,displayColor:{r:1,g:2,b:3,a:0}});});
 layerPair('layers-opacity-projection',d=>{d.layers[0].opacity=.8;d.animation.cels[0].opacity=.25;});
 layerPair('layers-opacity-absent',d=>{d.layers[0].opacity=.6;delete d.animation.cels[0].opacity;});
 layerPair('layers-zero-opacity',d=>{d.animation.cels[0].opacity=0;});
 layerPair('layers-pixels',d=>{d.layers[0].pixels[12]=99;});
 layerPair('layers-geometry',d=>{const l=d.layers[0],s=d.animation.cels[0].surface;l.width=s.width=4;l.height=s.height=16;l.offsetX=s.offsetX=7;l.offsetY=s.offsetY=-9;});
 layerPair('layers-z-index',d=>{d.animation.cels[0].zIndex=-999;});
 layerPair('layers-group',d=>{d.groups=[{id:'layer-group',name:'Group',visible:true,locked:false,opacity:1,blendMode:'normal'}];d.layers[0].groupId='layer-group';});
 layerPair('layers-styles',d=>{d.layers[0].layerStyles={shadow:{enabled:true,offsetX:-.25},stroke:{enabled:true,size:4,kernel:'square'},colorOverlay:{enabled:true,color:{r:1,g:2,b:3,a:4}}};});
 layerPair('layers-background-canvas',d=>{d.layers[0].background={mode:'canvas',repeatWidth:2,repeatHeight:3};});
 layerPair('layers-background-preset',d=>{d.layers[0].background={mode:'preset',pattern:'solid'};});
 layerPair('layers-adjustment',d=>{d.layers[0].kind='adjustment';d.layers[0].adjustment={kind:'gradient-map',enabled:false,gradientMap:{}};});
 const twoLayerFrames=d=>{const cel=d.animation.cels[0];d.animation.frames.push({id:'layer-frame-two',duration:100});d.animation.cels.push({...cel,id:'layer-cel-two',frameId:'layer-frame-two',surface:{...cel.surface,pixels:new Uint8ClampedArray(cel.surface.pixels)}});};
 layerPair('layers-inactive-cel',d=>{twoLayerFrames(d);d.animation.cels[1].surface.pixels[0]=88;},twoLayerFrames);
 layerPair('layers-active-frame',d=>{twoLayerFrames(d);d.animation.activeFrameId='layer-frame-two';d.animation.cels[1].opacity=.4;},twoLayerFrames);
 const linkedLayerFrame=d=>{twoLayerFrames(d);const c=d.animation.cels[1];c.linkedCelId=d.animation.cels[0].id;delete c.surface;};
 layerPair('layers-linked-cel',linkedLayerFrame,twoLayerFrames);
 layerPair('layers-linked-active',d=>{linkedLayerFrame(d);d.animation.activeFrameId='layer-frame-two';},linkedLayerFrame);
 layerPair('layers-sparse-equal',sparse,sparse);
 layerPair('layers-sparse-change',d=>{sparse(d);d.layers[0].pixels[(69*130+129)*4]=42;},sparse);
 layerPair('layers-sparse-empty',empty,empty);
 layerPair('layers-two',d=>{const l=d.layers[0],c=d.animation.cels[0];d.layers.push({...l,id:'layer-second',name:'Second'});d.animation.cels.push({...c,id:'cel-second',layerId:'layer-second',surface:{...c.surface}});});
 const groupDocument=()=>{const d=resourceDocument();d.groups=[{id:'group-one',name:'组😀',visible:true,locked:false,opacity:1,blendMode:'normal'},{id:'group-two',name:'Child',parentGroupId:'group-one',visible:true,locked:false,opacity:.5,blendMode:'multiply'}];return d;};
 const groupPair=(name,mutate,beforeMutate=()=>{})=>{const a=groupDocument(),b=structuredClone(a);beforeMutate(a);mutate(b);const decoded=[],files=[];for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}pair(name,{layers:[],groups:decoded[0].groups},{layers:[],groups:decoded[1].groups},{groupBefore:files[0],groupAfter:files[1]});};
 groupPair('groups-equal',()=>{});
 groupPair('groups-empty',d=>{d.groups=[];},d=>{d.groups=[];});
 groupPair('groups-values',d=>{Object.assign(d.groups[0],{name:'新组🚀',visible:false,locked:true,opacity:.25,blendMode:'screen',panelOrder:-3.75,description:'描述',displayColor:{r:1,g:2,b:3,a:0},clippingMask:true,cumulativeBlend:true});});
 groupPair('groups-parent-null',d=>{d.groups[0].parentGroupId=null;});
 groupPair('groups-reparent',d=>{d.groups[1].parentGroupId=null;});
 groupPair('groups-add',d=>{d.groups.push({id:'group-three',name:'Third'});});
 groupPair('groups-remove',d=>{d.groups.pop();});
 groupPair('groups-style-added',d=>{d.groups[0].layerStyles={};});
 const fullStyle=d=>{d.groups[0].layerStyles={enabled:false,gradientMap:{enabled:true,scope:'all',stops:[{position:1,color:{r:12,g:34,b:56,a:0}},{position:0,color:{r:3,g:2,b:1,a:64}}],mode:'steps',reverse:true,dither:'bayer-4'},stroke:{enabled:true,color:{r:1,g:2,b:3,a:0},size:64,position:'both',kernel:'vertical',directions:{n:false,nw:true},smartHue:true,smartHueDarkness:100,followOpacity:true},shadow:{enabled:true,color:{r:4,g:5,b:6,a:128},offsetX:-64,offsetY:64,blur:32,smartShadow:true,smartShadowDarkness:99},innerGlow:{enabled:true,color:{r:7,g:8,b:9,a:255},size:32},colorOverlay:{enabled:true,color:{r:10,g:11,b:12,a:13}},gradientOverlay:{enabled:true,from:{r:1,g:2,b:3,a:4},to:{r:5,g:6,b:7,a:8},angle:359,dither:'checker'}};};
 groupPair('groups-style-full',fullStyle,d=>{d.groups[0].layerStyles={};});
 groupPair('groups-style-number-coercion',d=>{d.groups[0].layerStyles={enabled:'false',stroke:{enabled:1,size:'4.5',color:{r:'0x10',g:null,b:true,a:[]},smartHueDarkness:'20'},shadow:{offsetX:'-2.5',offsetY:null,blur:'3',smartShadowDarkness:[12]},innerGlow:{size:'4',color:{r:false,g:'7',b:[],a:null}},colorOverlay:{color:{r:'8',g:9,b:10,a:11}},gradientOverlay:{angle:'90',from:{r:'2',g:true,b:null,a:'128'}}};},d=>{d.groups[0].layerStyles={};});
 groupPair('groups-style-null-number',d=>{d.groups[0].layerStyles={stroke:{size:null,smartHueDarkness:false},shadow:{offsetX:false,offsetY:[],blur:true},innerGlow:{size:[]},gradientOverlay:{angle:null}};},d=>{d.groups[0].layerStyles={};});
 groupPair('groups-style-signed-shadow',d=>{d.groups[0].layerStyles={shadow:{offsetX:-.25,offsetY:'-0.5'}};},d=>{d.groups[0].layerStyles={};});
 groupPair('groups-style-array',d=>{d.groups[0].layerStyles=[];},d=>{d.groups[0].layerStyles={};});
 for(const kernel of ['round','square','horizontal','vertical'])groupPair('groups-style-kernel-'+kernel,d=>{d.groups[0].layerStyles={stroke:{kernel},gradientMap:{stops:[{position:0,color:[]},{position:1,color:{r:300,g:-2,b:12.5}}]}};},d=>{d.groups[0].layerStyles={};});
 const {createLayerMask}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const {translateCurrent}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/localization.ts')));
 const maskDocument=()=>{const d=groupDocument(),frame=d.animation.frames[0].id,layer=d.activeLayerId;const mask=createLayerMask(layer,2,2);mask.id='mask-one';mask.offsetX=-2;mask.offsetY=3;mask.pixels=new Uint8ClampedArray([0,0,0,0,64,64,64,255,128,128,128,255,255,255,255,255]);const groupMask=createLayerMask('group-one',2,2,'group');groupMask.id='mask-group';d.animation.layerMasks=[{layerId:layer,frameId:frame,mask}];d.animation.groupMasks=[{groupId:'group-one',frameId:frame,mask:groupMask}];return d;};
 const maskPair=(name,mutate,beforeMutate=()=>{})=>{const a=maskDocument(),b=structuredClone(a);beforeMutate(a);mutate(b);const decoded=[],files=[];for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}const fragment=d=>({layers:[],animation:{layerMasks:d.animation.layerMasks,groupMasks:d.animation.groupMasks}});pair(name,fragment(decoded[0]),fragment(decoded[1]),{maskBefore:files[0],maskAfter:files[1],layerMaskName:translateCurrent('core.document.layerMask'),groupMaskName:translateCurrent('core.document.layerGroupMask')});};
 maskPair('masks-equal',()=>{});
 maskPair('masks-empty',d=>{d.animation.layerMasks=[];d.animation.groupMasks=[];},d=>{d.animation.layerMasks=[];d.animation.groupMasks=[];});
 maskPair('masks-values',d=>{const mask=d.animation.layerMasks[0].mask;mask.locked=true;mask.autoLinkAnimationCels=true;mask.offsetX=4;mask.offsetY=-5;mask.pixels[4]=mask.pixels[5]=mask.pixels[6]=42;d.animation.groupMasks[0].mask.pixels[0]=d.animation.groupMasks[0].mask.pixels[1]=d.animation.groupMasks[0].mask.pixels[2]=100;});
 maskPair('masks-remove-group',d=>{d.animation.groupMasks=[];});
 maskPair('masks-resize',d=>{const mask=d.animation.layerMasks[0].mask;mask.width=3;mask.pixels=new Uint8ClampedArray(24);});
 maskPair('masks-linked',d=>{d.animation.groupMasks[0].mask.linkedMaskId='mask-one';});
 maskPair('masks-two-independent',d=>{const frame={id:'mask-frame-two',duration:100};d.animation.frames.push(frame);const clone=structuredClone(d.animation.layerMasks[0]);clone.frameId=frame.id;clone.mask.id='mask-two';clone.mask.linkedMaskId='mask-one';d.animation.layerMasks.push(clone);});
 const metadataDocument=()=>{const d=resourceDocument();d.name='工程😀';d.createdAt='2026-01-02T03:04:05.000Z';d.updatedAt='2026-02-03T04:05:06.000Z';d.statistics={strokeCount:3,operationCount:5,drawingTimeMs:1200};d.displaySettings={showPixelGrid:false,showGrid:false,grid:{x:0,y:0,width:16,height:16}};return d;};
 const metadataPair=(name,mutate,beforeMutate=()=>{})=>{const a=metadataDocument(),b=structuredClone(a);beforeMutate(a);mutate(b);const decoded=[],files=[];
  for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}
  const fragment=d=>({layers:[],schemaVersion:d.schemaVersion,id:'decoded-runtime-id',name:d.name,width:d.width,height:d.height,colorMode:d.colorMode,pixelFormat:d.pixelFormat,activeLayerId:d.activeLayerId,canvasReferences:d.canvasReferences,...(d.outlineSettings?{outlineSettings:d.outlineSettings}:{}),displaySettings:d.displaySettings,statistics:d.statistics,filePath:d.filePath,dirty:d.dirty,createdAt:d.createdAt,updatedAt:d.updatedAt,layerPanelState:d.layerPanelState});
  pair(name,fragment(decoded[0]),fragment(decoded[1]),{metadataBefore:files[0],metadataAfter:files[1]});
 };
 metadataPair('metadata-equal',()=>{});
 metadataPair('metadata-name-size',d=>{d.name='另一工程🚀';d.width=12;d.height=9;});
 metadataPair('metadata-format-absent',d=>{delete d.pixelFormat;});
 metadataPair('metadata-statistics',d=>{d.statistics={strokeCount:9007199254740991,operationCount:0,drawingTimeMs:999999};});
 metadataPair('metadata-invalid-statistics',d=>{d.statistics={strokeCount:-1,operationCount:1.5,drawingTimeMs:'5'};});
 metadataPair('metadata-dates',d=>{d.createdAt='created';d.updatedAt='updated';});
 metadataPair('metadata-grid',d=>{d.displaySettings={showPixelGrid:true,showGrid:true,grid:{x:-2.9,y:3.9,width:.2,height:4.9}};});
 metadataPair('metadata-display-absent',d=>{delete d.displaySettings;});
 metadataPair('metadata-center-fractional',d=>{d.displaySettings.symmetryCenter={x:1.23,y:4.56};},d=>{d.displaySettings.symmetryCenter={x:2.34,y:3.45};});
 metadataPair('metadata-center-outside',d=>{d.displaySettings.symmetryCenter={x:-12.75,y:99.1};},d=>{d.displaySettings.symmetryCenter={x:2,y:3};});
 metadataPair('metadata-center-added',d=>{d.displaySettings.symmetryCenter={x:1,y:2};});
 const outline=d=>{d.outlineSettings={color:{r:1,g:2,b:3,a:0},backgroundColor:{r:4,g:5,b:6,a:255},thickness:3,position:'inside',kernel:'square',directions:{nw:true,n:false,ne:false,w:true,e:false,sw:true,s:false,se:true},smartHue:true,smartHueDarkness:33,followOpacity:true,previewEnabled:false};};
 metadataPair('metadata-outline-added',outline);
 metadataPair('metadata-outline-values',d=>{outline(d);d.outlineSettings.color.r=42;d.outlineSettings.backgroundColor.a=128;d.outlineSettings.thickness=64;d.outlineSettings.position='both';d.outlineSettings.kernel='vertical';d.outlineSettings.directions.n=true;d.outlineSettings.smartHue=false;d.outlineSettings.smartHueDarkness=100;d.outlineSettings.followOpacity=false;d.outlineSettings.previewEnabled=true;},outline);
 metadataPair('metadata-outline-invalid',d=>{d.outlineSettings={color:{r:999,g:-2,b:3.6,a:'x'},thickness:-4,position:'invalid',kernel:'invalid',smartHueDarkness:999,directions:{nw:true,n:7},previewEnabled:0};},d=>{d.outlineSettings={};});
 metadataPair('metadata-outline-array',d=>{d.outlineSettings=[];},d=>{d.outlineSettings={};});
 metadataPair('metadata-outline-horizontal',d=>{d.outlineSettings={kernel:'horizontal'};},d=>{d.outlineSettings={kernel:'round'};});
 metadataPair('metadata-panel-filter',d=>{const id=d.activeLayerId;d.layerPanelState={activeLayerId:'missing',selectedLayerIds:['missing',id,id,4],selectedGroupIds:['missing'],selectedGroupId:'missing',layerSelectionAnchorId:'missing',collapsedGroupIds:['missing']};});
 const group=d=>{d.groups=[{id:'group-one',name:'Group',visible:true,locked:false,opacity:1,blendMode:'normal'}];d.layerPanelState={activeLayerId:d.activeLayerId,selectedLayerIds:[],selectedGroupIds:['group-one','group-one','missing'],selectedGroupId:'group-one',layerSelectionAnchorId:'group-one',collapsedGroupIds:['group-one','group-one']};};
 metadataPair('metadata-panel-group',group);
 metadataPair('metadata-panel-change',d=>{group(d);d.layerPanelState.selectedGroupId=null;d.layerPanelState.layerSelectionAnchorId=d.activeLayerId;d.layerPanelState.collapsedGroupIds=[];},group);
 const paletteDocument=()=>{const d=resourceDocument();d.palette=[{id:1,name:'颜色😀',color:{r:1,g:2,b:3,a:0}},{id:2,name:'second',color:{r:4,g:5,b:6,a:255}}];d.paletteOrder=[1,2];d.paletteColumns=2;d.paletteSlots=[1,2];d.nextColorId=3;return d;};
 const palettePair=(name,mutate,beforeMutate=()=>{})=>{const a=paletteDocument(),b=paletteDocument();beforeMutate(a);mutate(b);const decoded=[],files=[];
  for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}
  const fragment=d=>({layers:[],palette:d.palette,paletteOrder:d.paletteOrder,paletteColumns:d.paletteColumns,paletteSlots:d.paletteSlots,nextColorId:d.nextColorId});
  pair(name,fragment(decoded[0]),fragment(decoded[1]),{paletteBefore:files[0],paletteAfter:files[1]});
 };
 palettePair('palette-equal',()=>{});
 const emptyPalette=d=>{d.palette=[];d.paletteOrder=[];d.paletteSlots=[];d.nextColorId=1;};
 palettePair('palette-empty',emptyPalette,emptyPalette);
 palettePair('palette-name-color',d=>{d.palette[0].name='更新';d.palette[0].color.r=12;d.palette[0].color.a=128;});
 palettePair('palette-name-absent',d=>{delete d.palette[0].name;});
 palettePair('palette-name-null',d=>{d.palette[0].name=null;});
 palettePair('palette-name-empty',d=>{d.palette[0].name='';},d=>{delete d.palette[0].name;});
 palettePair('palette-key-order',d=>{d.palette[0]={color:{a:128,b:3,g:2,r:12},name:'updated',id:1};},d=>{d.palette[0]={color:{a:0,b:3,g:2,r:1},name:'颜色😀',id:1};});
 palettePair('palette-key-reorder',d=>{const e=d.palette[0];d.palette[0]={color:{a:e.color.a,b:e.color.b,g:e.color.g,r:e.color.r},id:e.id,name:e.name};});
 palettePair('palette-escaped-name',d=>{d.palette[0].name='\"id\": 7, \"color\": 🚀';});
 palettePair('palette-order',d=>{d.paletteOrder=[2,1];d.paletteSlots=[2,1];});
 palettePair('palette-independent-order',d=>{d.paletteOrder=[2,1];});
 palettePair('palette-independent-slots',d=>{d.paletteSlots=[2,1];});
 palettePair('palette-independent-color',d=>{d.paletteOrder=[2,1];d.palette[0].color.r=73;},d=>{d.paletteOrder=[2,1];});
 palettePair('palette-columns-gaps',d=>{d.paletteColumns=3;d.paletteSlots=[null,1,null,2];d.nextColorId=100;});
 palettePair('palette-remove',d=>{d.palette.pop();d.paletteOrder=[1];d.paletteSlots=[1,null];});
 palettePair('palette-add',d=>{d.palette.push({id:3,color:{r:255,g:0,b:1,a:255}});d.paletteOrder.push(3);d.paletteSlots.push(3);d.nextColorId=4;});
 const recordingDocument=()=>{const d=resourceDocument();d.timelapse={enabled:true,recordUndoSteps:false,quality:'medium',fps:12,speed:8,mode:'smart',snapshots:[{id:'recording-one',capturedAt:100,elapsedMs:0,width:1,height:1,changeScore:.25,data:new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'))}]};return d;};
 const recordingPair=(name,mutate,beforeMutate=()=>{})=>{const a=recordingDocument(),b=recordingDocument();beforeMutate(a);mutate(b);const decoded=[],files=[];
  for(const [side,d] of [['before',a],['after',b]]){const bytes=encodeProject(d,{includePreview:false}),file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);decoded.push(decodeProject(bytes));}
  pair(name,{layers:[],timelapse:decoded[0].timelapse},{layers:[],timelapse:decoded[1].timelapse},{recordingBefore:files[0],recordingAfter:files[1]});
 };
 recordingPair('recording-equal',()=>{});
 recordingPair('recording-empty',d=>{d.timelapse.snapshots=[];},d=>{d.timelapse.snapshots=[];});
 recordingPair('recording-settings',d=>{Object.assign(d.timelapse,{enabled:false,recordUndoSteps:true,quality:'high',fps:60,speed:64,mode:'full'});});
 recordingPair('recording-low-quality',d=>{d.timelapse.quality='low';});
 recordingPair('recording-score-undefined',d=>{delete d.timelapse.snapshots[0].changeScore;});
 recordingPair('recording-score-undefined-equal',d=>{delete d.timelapse.snapshots[0].changeScore;},d=>{delete d.timelapse.snapshots[0].changeScore;});
 recordingPair('recording-score-nan',d=>{d.timelapse.snapshots[0].changeScore=NaN;});
 recordingPair('recording-score-time',d=>{Object.assign(d.timelapse.snapshots[0],{capturedAt:500,elapsedMs:400,changeScore:1});});
 recordingPair('recording-byte-change',d=>{d.timelapse.snapshots[0].data[40]^=1;});
 recordingPair('recording-byte-grow',d=>{d.timelapse.snapshots[0].data=new Uint8Array([...d.timelapse.snapshots[0].data,1,2,3]);});
 const external=d=>{d.timelapse.snapshots[0].data=new Uint8Array();d.timelapse.snapshots[0].local={store:'store-a',chunk:'chunk-b',offset:8,length:67,checksum:4294967295};};
 recordingPair('recording-local-equal',external,external);
 recordingPair('recording-local-change',d=>{external(d);Object.assign(d.timelapse.snapshots[0].local,{offset:9007199254740000,checksum:123,store:'store-c'});},external);
 const shuffled=d=>{external(d);d.timelapse.snapshots[0].local={checksum:42,length:67,chunk:'chunk-b',offset:8,store:'store-a'};};
 recordingPair('recording-local-key-order',d=>{shuffled(d);Object.assign(d.timelapse.snapshots[0].local,{offset:100,checksum:123,store:'store-c'});},shuffled);
 recordingPair('recording-local-key-reorder',shuffled,external);
 recordingPair('recording-embedded-to-local',external);
 recordingPair('recording-add-frame',d=>{d.timelapse.snapshots.push({...d.timelapse.snapshots[0],id:'recording-two'});});
 const {unzipSync:unzipTextFixture,zipSync:zipTextFixture}=await import('fflate');
 const fullDocument=()=>{const d=rasterDocument();d.name='完整工程🚀';d.createdAt='2026-01-02T03:04:05.000Z';d.updatedAt='2026-02-03T04:05:06.000Z';return d;};
 const documentPair=(name,mutate,beforeMutate=()=>{},patchManifest)=>{const a=fullDocument(),b=structuredClone(a);beforeMutate(a);mutate(b);const decoded=[],files=[],costs=[];for(const [side,d] of [['before',a],['after',b]]){let bytes=encodeProject(d,{includePreview:false});if(patchManifest){const files=unzipTextFixture(bytes),manifest=JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));patchManifest(manifest.document,side);files['manifest.json']=new Uint8Array(Buffer.from(JSON.stringify(manifest)));bytes=zipTextFixture(files,{level:0});}const file=name+'-'+side+'.moonsprite';fs.writeFileSync(path.join(archiveDirectory,file),bytes);files.push(file);const realDate=globalThis.Date;let ticks=0;if(name.startsWith('document-timestamp-'))globalThis.Date=class extends realDate{constructor(...args){if(args.length)super(...args);else super('2026-05-06T07:08:09.'+String(100+ticks++).padStart(3,'0')+'Z');}};let source;try{source=decodeProject(bytes);}finally{globalThis.Date=realDate;}source.id='decoded-runtime-id';costs.push(historyDocumentBytes(source));decoded.push(historyDocumentTransferView(source));}pair(name,decoded[0],decoded[1],{documentBefore:files[0],documentAfter:files[1],beforeTransferBytes:costs[0],afterTransferBytes:costs[1],layerMaskName:translateCurrent('core.document.layerMask'),groupMaskName:translateCurrent('core.document.layerGroupMask')});};
 documentPair('document-equal',()=>{});
 for(const [name,value] of [['missing',undefined],['null',null],['empty',''],['false',false],['zero',0]])documentPair('document-timestamp-'+name,()=>{},()=>{},(d,side)=>{if(side==='after'){for(const key of ['createdAt','updatedAt'])if(value===undefined)delete d[key];else d[key]=value;}});
 documentPair('document-timestamp-updated-invalid',()=>{},()=>{},(d,side)=>{if(side==='after')d.updatedAt={bad:true};});
 documentPair('document-timestamp-created-only',()=>{},()=>{},(d,side)=>{if(side==='after')delete d.createdAt;});
 for(const [name,value] of [['empty',''],['null',null],['missing',undefined]])documentPair('document-group-shape-'+name,()=>{},()=>{},(d,side)=>{if(side==='after'){if(value===undefined)delete d.layers[0].groupId;else d.layers[0].groupId=value;}});
 for(const [name,value] of [['number',42],['boolean',true],['array',[]],['object',{}],['unknown','missing-group']])documentPair('document-group-normalization-'+name,()=>{},()=>{},(d,side)=>{if(side==='after')d.layers[0].groupId=value;});
 documentPair('document-group-shape-empty-equal',()=>{},()=>{},d=>{d.layers[0].groupId='';});
 documentPair('document-group-shape-empty-to-null',()=>{},()=>{},(d,side)=>{d.layers[0].groupId=side==='before'?'':null;});
 documentPair('document-name',d=>{d.name='更新完整工程😀';});
 documentPair('document-pixels',d=>{d.layers[0].pixels[0]=42;});
 documentPair('document-layer-values',d=>{d.layers[0].description='notes';d.layers[0].visible=false;d.animation.cels[0].opacity=.2;});
 documentPair('document-resources',d=>{d.customBrushes[0].coverage[1]=42;d.referenceImages[0].pixels[4]=99;d.slices[0].x=3;});
 documentPair('document-palette',d=>{d.palette[0].name='New color';d.palette[0].color.r=42;d.paletteColumns=3;});
 documentPair('document-grid-outline',d=>{outline(d);d.displaySettings={showPixelGrid:true,showGrid:true,grid:{x:-2,y:3,width:5,height:6},symmetryCenter:{x:-1.25,y:99.5}};});
 documentPair('document-statistics-dates',d=>{d.statistics={strokeCount:123,operationCount:456,drawingTimeMs:9000};d.updatedAt='2026-03-04T05:06:07.000Z';});
 const fullGroup=d=>{d.groups=[{id:'full-group',name:'组😀',visible:true,locked:false,opacity:.8,blendMode:'multiply'}];d.layers[0].groupId='full-group';d.layerPanelState={activeLayerId:d.activeLayerId,selectedLayerIds:[],selectedGroupIds:['full-group'],selectedGroupId:'full-group',layerSelectionAnchorId:'full-group',collapsedGroupIds:['full-group']};};
 documentPair('document-groups-panel',fullGroup);
 documentPair('document-group-styles',d=>{fullGroup(d);fullStyle(d);},fullGroup);
 const loopBase={id:'decode-loop',name:'Loop',startFrameId:'frame-1',endFrameId:'frame-1',direction:'forward',repeatCount:null};
 for(const [name,patch] of [['trim',{name:'\uFEFF 循环😀\u3000'}],['default',{name:42}],['truncate',{name:'a'.repeat(63)+' b suffix'}],['direction',{direction:'bad'}],['repeat-string',{repeatCount:'3.9'}],['repeat-zero',{repeatCount:0}],['repeat-large',{repeatCount:999999}],['repeat-invalid',{repeatCount:{}}]])documentPair('document-loop-normalize-'+name,()=>{},()=>{},(d,side)=>{d.animation.loopSections=[{...loopBase,...(side==='after'?patch:{})}];});
 documentPair('document-loop-normalize-filter',()=>{},()=>{},(d,side)=>{d.animation.loopSections=side==='after'?[null,42,{...loopBase,startFrameId:'absent'},{...loopBase,name:''},{...loopBase,name:'duplicate'},{...loopBase,id:'second',name:null}]:[{...loopBase}];});
 documentPair('document-loop-normalize-nonarray',()=>{},()=>{},(d,side)=>{d.animation.loopSections=side==='after'?{}:[{...loopBase}];});
 for(const [name,value] of [['fraction',2.9],['negative',-4],['zero',0],['large',1e20],['string','250'],['null',null],['missing',undefined],['object',{}]])documentPair('document-frame-normalize-'+name,()=>{},()=>{},(d,side)=>{if(side==='after'){if(value===undefined)delete d.animation.frames[0].duration;else d.animation.frames[0].duration=value;}});
 for(const [name,value] of [['true',true],['string','true'],['number',1],['null',null]])documentPair('document-frame-normalize-disabled-'+name,()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.frames[0].disabled=value;});
 for(const [name,value] of [['fraction',2.9],['negative',-10000],['large',10000],['string','3.9'],['array',[7]],['boolean',true],['null',null],['object',{}]])documentPair('document-cel-normalize-z-'+name,()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.cels[0].zIndex=value;});
 for(const [name,value] of [['negative',-1],['large',2],['string','0.5'],['null',null],['boolean',true],['object',{}]])documentPair('document-cel-normalize-opacity-'+name,()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.cels[0].opacity=value;});
 for(const [name,id] of [['missing',undefined],['empty',''],['space','\uFEFF \u3000'],['number',42],['null',null]])documentPair('document-frame-normalize-id-'+name,()=>{},()=>{},(d,side)=>{if(side==='after'){if(id===undefined)delete d.animation.frames[0].id;else d.animation.frames[0].id=id;}});
 documentPair('document-frame-normalize-duplicate',()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.frames.push({...d.animation.frames[0],duration:999,disabled:true});});
 documentPair('document-frame-normalize-position-default',()=>{},()=>{},(d,side)=>{if(side==='after'){d.animation.frames=[null,{duration:150}];d.animation.cels[0].frameId='frame-2';d.animation.activeFrameId='missing';}});
 documentPair('document-frame-normalize-default-collision',()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.frames.push({duration:999},{id:'frame-2',duration:555});d.animation.cels.push({...d.animation.cels[0],id:'frame-id-second-cel',frameId:'frame-2'});if(side==='before')d.animation.frames.push({id:'frame-2',duration:100});});
 documentPair('document-frame-normalize-padded-id',()=>{},()=>{},(d,side)=>{if(side==='after'){d.animation.frames[0].id=' padded ';d.animation.cels[0].frameId=' padded ';d.animation.activeFrameId=' padded ';}});
 documentPair('document-frame-normalize-invalid-entries',()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.frames.unshift(null,false,42,'bad');});
 for(const [name,id] of [['missing',undefined],['unknown','absent'],['number',42]])documentPair('document-frame-normalize-active-'+name,()=>{},()=>{},(d,side)=>{if(side==='after'){if(id===undefined)delete d.animation.activeFrameId;else d.animation.activeFrameId=id;}});
 for(const [name,value] of [['null',null],['zero',0],['string','false']])documentPair('document-frame-normalize-loop-'+name,()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.loop=value;});
 for(const mode of ['duplicate-id','duplicate-slot','invalid-frame','unknown-layer','null','number','missing-id','empty-layer','numeric-id'])documentPair('document-cel-normalize-filter-'+mode,()=>{},()=>{},(d,side)=>{if(side!=='after')return;const c={...d.animation.cels[0]};if(mode==='duplicate-id'){c.opacity=.123;c.zIndex=91;}if(mode==='duplicate-slot')c.id='ignored-slot';if(mode==='invalid-frame'){c.id='ignored-frame';c.frameId='absent';}if(mode==='unknown-layer'){c.id='ignored-layer';c.layerId='absent';}if(mode==='missing-id')delete c.id;if(mode==='numeric-id')c.id=42;if(mode==='empty-layer')c.layerId='';d.animation.cels.push(mode==='null'?null:mode==='number'?42:c);});
 documentPair('document-cel-normalize-filter-invalid-first',()=>{},()=>{},(d,side)=>{if(side==='after')d.animation.cels.unshift({...d.animation.cels[0],frameId:'absent',opacity:.12});});
 for(const mode of ['offset-x','offset-y','geometry'])documentPair('document-cel-normalize-resource-'+mode,twoLayerFrames,twoLayerFrames,(d,side)=>{if(side!=='after')return;const accepted=d.animation.cels[1],raw={...accepted,frameId:'absent',zIndex:99};if(mode==='offset-x')raw.offsetX=7;if(mode==='offset-y')raw.offsetY=-4;if(mode==='geometry'){raw.width=4;raw.height=16;}d.animation.cels.unshift(raw);});
 for(const [mode,value] of [['positive',3.9],['negative',-4.8],['string','7'],['null',null],['boolean',true],['array',[3]],['object',{}],['missing',undefined]])documentPair('document-cel-normalize-offset-'+mode,twoLayerFrames,twoLayerFrames,(d,side)=>{if(side==='after')for(const key of ['offsetX','offsetY']){if(value===undefined)delete d.animation.cels[1][key];else d.animation.cels[1][key]=value;}});
 documentPair('document-frame-duration',d=>{d.animation.frames[0].duration=500;d.animation.loop=false;});
 documentPair('document-frame-active',d=>{twoLayerFrames(d);d.animation.activeFrameId='layer-frame-two';d.animation.cels[1].opacity=.4;},twoLayerFrames);
 documentPair('document-linked-cel',linkedLayerFrame,twoLayerFrames);
 for(const active of ['frame-1','layer-frame-two'])for(const mode of ['conflict','missing-owner','missing-member'])documentPair('document-linked-cel-scalars-'+active+'-'+mode,linkedLayerFrame,linkedLayerFrame,(d,side)=>{d.animation.activeFrameId=active;if(side==='after'){d.animation.cels[0].opacity=.25;d.animation.cels[0].zIndex=7;d.animation.cels[1].opacity=.8;d.animation.cels[1].zIndex=-3;if(mode==='missing-owner')delete d.animation.cels[0].opacity;if(mode==='missing-member')delete d.animation.cels[1].opacity;}});
 documentPair('document-recording',d=>{d.timelapse=recordingDocument().timelapse;});
 documentPair('document-tilesets',d=>{d.tilesets=timelineDocument().tilesets;});
 const fullMasks=d=>{fullGroup(d);const mask=createLayerMask(d.activeLayerId,2,2);mask.id='full-mask';mask.offsetX=-2;mask.pixels=new Uint8ClampedArray([0,0,0,0,64,64,64,255,128,128,128,255,255,255,255,255]);const groupMask=createLayerMask('full-group',2,2,'group');groupMask.id='full-group-mask';d.animation.layerMasks=[{layerId:d.activeLayerId,frameId:d.animation.activeFrameId,mask}];d.animation.groupMasks=[{groupId:'full-group',frameId:d.animation.activeFrameId,mask:groupMask}];};
 documentPair('document-masks',d=>{fullMasks(d);d.animation.groupMasks[0].mask.linkedMaskId='full-mask';},fullMasks);
 for(const mode of ['first-raw','duplicate-ignored','invalid-frame','missing-first','explicit-priority'])documentPair('document-cel-normalize-mask-raw-'+mode,fullMasks,fullMasks,(d,side)=>{if(side!=='after')return;const c=d.animation.cels[0],mask=d.animation.layerMasks[0].mask;d.animation.layerMasks=[];if(mode==='first-raw'){d.animation.cels.unshift({...c,frameId:'absent',mask:{...mask,offsetX:3}});}if(mode==='duplicate-ignored'){d.animation.cels.push({...c,id:'ignored-slot',mask:{...mask,id:'ignored-mask'}});}if(mode==='invalid-frame'){d.animation.cels.push({...c,id:'ignored-frame',frameId:'absent',mask});}if(mode==='missing-first'){c.mask=mask;d.animation.cels.unshift({...c,frameId:'absent',mask:null});}if(mode==='explicit-priority'){d.animation.layerMasks=[{layerId:c.layerId,frameId:c.frameId,mask}];c.mask={...mask,id:'shadow-mask',dataFile:'missing-shadow.u8'};}});

 for(const [mode,patch] of [['string-size',{width:'2',height:'2'}],['array-size',{width:[2],height:[2]}],['string-offset',{offsetX:'-3.9',offsetY:'4.8'}],['null-offset',{offsetX:null,offsetY:null}],['boolean-offset',{offsetX:true,offsetY:false}],['array-offset',{offsetX:[],offsetY:[3]}],['flags',{locked:'true',autoLinkAnimationCels:1}],['null-link',{linkedMaskId:null}]])documentPair('document-cel-normalize-mask-numeric-'+mode,fullMasks,fullMasks,(d,side)=>{if(side==='after')Object.assign(d.animation.layerMasks[0].mask,patch);});
 for(const target of ['layerMasks','groupMasks'])for(const mode of ['null-entry','numeric-entry','invalid-frame','empty-owner','null-mask','false-mask','zero-mask','nonarray'])documentPair('document-cel-normalize-mask-filter-'+target+'-'+mode,d=>{fullMasks(d);if(mode==='nonarray')d.animation[target]=[];},d=>{fullMasks(d);if(mode==='nonarray')d.animation[target]=[];},(d,side)=>{if(side!=='after')return;const list=d.animation[target],candidate=structuredClone(list[0]);if(mode==='nonarray'){d.animation[target]={};return;}if(mode==='null-entry'){list.unshift(null);return;}if(mode==='numeric-entry'){list.unshift(42);return;}if(mode==='invalid-frame')candidate.frameId='absent';if(mode==='empty-owner')candidate[target==='layerMasks'?'layerId':'groupId']='';if(mode==='null-mask')candidate.mask=null;if(mode==='false-mask')candidate.mask=false;if(mode==='zero-mask')candidate.mask=0;list.unshift(candidate);});
 documentPair('document-adjustment',d=>{d.layers[0].kind='adjustment';d.layers[0].adjustment={kind:'gradient-map',enabled:false,gradientMap:{}};});
 documentPair('document-background',d=>{d.layers[0].background={mode:'canvas',repeatWidth:2,repeatHeight:3};});
 documentPair('document-sparse',sparse,sparse);
 documentPair('document-sparse-to-raw',()=>{},sparse);
 documentPair('document-combined',d=>{fullMasks(d);outline(d);fullStyle(d);d.layers[0].pixels[0]=42;d.customBrushes[0].coverage[1]=42;d.referenceImages[0].pixels[0]=8;d.palette[0].color.r=7;d.timelapse=recordingDocument().timelapse;d.statistics={strokeCount:123,operationCount:456,drawingTimeMs:9000};d.tilesets=timelineDocument().tilesets;d.slices[0].name='更新切片';d.updatedAt='new-generation';});
 const tileModule=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/tilemap.ts')));
 const makeTile=d=>{d.tilesets=[tileModule.createSolidTileset('history-tiles','Tiles',2,2,{r:10,g:20,b:30,a:255},'tile-one')];d.layers[0].kind='tilemap';d.layers[0].tilemapTilesetId='history-tiles';const c=d.animation.cels[0];c.tilemap=tileModule.createTilemapCelData(4,2,2,2);c.tilemap.cells[0]={tilesetId:'history-tiles',tileId:'tile-one'};c.surface=tileModule.renderTilemapSurface(c.tilemap,d.tilesets,'rgba');};
 documentPair('document-tilemap-equal',makeTile,makeTile);
 for(const [name,value] of [['trim','\uFEFF \t图块😀\u3000'],['blank','\u00a0\u2028\u3000'],['empty',''],['missing',undefined],['null',null],['number',42],['object',{}],['interior','A\u200b B']])documentPair('document-tileset-name-'+name,makeTile,makeTile,(d,side)=>{if(side==='after'){if(value===undefined)delete d.tilesets[0].name;else d.tilesets[0].name=value;}});
 documentPair('document-tilemap-empty',d=>{makeTile(d);d.animation.cels[0].tilemap.cells.fill(null);},makeTile);
 documentPair('document-tilemap-cell',d=>{makeTile(d);d.animation.cels[0].tilemap.cells[1]={tilesetId:'history-tiles',tileId:'tile-one'};},makeTile);
 documentPair('document-tilemap-dimensions',d=>{makeTile(d);Object.assign(d.animation.cels[0].tilemap,{columns:1,rows:2});},makeTile);
 for(let rotation=0;rotation<4;rotation++)documentPair('document-tilemap-transform-'+rotation,d=>{makeTile(d);Object.assign(d.animation.cels[0].tilemap.cells[0],{rotation,flipHorizontal:true,flipVertical:rotation%2===0});},makeTile);
 documentPair('document-tilemap-pixels',d=>{makeTile(d);d.tilesets[0].pixels[0]=99;},makeTile);
 for(const mode of ['empty','flip','rotation','dense'])documentPair('document-cel-normalize-tile-raw-'+mode,makeTile,makeTile,(d,side)=>{if(side!=='after')return;const raw={...d.animation.cels[0],frameId:'absent',tilemap:structuredClone(d.animation.cels[0].tilemap)};if(mode==='empty')raw.tilemap.cells=[];if(mode==='flip')raw.tilemap.cells[0].flipHorizontal=true;if(mode==='rotation')raw.tilemap.cells[0].rotation=1;if(mode==='dense')raw.tilemap.cells=[{...raw.tilemap.cells[0],index:1},{...raw.tilemap.cells[0],index:0}];d.animation.cels.unshift(raw);});
 documentPair('document-tilemap-linked',d=>{makeTile(d);linkedLayerFrame(d);d.animation.activeFrameId='layer-frame-two';},d=>{makeTile(d);twoLayerFrames(d);d.animation.cels[1].tilemap=structuredClone(d.animation.cels[0].tilemap);});
 for(const mode of ['none','sparse','dense','surface'])documentPair('document-tilemap-linked-'+mode,d=>{makeTile(d);linkedLayerFrame(d);d.animation.activeFrameId='layer-frame-two';},makeTile,(d,side)=>{if(side!=='after')return;const c=d.animation.cels[1],owner=d.animation.cels[0];if(mode==='none')delete c.tilemap;else{c.tilemap=structuredClone(owner.tilemap);if(mode==='sparse')c.tilemap.cells=[];if(mode==='dense')c.tilemap.cells=[{...owner.tilemap.cells[0],index:1},{...owner.tilemap.cells[0],index:0}];if(mode==='surface')Object.assign(c,{...owner,id:c.id,frameId:c.frameId,linkedCelId:owner.id});}});
 documentPair('document-tilemap-raw-reorder',makeTile,makeTile,(d,side)=>{if(side==='after'){const c=d.animation.cels[0];c.tilemap.cells=[{...c.tilemap.cells[0],index:1,rotation:3},{...c.tilemap.cells[0],index:0,flipHorizontal:true}];}});
 const freeModule=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/free-tile.ts')));
 const makeFree=d=>{d.tilesets=[tileModule.createSolidTileset('free-sheet','Source',2,1,{r:10,g:20,b:30,a:255},'free-tile')];const l=d.layers[0];l.kind='free-tile';l.freeTileSetId='free-set';l.freeTileSources=[{id:'source-one',name:'Source',tilesetId:'free-sheet',visible:true,locked:false,opacity:1,blendMode:'normal',offsetX:0,offsetY:0}];const c=d.animation.cels[0];c.freeTiles={instances:[{id:'instance-one',sourceId:'source-one',x:0,y:1}]};c.surface=freeModule.renderFreeTileSurface(c.freeTiles,freeModule.freeTileSourceRefs(l.freeTileSources,d.tilesets),'rgba',4,4,-1,2);};
 documentPair('document-free-equal',makeFree,makeFree);
 documentPair('document-free-empty',d=>{makeFree(d);d.animation.cels[0].freeTiles.instances=[];},makeFree);
 documentPair('document-free-position',d=>{makeFree(d);Object.assign(d.animation.cels[0].freeTiles.instances[0],{x:2,y:-1});},makeFree);
 documentPair('document-free-source',d=>{makeFree(d);Object.assign(d.layers[0].freeTileSources[0],{description:'源😀',displayColor:{r:1,g:2,b:3,a:4},opacity:.6,blendMode:'multiply',offsetX:1,locked:true});},makeFree);
 documentPair('document-free-instance',d=>{makeFree(d);Object.assign(d.animation.cels[0].freeTiles.instances[0],{visible:false,locked:true,opacity:0,blendMode:'screen'});},makeFree);
 for(let rotation=0;rotation<4;rotation++)documentPair('document-free-transform-'+rotation,d=>{makeFree(d);Object.assign(d.animation.cels[0].freeTiles.instances[0],{rotation,flipHorizontal:true,flipVertical:rotation%2===0});},makeFree);
 documentPair('document-free-alias',makeFree,makeFree,(d,side)=>{if(side==='after')d.animation.cels[0].freeTiles.instances[0].sourceId='free-tile';});
 documentPair('document-free-shared-layers',d=>{makeFree(d);const l=d.layers[0],c=d.animation.cels[0];d.layers.push({...l,id:'free-shared',name:'共享'});d.animation.cels.push({...c,id:'free-shared-cel',layerId:'free-shared',freeTiles:{instances:[{id:'other',sourceId:'source-one',x:1,y:1}]}});},makeFree);
 documentPair('document-free-source-name',d=>{makeFree(d);d.layers[0].freeTileSources[0].name='源🌙';},makeFree);
 documentPair('document-free-source-hidden',d=>{makeFree(d);d.layers[0].freeTileSources[0].visible=false;},makeFree);
 documentPair('document-free-pixels',d=>{makeFree(d);d.tilesets[0].pixels[0]=99;},makeFree);
 documentPair('document-free-overlap',d=>{makeFree(d);d.animation.cels[0].freeTiles.instances.push({id:'top',sourceId:'source-one',x:0,y:1,opacity:.45,blendMode:'screen'});},makeFree);
 const multiFree=d=>{makeFree(d);d.tilesets.push(tileModule.createSolidTileset('free-sheet-two','Second',1,2,{r:80,g:40,b:220,a:128},'free-tile-two'));d.layers[0].freeTileSources.push({id:'source-two',name:'Second',tilesetId:'free-sheet-two',visible:true,locked:false,opacity:.7,blendMode:'screen',offsetX:-1,offsetY:1});d.animation.cels[0].freeTiles.instances.push({id:'second',sourceId:'source-two',x:2,y:0,rotation:1});};
 for(const mode of ['empty','position','opacity','rotation'])documentPair('document-cel-normalize-free-raw-'+mode,makeFree,makeFree,(d,side)=>{if(side!=='after')return;const raw={...d.animation.cels[0],frameId:'absent',freeTiles:structuredClone(d.animation.cels[0].freeTiles)};if(mode==='empty')raw.freeTiles.instances=[];if(mode==='position')raw.freeTiles.instances[0].x=4;if(mode==='opacity')raw.freeTiles.instances[0].opacity=.3;if(mode==='rotation')raw.freeTiles.instances[0].rotation=1;d.animation.cels.unshift(raw);});
 documentPair('document-free-multiple',multiFree,makeFree);
 documentPair('document-free-order',d=>{multiFree(d);d.layers[0].freeTileSources.reverse();d.animation.cels[0].freeTiles.instances.reverse();},multiFree);
 documentPair('document-free-unknown',makeFree,makeFree,(d,side)=>{if(side==='after'){d.layers[0].freeTileSources[0].custom={unknown:1};d.animation.cels[0].freeTiles.custom=true;d.animation.cels[0].freeTiles.instances[0].custom=[1,2];}});
 const makeLinkedLayers=d=>{const l=d.layers[0],c=d.animation.cels[0];l.linkedContentId='linked-content';d.layers.push({...l,id:'linked-layer-two',name:'Linked two'});d.animation.cels.push({...c,id:'linked-layer-cel-two',layerId:'linked-layer-two',surface:{...c.surface}});};
 documentPair('document-linked-layers-equal',makeLinkedLayers,makeLinkedLayers);
 for(const mode of ['explicit','missing-first','missing-second'])documentPair('document-linked-layers-opacity-'+mode,makeLinkedLayers,makeLinkedLayers,(d,side)=>{if(side==='after'){d.layers[0].opacity=.35;d.layers[1].opacity=.7;d.animation.cels[0].opacity=.2;d.animation.cels[1].opacity=.8;d.animation.cels[0].zIndex=4;d.animation.cels[1].zIndex=-2;if(mode==='missing-first')delete d.animation.cels[0].opacity;if(mode==='missing-second')delete d.animation.cels[1].opacity;}});
 documentPair('document-linked-layers-metadata',d=>{makeLinkedLayers(d);d.layers[1].description='独立属性';d.layers[1].visible=false;d.layers[1].opacity=.3;},makeLinkedLayers);
 documentPair('document-linked-layers-pixels',d=>{makeLinkedLayers(d);d.layers[0].pixels[0]=99;},makeLinkedLayers);
 documentPair('document-linked-layers-color',d=>{makeLinkedLayers(d);d.layers[1].displayColor={r:10,g:20,b:30,a:255};},makeLinkedLayers);
 documentPair('document-linked-layers-positions',d=>{makeLinkedLayers(d);d.animation.cels[1].surface.offsetX=3;d.animation.cels[1].surface.offsetY=-2;},makeLinkedLayers);
 documentPair('document-linked-layers-singleton',d=>{d.layers[0].linkedContentId='singleton';});
 documentPair('document-linked-layers-unlink',()=>{},d=>{d.layers[0].linkedContentId='singleton';});
 documentPair('document-linked-layers-sparse',d=>{sparse(d);makeLinkedLayers(d);},d=>{sparse(d);makeLinkedLayers(d);});
 documentPair('document-linked-layers-raw-color-priority',makeLinkedLayers,makeLinkedLayers,(d,side)=>{if(side==='after'){d.layers[0].displayColor={r:10,g:20,b:30,a:255};d.layers[1].displayColor={r:90,g:80,b:70,a:255};}});
 documentPair('document-linked-layers-raw-missing-color',makeLinkedLayers,makeLinkedLayers,(d,side)=>{if(side==='after'){delete d.layers[0].displayColor;d.layers[1].displayColor={r:90,g:80,b:70,a:255};}});
 documentPair('document-linked-layers-frame',d=>{makeLinkedLayers(d);for(const c of [...d.animation.cels])d.animation.cels.push({...c,id:c.id+'-frame',frameId:'linked-frame',surface:{...c.surface}});d.animation.frames.push({id:'linked-frame',duration:200});d.animation.activeFrameId='linked-frame';},makeLinkedLayers);
 const makeText=d=>{d.layers[0].kind='text';d.animation.cels[0].text={text:'A😀BC\nText',fontFamily:'Fusion Pixel 10px Prop Zh_hans',fontSize:10,color:{r:1,g:2,b:3,a:255}};};
 for(const mode of ['content','missing','null','array','empty','number'])documentPair('document-cel-normalize-text-raw-'+mode,makeText,makeText,(d,side)=>{if(side!=='after')return;const raw={...d.animation.cels[0],frameId:'absent',text:{...d.animation.cels[0].text,text:'Raw first',fontSize:22}};if(mode==='missing')delete raw.text;if(mode==='null')raw.text=null;if(mode==='array')raw.text=[];if(mode==='empty')raw.text={};if(mode==='number')raw.text=42;d.animation.cels.unshift(raw);});
 documentPair('document-text-equal',makeText,makeText);
 documentPair('document-text-content',d=>{makeText(d);d.animation.cels[0].text.text='更新😀文字';},makeText);
 documentPair('document-text-font-spacing',d=>{makeText(d);Object.assign(d.animation.cels[0].text,{fontFamily:'  Noto Sans SC  ',fontSize:25,lineSpacing:-7,letterSpacing:3,spacingMode:'actual',antialias:'smooth',textAlign:'right',color:{r:4,g:5,b:6,a:128}});},makeText);
 documentPair('document-text-font-surrogate',d=>{makeText(d);d.animation.cels[0].text.fontFamily='a'.repeat(127)+'😀';},makeText);
 documentPair('document-text-lone-surrogate',d=>{makeText(d);d.animation.cels[0].text.text='A\ud800B';},makeText);
 documentPair('document-text-box',d=>{makeText(d);Object.assign(d.animation.cels[0].text,{layoutMode:'box',boxWidth:40,boxHeight:50,textAlign:'center',originX:-2,originY:5});},makeText);
 documentPair('document-text-style-runs',d=>{makeText(d);d.animation.cels[0].text.styleRuns=[{start:0,end:5,fontSize:20},{start:1,end:3,lineSpacing:-3,letterSpacing:2},{start:4,end:8,color:{r:7,g:8,b:9,a:0}}];},makeText);
 const transformText=d=>{makeText(d);d.animation.cels[0].text.transforms=[{source:{x:-2,y:3,width:4,height:5},target:{x:6,y:7,width:8,height:9},angle:30,shear:{axis:'y',edge:'n',amount:-2.5}}];};
 documentPair('document-text-transform',transformText,makeText);
 documentPair('document-text-transform-extension',d=>{transformText(d);d.animation.cels[0].text.transforms[0].source={'10':'ten','2':'two',note:'x, \"y\": []',height:5,extra:{'01':true,'2':null,'4294967295':['😀',false,3]},width:4,y:3,x:-2};},transformText);
 documentPair('document-text-transform-reorder',d=>{transformText(d);d.animation.cels[0].text.transforms[0].source={height:5,width:4,y:3,x:-2};},transformText);
 documentPair('document-text-linked',d=>{makeText(d);linkedLayerFrame(d);d.animation.activeFrameId='layer-frame-two';},d=>{makeText(d);twoLayerFrames(d);});
 documentPair('document-text-sparse',d=>{sparse(d);makeText(d);},d=>{sparse(d);makeText(d);});
 documentPair('document-text-raw-signed-zero',makeText,makeText,(d,side)=>{if(side==='after')Object.assign(d.animation.cels[0].text,{lineSpacing:-.25,letterSpacing:'-0.5',originX:-.25,originY:-.9,styleRuns:[{start:0,end:3,lineSpacing:-.25},{start:3,end:5,letterSpacing:-.5}]});});
 documentPair('document-text-raw-empty-transforms',makeText,makeText,(d,side)=>{if(side==='after')d.animation.cels[0].text.transforms=[{source:{x:0,y:0,width:0,height:2},target:{x:0,y:0,width:2,height:2}},null];});
 documentPair('document-text-raw-coercion',makeText,makeText,(d,side)=>{if(side==='after')Object.assign(d.animation.cels[0].text,{fontSize:'23.5',lineSpacing:[-3],letterSpacing:true,color:{r:'0x10',g:null,b:true,a:[]},styleRuns:[{start:'0',end:[5],fontSize:12.5,color:{r:'4',g:null,b:false,a:'128'}}]});});
 const emptyParentDocument=groupDocument();emptyParentDocument.groups[0].parentGroupId='';const emptyParentBytes=encodeProject(emptyParentDocument,{includePreview:false});if(decodeProject(emptyParentBytes).groups[0].parentGroupId!=='')throw new Error('Missing legacy empty-parent shape');fs.writeFileSync(path.join(archiveDirectory,'groups-empty-parent-gated.moonsprite'),emptyParentBytes);
 const {moveLayerPanelRows}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/layer-operations.ts')));
 const lifecycleDocument=decodeProject(new Uint8Array(fs.readFileSync(path.join(archiveDirectory,'groups-style-full-after.moonsprite'))));
 const observeParents=()=>lifecycleDocument.groups.map(group=>({id:group.id,parentPresent:Object.hasOwn(group,'parentGroupId'),parent:group.parentGroupId??null}));const lifecycle=[observeParents()];
 const move=moveLayerPanelRows({document:lifecycleDocument,selectedLayerIds:[],selectedGroupId:'group-two'},[],['group-two'],{kind:'edge',edge:'top'});if(!move)throw new Error('Missing actual legacy group move');lifecycle.push(observeParents());move.undo();lifecycle.push(observeParents());move.redo();lifecycle.push(observeParents());
 fs.writeFileSync(out.replace(/\.json$/,'-group-lifecycle.json'),JSON.stringify(lifecycle)+'\n');
 fs.writeFileSync(out.replace(/\.json$/,'-objects.json'),JSON.stringify(objects)+'\n');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(rows)+'\n');console.log('Actual legacy compiler: '+rows.length+' byte-view cases and '+objects.length+' object graph cases');
})().catch(error=>{console.error(error);process.exitCode=1;});
