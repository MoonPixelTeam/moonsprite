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
 const {createDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const {encodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-encode.ts')));
 const {unzipSync,zipSync,strFromU8,strToU8}=await import('fflate');
 const doc=createDocument('原生兼容样本',2,2,'rgba');
 const encoded=encodeProject(doc,{includePreview:false});
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'valid.moonsprite'),encoded);
 const files=unzipSync(encoded),manifest=JSON.parse(strFromU8(files['manifest.json']));
 function variant(name,mutate) {const copy=structuredClone(manifest),resources={...files};mutate(copy,resources);resources['manifest.json']=strToU8(JSON.stringify(copy));fs.writeFileSync(path.join(out,name+'.moonsprite'),zipSync(resources));}
 variant('future',m=>{m.schemaVersion=22;m.document.schemaVersion=22;});
 variant('unknown',m=>{m.document.futureCreativeSetting={mode:'preserve me'};});
 variant('broken-reference',m=>{m.document.animation.cels[0].frameId='absent';});
 variant('duplicate-frame',m=>{m.document.animation.frames.push({...m.document.animation.frames[0]});});
 variant('rgba',(_,r)=>{for(const key of Object.keys(r))if(key.endsWith('.rgba'))r[key]=new Uint8Array([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);});
 variant('unknown-resource',(_,r)=>{r['unmigrated/custom.bin']=new Uint8Array([1,2,3]);});
 const invalid={...files,'manifest.json':strToU8('{broken json')};fs.writeFileSync(path.join(out,'syntax.moonsprite'),zipSync(invalid));

 const {decodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-decode.ts')));
 function inlineMask(m,r){const cel=m.document.animation.cels[0];cel.mask={id:'inline-mask',width:2,height:2,offsetX:-1.75,offsetY:1.9,dataFile:'masks/inline.u8',locked:true,autoLinkAnimationCels:true};r[cel.mask.dataFile]=new Uint8Array([0,128,255,64]);return cel.mask;}
 function maskVariant(name,mutate,verify,rejected=false){const m=structuredClone(manifest),r={...files};mutate(m,r);r['manifest.json']=strToU8(JSON.stringify(m));const encoded=zipSync(r);let decoded,error;try{decoded=decodeProject(encoded);}catch(e){error=e;}if(rejected){if(!error)throw new Error('Legacy accepted invalid mask fixture '+name);}else{if(error)throw error;if(verify&&!verify(decoded))throw new Error('Legacy mask oracle mismatch '+name);}fs.writeFileSync(path.join(out,name+'.moonsprite'),encoded);}
 maskVariant('inline-mask-u8',(m,r)=>inlineMask(m,r),d=>{const x=d.animation.layerMasks[0].mask;return x.id==='inline-mask'&&x.offsetX===-1&&x.offsetY===1&&x.locked&&x.autoLinkAnimationCels&&x.pixels[4]===128;});
 maskVariant('inline-mask-rgba',(m,r)=>{const mask=inlineMask(m,r);delete r[mask.dataFile];mask.offsetX=mask.offsetY=0;mask.dataFile='masks/inline.rgba';r[mask.dataFile]=new Uint8Array([12,34,56,0,128,128,128,255,0,0,0,255,255,255,255,255]);},d=>d.animation.layerMasks[0].mask.pixels[0]===0&&d.animation.layerMasks[0].mask.pixels[1]===0&&d.animation.layerMasks[0].mask.pixels[2]===0);
 function linkedInline(m,r){const root=inlineMask(m,r),animation=m.document.animation,first=animation.cels[0],second={...first,id:first.id+'-second',frameId:animation.frames[0].id+'-second',linkedCelId:first.id,mask:{...root,id:'inline-alias',linkedMaskId:root.id,dataFile:'masks/alias.u8'}};animation.frames.push({...animation.frames[0],id:second.frameId});animation.cels.push(second);r[second.mask.dataFile]=new Uint8Array([255,255,255,255]);return second;}
 maskVariant('inline-mask-linked',(m,r)=>linkedInline(m,r),d=>d.animation.layerMasks.length===2&&d.animation.layerMasks[1].mask.linkedMaskId==='inline-mask'&&d.animation.cels[1].linkedCelId===d.animation.cels[0].id);
 maskVariant('inline-mask-priority',(m,r)=>{const inline=inlineMask(m,r),a=m.document.animation,cel=a.cels[0];r[inline.dataFile]=new Uint8Array([1,2,3]);inline.linkedMaskId='missing-ignored';const winner={...inline,id:'winner',linkedMaskId:'group-root',dataFile:'masks/winner.u8'};r[winner.dataFile]=new Uint8Array([0,64,128,255]);a.layerMasks=[{layerId:cel.layerId,frameId:cel.frameId,mask:winner},{layerId:cel.layerId,frameId:cel.frameId,mask:{...inline,id:'duplicate-slot-ignored'}}];m.document.groups=[{id:'group',name:'group',visible:true,locked:false,opacity:1,blendMode:'normal'}];a.groupMasks=[{groupId:'group',frameId:cel.frameId,mask:{...winner,id:'group-root',linkedMaskId:null,dataFile:'masks/group.u8'}}];r['masks/group.u8']=new Uint8Array([255,128,64,0]);},d=>d.animation.layerMasks.length===1&&d.animation.layerMasks[0].mask.id==='winner'&&d.animation.layerMasks[0].mask.linkedMaskId==='group-root'&&d.animation.groupMasks.length===1);
 maskVariant('inline-mask-missing-shadow',(m,r)=>{const inline=inlineMask(m,r),cel=m.document.animation.cels[0];delete r[inline.dataFile];m.document.animation.layerMasks=[{layerId:cel.layerId,frameId:cel.frameId,mask:{...inline,id:'winner',dataFile:'masks/winner.u8'}}];r['masks/winner.u8']=new Uint8Array([0,64,128,255]);},d=>d.animation.layerMasks[0].mask.id==='winner');
 maskVariant('inline-mask-bad-rgba',(m,r)=>{const x=inlineMask(m,r);r[x.dataFile]=new Uint8Array([255,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255]);},null,true);
 maskVariant('inline-mask-bad-alpha',(m,r)=>{const x=inlineMask(m,r);r[x.dataFile]=new Uint8Array([128,128,128,128,0,0,0,255,0,0,0,255,0,0,0,255]);},null,true);
 maskVariant('inline-mask-missing-resource',(m,r)=>{const x=inlineMask(m,r);delete r[x.dataFile];},null,true);
 maskVariant('inline-mask-duplicate-id',(m,r)=>{const alias=linkedInline(m,r);alias.mask.id='inline-mask';delete alias.mask.linkedMaskId;},null,true);
 maskVariant('inline-mask-empty-link',(m,r)=>{inlineMask(m,r).linkedMaskId='';},null,true);
 maskVariant('inline-mask-broken-link',(m,r)=>{inlineMask(m,r).linkedMaskId='missing';},null,true);
 maskVariant('inline-mask-cycle',(m,r)=>{const alias=linkedInline(m,r);m.document.animation.cels[0].mask.linkedMaskId=alias.mask.id;},null,true);
 maskVariant('inline-mask-schema20',(m,r)=>{inlineMask(m,r);m.schemaVersion=m.document.schemaVersion=20;},d=>d.schemaVersion===21);

 // Exercise actual historical version gates through the legacy decoder.
 for(let version=1;version<=20;++version){
  const m=structuredClone(manifest),r={...files};m.schemaVersion=m.document.schemaVersion=version;
  const expected=new Uint8Array([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);
  for(const entry of [...m.document.layers,...m.document.animation.cels]){r[entry.dataFile]=expected;entry.dataEncoding=version<=4?'obsolete-ignored':'raw';}
  // These future-only fields must be removed by the same migration gates.
  if(version<11)for(const l of m.document.layers)l.layerStyles={enabled:true,colorOverlay:{enabled:true,color:{r:255,g:0,b:0,a:255}}};
  if(version<12)for(const l of m.document.layers)l.background={mode:'preset',pattern:'checkerboard'};
  if(version<14){for(const l of m.document.layers){l.kind='free-tile';l.freeTileTilesetId='absent';l.freeTileSources=[{id:'absent'}];}for(const c of m.document.animation.cels){c.freeTiles={instances:[{}]};if(version<13)c.tilemap={invalid:true};}}
  if(version===1){for(const l of m.document.layers){delete r[l.dataFile];l.dataFile='layers/historical.rgba';r[l.dataFile]=expected;}delete m.document.animation;for(const key of Object.keys(r))if(key.startsWith('cels/'))delete r[key];}
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  const oraclePixels=version===1?new Uint8Array(16):expected;
  if(decoded.schemaVersion!==21||decoded.layers.length!==1||decoded.animation.frames.length!==1||decoded.animation.frames[0].duration!==100||decoded.layers[0].pixels.some((v,i)=>v!==oraclePixels[i]))throw new Error('Historical decode oracle mismatch '+version+' '+JSON.stringify({schema:decoded.schemaVersion,frames:decoded.animation.frames,pixels:Array.from(decoded.layers[0].pixels)}));
  fs.writeFileSync(path.join(out,`historical-${version}.moonsprite`),bytes);
 }
 for(let version=2;version<=13;++version){
  const m=structuredClone(manifest),r={...files};m.schemaVersion=m.document.schemaVersion=version;
  const a=m.document.animation,first=a.cels[0];a.frames.push({id:'historical-second',duration:240});a.cels.push({...first,id:'historical-linked',frameId:'historical-second',linkedCelId:first.id});
  for(const entry of [...m.document.layers,...a.cels])entry.dataEncoding='raw';
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  if(decoded.animation.frames.length!==2||decoded.animation.frames[1].duration!==240||decoded.animation.cels[1].linkedCelId!==decoded.animation.cels[0].id)throw new Error('Historical animation oracle mismatch '+version);
  fs.writeFileSync(path.join(out,`historical-animation-${version}.moonsprite`),bytes);
 }
 for(const multiple of [false,true])for(const geometry of [false,true]){
  const m=structuredClone(manifest),r={...files},a=m.document.animation,l=m.document.layers[0],c=a.cels[0];
  l.dataFile='layers/stale-cache.rgba';l.dataEncoding='raw';r[l.dataFile]=new Uint8Array(geometry?4:16).fill(255);
  if(geometry){l.width=l.height=1;l.offsetX=-3;l.offsetY=4;}
  c.dataEncoding='raw';r[c.dataFile]=new Uint8Array([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);
  if(multiple){a.frames.push({id:'cache-second',duration:220});a.cels.push({...c,id:'cache-second-cel',frameId:'cache-second',dataFile:'cels/cache-second.rgba'});r['cels/cache-second.rgba']=new Uint8Array(16);}
  // No unrelated resource is needed to test the cache precedence.
  const refs=new Set([l.dataFile,...a.cels.map(x=>x.dataFile)]);for(const k of Object.keys(r))if((k.startsWith('layers/')||k.startsWith('cels/'))&&!refs.has(k))delete r[k];
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  if(decoded.layers[0].width!==2||decoded.layers[0].height!==2||decoded.layers[0].offsetX!==0||decoded.layers[0].pixels[0]!==10)throw new Error('Active Cel cache precedence oracle mismatch');
  fs.writeFileSync(path.join(out,`active-cache-${Number(multiple)}-${Number(geometry)}.moonsprite`),bytes);
 }
 for(const mode of ['pixels','geometry','absent'])for(const chain of [false,true]){
  const m=structuredClone(manifest),r={...files},a=m.document.animation,c=a.cels[0];c.dataEncoding='raw';r[c.dataFile]=new Uint8Array([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);
  const alias={...c,id:'stale-alias',frameId:'alias-frame',linkedCelId:c.id,dataFile:'cels/stale-alias.rgba'};a.frames.push({id:alias.frameId,duration:230});a.cels.push(alias);
  if(mode==='absent'){delete alias.dataFile;delete alias.dataEncoding;}else{if(mode==='geometry'){alias.width=alias.height=1;alias.offsetX=-3;alias.offsetY=5;}r[alias.dataFile]=new Uint8Array(mode==='geometry'?4:16).fill(255);}
  if(chain){const tail={...alias,id:'stale-tail',frameId:'tail-frame',linkedCelId:alias.id};a.frames.push({id:tail.frameId,duration:310});a.cels.push(tail);a.activeFrameId=tail.frameId;}else a.activeFrameId=alias.frameId;
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);const {createAnimationCelLookup}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/animation.ts')));const lookup=createAnimationCelLookup(decoded.animation);
  for(const cel of decoded.animation.cels){const root=lookup.resolve(cel);if(root.id!==c.id||root.surface.width!==2||root.surface.offsetX!==0||root.surface.pixels[0]!==10)throw new Error('Linked fallback oracle mismatch');}
  if(decoded.layers[0].pixels[0]!==10)throw new Error('Linked fallback active projection mismatch');
  fs.writeFileSync(path.join(out,`linked-cache-${mode}-${Number(chain)}.moonsprite`),bytes);
 }
 for(const mode of ['absent','null','empty','invalid','hole-active','hole-inactive']){
  const m=structuredClone(manifest),r={...files},l=m.document.layers[0],a=m.document.animation;
  l.dataEncoding='raw';r[l.dataFile]=new Uint8Array(16).fill(255);
  if(mode==='absent')delete m.document.animation;else if(mode==='null')m.document.animation=null;else if(mode==='empty')a.frames=[];else if(mode==='invalid')a.frames=[null,7];
  else{a.frames.push({id:'hole-frame',duration:270});if(mode==='hole-active')a.activeFrameId='hole-frame';}
  if(!mode.startsWith('hole')){if(m.document.animation)m.document.animation.cels=[];}else{a.cels[0].dataEncoding='raw';r[a.cels[0].dataFile]=new Uint8Array(16).fill(255);}
  const refs=new Set([l.dataFile,...(mode.startsWith('hole')?a.cels.map(x=>x.dataFile):[])]);for(const k of Object.keys(r))if((k.startsWith('layers/')||k.startsWith('cels/'))&&!refs.has(k))delete r[k];
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  const blank=mode!=='hole-inactive';if(decoded.animation.frames.length!==(mode.startsWith('hole')?2:1)||decoded.layers[0].pixels.some(v=>v!==(blank?0:255)))throw new Error('Sparse animation oracle mismatch '+mode);
  fs.writeFileSync(path.join(out,`sparse-animation-${mode}.moonsprite`),bytes);
 }
 const tileModule=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/tilemap.ts')));
 const freeModule=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/free-tile.ts')));
 const {ensureAnimationDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/animation.ts')));
 for(const kind of ['text','adjustment','tilemap','free-tile'])for(const active of [false,true]){
  const d=createDocument('Special missing slot',4,4,'rgba');ensureAnimationDocument(d);const l=d.layers[0],c=d.animation.cels[0];l.kind=kind;
  if(kind==='tilemap'){d.tilesets=[tileModule.createSolidTileset('hole-sheet','Tiles',2,2,{r:10,g:20,b:30,a:255},'hole-tile')];l.tilemapTilesetId='hole-sheet';c.tilemap=tileModule.createTilemapCelData(4,4,2,2);c.tilemap.cells[0]={tilesetId:'hole-sheet',tileId:'hole-tile'};c.surface=tileModule.renderTilemapSurface(c.tilemap,d.tilesets,'rgba');}
  if(kind==='free-tile'){d.tilesets=[tileModule.createSolidTileset('hole-sheet','Source',2,1,{r:10,g:20,b:30,a:255},'hole-tile')];l.freeTileSetId='hole-set';l.freeTileSources=[{id:'hole-source',name:'Source',tilesetId:'hole-sheet',visible:true,locked:false,opacity:1,blendMode:'normal',offsetX:0,offsetY:0}];c.freeTiles={instances:[{id:'hole-instance',sourceId:'hole-source',x:0,y:1}]};c.surface=freeModule.renderFreeTileSurface(c.freeTiles,freeModule.freeTileSourceRefs(l.freeTileSources,d.tilesets),'rgba',4,4);}
  const r=unzipSync(encodeProject(d,{includePreview:false})),m=JSON.parse(strFromU8(r['manifest.json']));m.document.animation.frames.push({id:'missing-special',duration:260});if(active)m.document.animation.activeFrameId='missing-special';r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);ensureAnimationDocument(decoded);
  const blank=decoded.animation.cels.find(x=>x.frameId==='missing-special');if(!blank||blank.text||blank.freeTiles?.instances.length||blank.tilemap?.cells.some(Boolean))throw new Error('Special blank oracle mismatch '+kind);
  if(kind==='tilemap'&&(!blank.tilemap||blank.tilemap.columns!==2))throw new Error('Special grid template oracle mismatch');
  fs.writeFileSync(path.join(out,`special-hole-${kind}-${Number(active)}.moonsprite`),bytes);
 }
 // A tile layer can have no serialized Cel from which to copy grid dimensions.
 for(const [width,height,tw,th] of [[4,4,2,2],[5,3,2,2],[3,5,1,2]])for(const multiple of [false,true]){
  const d=createDocument('No tile grid template',width,height,'rgba');ensureAnimationDocument(d);const l=d.layers[0],c=d.animation.cels[0];l.kind='tilemap';l.tilemapTilesetId='no-template-sheet';d.tilesets=[tileModule.createSolidTileset('no-template-sheet','Tiles',tw,th,{r:10,g:20,b:30,a:255},'no-template-tile')];c.tilemap=tileModule.createTilemapCelData(width,height,tw,th);c.surface=tileModule.renderTilemapSurface(c.tilemap,d.tilesets,'rgba');
  const r=unzipSync(encodeProject(d,{includePreview:false})),m=JSON.parse(strFromU8(r['manifest.json']));m.document.animation.cels=[];if(multiple){m.document.animation.frames.push({id:'no-template-second',duration:280});m.document.animation.activeFrameId='no-template-second';}const keep=new Set(m.document.layers.map(x=>x.dataFile));for(const k of Object.keys(r))if(k.startsWith('cels/')&&!keep.has(k))delete r[k];r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);ensureAnimationDocument(decoded);
  const missing=decoded.animation.cels[0];if(missing.tilemap)throw new Error('No-template legacy unexpectedly inferred grid');let rejected=false;try{decodeProject(encodeProject(decoded,{includePreview:false}));}catch{rejected=true;}if(!rejected)throw new Error('No-template legacy reopen unexpectedly succeeds');
  fs.writeFileSync(path.join(out,`tile-no-template-${width}-${height}-${Number(multiple)}.moonsprite`),bytes);console.log('Legacy no-grid-template: open succeeds, materialized Cel has no grid, saved reopen rejects');
 }
 for(const version of [2,13,21])for(const field of ['frames','cels'])for(const malformed of ['absent','null','object','number']){
  const m=structuredClone(manifest),r={...files};m.schemaVersion=m.document.schemaVersion=version;const a=m.document.animation;
  if(malformed==='absent')delete a[field];else a[field]=malformed==='null'?null:malformed==='object'?{}:7;
  // Resources that normalize away are omitted; layer display still has a valid source.
  const l=m.document.layers[0];l.dataFile='layers/normalized-array.rgba';l.dataEncoding='raw';r[l.dataFile]=new Uint8Array(16).fill(255);a.cels=field==='cels'?a.cels:[];
  for(const k of Object.keys(r))if((k.startsWith('layers/')||k.startsWith('cels/'))&&k!==l.dataFile)delete r[k];r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  if(decoded.animation.frames.length!==1||decoded.animation.cels.length!==0||decoded.layers[0].pixels.some(Boolean))throw new Error('Malformed animation array oracle mismatch');
  fs.writeFileSync(path.join(out,`animation-array-${version}-${field}-${malformed}.moonsprite`),bytes);
 }
 for(const opacity of ['absent','null','string'])for(const linked of [false,true]){
  const m=structuredClone(manifest),r={...files},l=m.document.layers[0],a=m.document.animation,first=a.cels[0];l.opacity=.6;first.opacity=.2;
  for(const raster of [l,first]){raster.dataEncoding='raw';r[raster.dataFile]=new Uint8Array(16).fill(255);}
  const second={...first,id:'opacity-second',frameId:'opacity-frame',opacity:undefined};if(opacity==='null')second.opacity=null;if(opacity==='string')second.opacity='0.8';a.frames.push({id:second.frameId,duration:210});a.cels.push(second);a.activeFrameId=second.frameId;
  if(linked){a.frames.push({id:'opacity-tail-frame',duration:290});a.cels.push({...second,id:'opacity-tail',frameId:'opacity-tail-frame',linkedCelId:second.id,opacity:.9});a.activeFrameId='opacity-tail-frame';}
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);if(decoded.layers[0].opacity!==.6||decoded.layers[0].pixels.some(v=>v!==255))throw new Error('Imported active Cel opacity oracle mismatch');
  // Saving while the original active frame is displayed fixes omitted opacity
  // from that layer's original .6, before any frame-switch side effects.
  const persisted=decodeProject(encodeProject(decoded,{includePreview:false}));if(persisted.layers[0].opacity!==.6)throw new Error('Imported active Cel saved opacity oracle mismatch');
  fs.writeFileSync(path.join(out,`import-opacity-${opacity}-${Number(linked)}.moonsprite`),bytes);
 }
 // decodeProject drops Cels with no raster path or unusable dimensions before
 // ensureAnimationDocument fills the slot. Keep a valid grid template/resource.
 const droppedModes=['file-absent','file-null','file-empty','file-number','width-absent','width-null','width-string','width-zero','width-negative','width-fraction','width-unsafe','height-zero','height-string'];
 for(const kind of ['raster','text','adjustment','tilemap','free-tile'])for(const active of [false,true])for(const mode of droppedModes){
  let r;if(kind==='raster'){const d=createDocument('Dropped raster Cel',4,4,'rgba');ensureAnimationDocument(d);r=unzipSync(encodeProject(d,{includePreview:false}));}else r=unzipSync(fs.readFileSync(path.join(out,`special-hole-${kind}-0.moonsprite`)));
  const m=JSON.parse(strFromU8(r['manifest.json'])),a=m.document.animation,l=m.document.layers[0],first=a.cels[0];
  if(a.frames.length===1)a.frames.push({id:'missing-special',duration:260});const dropped={...first,id:'dropped-raster',frameId:'missing-special',dataFile:'cels/dropped-raster.rgba',dataEncoding:'raw'};r[dropped.dataFile]=new Uint8Array(64).fill(255);a.cels.push(dropped);a.activeFrameId=active?'missing-special':a.frames[0].id;
  const [field,type]=mode.split('-');if(type==='absent')delete dropped[field==='file'?'dataFile':field];else dropped[field==='file'?'dataFile':field]=type==='null'?null:type==='empty'?'':type==='number'?7:type==='string'?'4':type==='zero'?0:type==='negative'?-1:type==='fraction'?1.5:9007199254740992;
  // Missing/non-string paths are not resource references in the legacy manifest.
  if(field==='file')delete r['cels/dropped-raster.rgba'];if(kind==='raster'&&active&&mode==='file-absent'){dropped.mask={id:'dropped-cel-mask',width:2,height:2,offsetX:0,offsetY:0,dataFile:'masks/dropped-cel.u8',locked:true,autoLinkAnimationCels:false};r[dropped.mask.dataFile]=new Uint8Array([255,128,64,0]);}r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  if(decoded.animation.cels.length!==1||decoded.animation.cels.some(c=>c.id===dropped.id)||(active&&decoded.layers[0].pixels.some(Boolean)))throw new Error('Dropped raster decode oracle mismatch '+kind+' '+mode);
  ensureAnimationDocument(decoded);const blank=decoded.animation.cels.find(c=>c.frameId==='missing-special');if(!blank||blank.text||blank.freeTiles?.instances.length||blank.tilemap?.cells.some(Boolean))throw new Error('Dropped raster materialization oracle mismatch');
  decodeProject(encodeProject(decoded,{includePreview:false}));fs.writeFileSync(path.join(out,`dropped-raster-${kind}-${Number(active)}-${mode}.moonsprite`),bytes);
 }
 for(const mode of ['absent','null','empty','number','object','unknown','valid']){
  const m=structuredClone(manifest),r={...files},a=m.document.animation,l=m.document.layers[0];const second={...l,id:'fallback-second',name:'Second',dataFile:'layers/fallback-second.rgba',dataEncoding:'raw'};m.document.layers.push(second);r[second.dataFile]=new Uint8Array(16).fill(255);a.cels.push({...a.cels[0],id:'fallback-second-cel',layerId:second.id,dataFile:second.dataFile,dataEncoding:'raw'});
  if(mode==='absent')delete m.document.activeLayerId;else m.document.activeLayerId=mode==='null'?null:mode==='empty'?'':mode==='number'?7:mode==='object'?{}:mode==='unknown'?'not-a-layer':second.id;
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);if(decoded.activeLayerId!==(mode==='valid'?second.id:l.id))throw new Error('Active layer fallback oracle mismatch');fs.writeFileSync(path.join(out,`active-layer-fallback-${mode}.moonsprite`),bytes);
 }
 for(const mode of ['absent','null','number','object','array','unknown']){
  const m=structuredClone(manifest),r={...files},c=m.document.animation.cels[0];if(mode==='absent')delete c.dataEncoding;else c.dataEncoding=mode==='null'?null:mode==='number'?7:mode==='object'?{}:mode==='array'?[]:'future-codec';r[c.dataFile]=new Uint8Array(16).fill(255);r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);if(mode==='absent'){const decoded=decodeProject(bytes);if(decoded.layers[0].pixels.some(v=>v!==255))throw new Error('Cel raw encoding fallback oracle mismatch');}else {let rejected=false;try{decodeProject(bytes);}catch{rejected=true;}if(!rejected)throw new Error('Unknown Cel encoding accepted by legacy');}fs.writeFileSync(path.join(out,`cel-encoding-${mode==='absent'?'fallback':'reject'}-${mode}.moonsprite`),bytes);
 }
 for(const version of [4,5,21])for(const owner of ['layer','cel','dropped']){
  const m=structuredClone(manifest),r={...files};m.schemaVersion=m.document.schemaVersion=version;const target=owner==='layer'?m.document.layers[0]:m.document.animation.cels[0];target.dataEncoding=null;r[target.dataFile]=new Uint8Array(16);if(owner==='dropped')target.frameId='unknown-frame';r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);let accepted=true;try{decodeProject(bytes);}catch{accepted=false;}if(accepted!==(version===4))throw new Error('Raster encoding version gate oracle mismatch');fs.writeFileSync(path.join(out,`encoding-gate-${version}-${owner}.moonsprite`),bytes);
 }
 for(const mode of ['format-absent','format-invalid','missing-resource','truncated-resource']){
  const m=structuredClone(manifest),r={...files},c=m.document.animation.cels[0];if(mode==='format-absent')delete c.format;else if(mode==='format-invalid')c.format='future';else if(mode==='missing-resource'){c.dataFile='cels/missing.rgba';}else {c.dataFile='cels/truncated.rgba';c.dataEncoding='raw';r[c.dataFile]=new Uint8Array(3);}r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);let rejected=false;try{decodeProject(bytes);}catch{rejected=true;}if(!rejected)throw new Error('Corrupt raster unexpectedly accepted by legacy');fs.writeFileSync(path.join(out,`cel-raster-reject-${mode}.moonsprite`),bytes);
 }
 for(const mode of ['tilemap-no-payload','tilemap-text','free-no-payload','raster-tilemap','raster-free']){
  const source=mode.startsWith('free')||mode==='raster-free'?'free-tile':'tilemap';const r=unzipSync(fs.readFileSync(path.join(out,`special-hole-${source}-0.moonsprite`))),m=JSON.parse(strFromU8(r['manifest.json'])),c=m.document.animation.cels[0];delete c.dataFile;if(mode==='tilemap-no-payload')delete c.tilemap;else if(mode==='free-no-payload')delete c.freeTiles;else if(mode==='tilemap-text')c.text={text:'invalid'};else {delete m.document.layers[0].kind;delete m.document.layers[0].tilemapTilesetId;delete m.document.layers[0].freeTileSources;delete m.document.layers[0].freeTileSetId;}r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);let rejected=false;try{decodeProject(bytes);}catch{rejected=true;}if(!rejected)throw new Error('Dropped raster invalid payload accepted by legacy');fs.writeFileSync(path.join(out,`cel-payload-reject-${mode}.moonsprite`),bytes);
 }
 const malformedLinkOracle=[];
 for(const kind of ['raster','text','adjustment','tilemap','free-tile'])for(const mode of ['missing','self','cross','cycle2','cycle3','dropped-root','runtime-grid-order','runtime-grid-duplicate'])for(const active of [0,1,2])for(const fallback of [false,true])for(const order of ['normal','reverse','tail-first']){
  if(mode.startsWith('runtime-grid')&&(kind!=='tilemap'||fallback))continue;
  const r=kind==='raster'?{...files}:unzipSync(fs.readFileSync(path.join(out,`special-hole-${kind}-0.moonsprite`))),m=kind==='raster'?structuredClone(manifest):JSON.parse(strFromU8(r['manifest.json'])),a=m.document.animation,l=m.document.layers[0],template=a.cels[0];a.frames=[0,1,2].map(i=>({id:`bad-link-frame-${i}`,duration:100+i*50}));a.cels=[];a.activeFrameId=a.frames[active].id;l.opacity=.6;
  for(let i=0;i<3;i++){const c={...template,id:`bad-link-${i}`,frameId:a.frames[i].id,dataFile:`cels/bad-link-${i}.rgba`,dataEncoding:'raw',opacity:.2+i*.3,zIndex:i*3-2};const pixels=new Uint8Array(m.document.width*m.document.height*4);for(let p=0;p<pixels.length;p+=4)pixels.set([10+i*40,20,30,255],p);
   if(kind==='raster'){c.offsetX=i-1;c.offsetY=1-i;}
   if(kind==='text')c.text={text:`Frame ${i}`,fontSize:10+i,lineSpacing:i,letterSpacing:i,color:{r:10+i*40,g:20,b:30,a:255}};
   if(kind==='tilemap'){c.tilemap={...structuredClone(template.tilemap),cells:[{index:i,tilesetId:'hole-sheet',tileId:'hole-tile'}]};pixels.fill(0);for(let y=0;y<2;y++)for(let x=0;x<2;x++)pixels.set([10,20,30,255],(((i>>1)*2+y)*4+(i%2)*2+x)*4);}
   if(kind==='free-tile'){c.freeTiles={instances:[{id:`bad-instance-${i}`,sourceId:'hole-source',x:i,y:1}]};pixels.fill(0);for(let x=i;x<i+2;x++)pixels.set([10,20,30,255],(4+x)*4);}
   r[c.dataFile]=pixels;a.cels.push(c);}
  const [root,alias,tail]=a.cels;alias.linkedCelId=(mode==='missing'||mode.startsWith('runtime-grid'))?'missing-cel':mode==='self'?alias.id:mode==='cross'?'other-layer-cel':root.id;tail.linkedCelId=mode==='cycle3'?root.id:alias.id;
  if(mode==='cycle2'||mode==='cycle3')root.linkedCelId=alias.id;if(mode==='cycle3')alias.linkedCelId=tail.id;
  if(mode==='cross'){const other={...l,id:'other-link-layer'};m.document.layers.push(other);for(let i=0;i<3;i++)a.cels.push({...template,id:i===0?'other-layer-cel':`other-link-${i}`,layerId:other.id,frameId:a.frames[i].id});}
  if(mode==='dropped-root'){delete r[root.dataFile];delete root.dataFile;}
  if(!fallback)for(const c of [alias,tail]){delete r[c.dataFile];delete c.dataFile;}
  if(order==='reverse')a.cels.reverse();else if(order==='tail-first')a.cels=[tail,root,alias,...a.cels.slice(3)];
  if(mode.startsWith('runtime-grid')){alias.tilemap={...alias.tilemap,cells:[3,2,1,0].map(index=>({index,tilesetId:'hole-sheet',tileId:'hole-tile',flipHorizontal:index>1,rotation:index}))};if(mode==='runtime-grid-duplicate')a.cels.unshift({...alias,frameId:'absent-frame',tilemap:structuredClone(template.tilemap)});}
  const keep=new Set([l.dataFile,...a.cels.map(c=>c.dataFile).filter(Boolean)]);for(const k of Object.keys(r))if(k.startsWith('cels/')&&!keep.has(k))delete r[k];r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes);
  const {createAnimationCelLookup}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/animation.ts')));
  const snapshot=d=>{const lookup=createAnimationCelLookup(d.animation);return {active:Array.from(d.layers[0].pixels),cels:d.animation.cels.map(c=>{const source=lookup.resolve(c);return {id:c.id,frame:c.frameId,link:c.linkedCelId??null,source:source.id,width:source.surface?.width??0,height:source.surface?.height??0,pixels:source.surface?Array.from(source.surface.pixels):[]};})};};
  const before=snapshot(decoded);let directSaved,directSavedError;try{directSaved=snapshot(decodeProject(encodeProject(decodeProject(bytes),{includePreview:false})));}catch(e){directSavedError=e.message;}
  // Approved policy keeps active typed payload and Z as well as its pixels.
  // User additionally confirmed retaining no-raster free instances and
  // restoring their display, rather than discarding them to keep a blank cache.
  // Legacy alone can lose these when a cycle is broken or an alias lacks data.
  const initialLookup=createAnimationCelLookup(decoded.animation),activePayload=new Map(decoded.layers.map(layer=>{const source=initialLookup.resolve(initialLookup.at(layer.id,a.activeFrameId));return [layer.id,source?{text:source.text,tilemap:source.tilemap,freeTiles:source.freeTiles,zIndex:source.zIndex}:undefined];}));
  ensureAnimationDocument(decoded);const lookup=createAnimationCelLookup(decoded.animation);let blankGridRepairs=0;
  const blankGrid=layer=>{const model=decoded.animation.cels.find(c=>c.layerId===layer.id&&c.tilemap)?.tilemap;if(model)return {...model,cells:model.cells.map(()=>null)};const sheet=decoded.tilesets.find(s=>s.id===layer.tilemapTilesetId);return tileModule.createTilemapCelData(decoded.width,decoded.height,sheet.tileWidth,sheet.tileHeight);};
  for(const c of decoded.animation.cels){if(c.linkedCelId)continue;const owner=decoded.layers.find(layer=>layer.id===c.layerId);if(owner.kind==='tilemap'&&!c.tilemap){c.tilemap=blankGrid(owner);c.surface=tileModule.renderTilemapSurface(c.tilemap,decoded.tilesets,'rgba');blankGridRepairs++;}if(owner.kind==='free-tile'&&!c.freeTiles)c.freeTiles={instances:[]};}
  for(const layer of decoded.layers){const root=lookup.resolve(lookup.at(layer.id,a.activeFrameId)),payload=activePayload.get(layer.id);if(payload){root.text=payload.text;root.tilemap=payload.tilemap;root.freeTiles=payload.freeTiles;root.zIndex=payload.zIndex;}if(layer.kind==='tilemap'&&!root.tilemap){root.tilemap=blankGrid(layer);blankGridRepairs++;}if(layer.kind==='free-tile'&&!root.freeTiles)root.freeTiles={instances:[]};}
  // A no-raster modern alias passes through legacy normalization without its
  // source collection, accidentally producing legacy tileId fields. Preserve
  // every instance while using the actual source-aware normalizer to repair it.
  if(kind==='free-tile')for(const c of decoded.animation.cels)if(c.freeTiles){const owner=decoded.layers.find(layer=>layer.id===c.layerId);c.freeTiles=freeModule.normalizeFreeTileCelData(c.freeTiles,freeModule.freeTileSourceRefs(owner.freeTileSources,decoded.tilesets),true);if(!c.freeTiles)throw new Error('Cannot preserve malformed-link free tile instances');}
  const ensured=snapshot(decoded),canonical=encodeProject(decoded,{includePreview:false}),reopened=snapshot(decodeProject(canonical));const file=`malformed-links-${kind}-${mode}-${active}-${Number(fallback)}${order==='normal'?'':`-${order}`}.moonsprite`;fs.writeFileSync(path.join(out,file),bytes);fs.writeFileSync(path.join(out,file.replace('.moonsprite','-canonical.moonsprite')),canonical);malformedLinkOracle.push({file,kind,mode,active,fallback,order,before,ensured,directSaved,directSavedError,blankGridRepairs,reopened});
 }
 const corruptLinkFixtures=[];
 for(const kind of ['tilemap','free-tile'])for(const defect of ['missing','self','cycle2'])for(const fallback of [false,true])for(const problem of ['missing-resource','bad-item']){
  const r=unzipSync(fs.readFileSync(path.join(out,`special-hole-${kind}-0.moonsprite`))),m=JSON.parse(strFromU8(r['manifest.json'])),a=m.document.animation,root=a.cels[0],c={...structuredClone(root),id:'corrupt-linked-payload',frameId:a.frames[1].id};c.linkedCelId=defect==='missing'?'absent-cel':defect==='self'?c.id:root.id;if(defect==='cycle2')root.linkedCelId=c.id;if(!fallback)delete c.dataFile;a.cels.push(c);
  if(kind==='tilemap'){c.tilemap.cells[0].tileId=problem==='missing-resource'?'absent-tile':'hole-tile';if(problem==='bad-item')c.tilemap.cells[0].tilesetId='absent-sheet';}else if(problem==='missing-resource')c.freeTiles.instances[0].sourceId='absent-source';else c.freeTiles.instances.push(structuredClone(c.freeTiles.instances[0]));
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);let rejected=false;try{decodeProject(bytes);}catch{rejected=true;}if(!rejected)throw new Error('Legacy unexpectedly accepted corrupt linked payload');const file=`malformed-link-resource-${kind}-${defect}-${Number(fallback)}-${problem}.moonsprite`;fs.writeFileSync(path.join(out,file),bytes);corruptLinkFixtures.push(file);
 }
 fs.writeFileSync(path.join(out,'malformed-link-resource-fixtures.json'),JSON.stringify(corruptLinkFixtures,null,2));
 fs.writeFileSync(path.join(out,'malformed-links-oracle.json'),JSON.stringify(malformedLinkOracle,null,2));
 const changed=malformedLinkOracle.filter(x=>JSON.stringify(x.before.active)!==JSON.stringify(x.reopened.active));console.log(`Malformed links: ${malformedLinkOracle.length} legacy cases, ${changed.length} change displayed pixels after ensure/save`);
 const layerMetadataCases=[['absent',undefined],['null',null],['false',false],['true',true],['zero',0],['one',1],['negative',-2],['over',2],['fraction',.35],['fraction-over',1.75],['fraction-negative',-1.75],['empty',''],['string','false'],['array',[]],['object',{}]];
 const layerMetadataOracle=[];const {BLEND_MODES}=await import(pathToFileURL(path.join(legacy,'src/shared/types-color.ts')));
 for(const field of ['visible','locked','autoLinkAnimationCels','clippingMask','opacity','blendMode','kind','groupId','description','displayColor','tilemapTilesetId','width','height','offsetX','offsetY'])for(const [label,value] of layerMetadataCases){
  const m=structuredClone(manifest),r={...files},l=m.document.layers[0],a=m.document.animation;l.dataEncoding='raw';r[l.dataFile]=new Uint8Array([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);for(const c of a.cels)delete c.opacity;
  if(value===undefined)delete l[field];else l[field]=value;
  if(['width','height','offsetX','offsetY'].includes(field)){a.cels=[];if(['width','height'].includes(field)&&value===1)r[l.dataFile]=new Uint8Array(8);for(const key of Object.keys(r))if(key.startsWith('cels/')&&key!==l.dataFile)delete r[key];}
  r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes),canonical=encodeProject(decoded,{includePreview:false}),file=`layer-metadata-${field}-${label}.moonsprite`;fs.writeFileSync(path.join(out,file),bytes);fs.writeFileSync(path.join(out,file.replace('.moonsprite','-canonical.moonsprite')),canonical);layerMetadataOracle.push({file,field,label,expected:{visible:decoded.layers[0].visible,locked:decoded.layers[0].locked,opacity:decoded.layers[0].opacity,blendMode:decoded.layers[0].blendMode,kind:decoded.layers[0].kind??'',offsetX:decoded.layers[0].offsetX,offsetY:decoded.layers[0].offsetY}});
 }
 for(const [field,values] of [['blendMode',[...BLEND_MODES,'unknown']],['kind',['text','adjustment','unknown']],['description',[' 中文 description 😀 ','line 1\nline 2','\u3000完整保留\u3000']],['displayColor',[{r:10,g:20,b:30,a:255},{r:-1,g:300,b:2.5,a:100.5},{r:255,g:255,b:255,a:255},{r:0,g:0,b:0,a:0},{r:'1',g:2,b:3,a:255},{r:1,g:2,b:3}]],['linkedContentId',['linked',' linked ',null,false,0,'',' \t\n','\u3000\ufeff']]])for(let i=0;i<values.length;i++){
  const m=structuredClone(manifest),r={...files},l=m.document.layers[0];l[field]=values[i];let canonical,accepted=true;r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);try{canonical=encodeProject(decodeProject(bytes),{includePreview:false});}catch{accepted=false;}const file=`layer-special-${field}-${i}.moonsprite`;fs.writeFileSync(path.join(out,file),bytes);if(accepted)fs.writeFileSync(path.join(out,file.replace('.moonsprite','-canonical.moonsprite')),canonical);layerMetadataOracle.push({file,field,index:i,accepted});
 }
 for(const [label,kind,background] of [['text','text'],['adjustment','adjustment'],['unknown','unknown'],['number',1],['object',{}],['array',[]],['background',undefined,{mode:'canvas'}]]){
  const m=structuredClone(manifest),r={...files},l=m.document.layers[0];l.linkedContentId='shared';if(kind!==undefined)l.kind=kind;if(background)l.background=background;r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r);let rejected=false;try{decodeProject(bytes);}catch{rejected=true;}if(!rejected)throw new Error('Legacy linked layer kind gate mismatch');fs.writeFileSync(path.join(out,`layer-linked-kind-reject-${label}.moonsprite`),bytes);
 }
 fs.writeFileSync(path.join(out,'layer-metadata-oracle.json'),JSON.stringify(layerMetadataOracle,null,2));console.log(`Layer metadata: ${layerMetadataOracle.length} actual legacy cases plus seven linked-kind rejections`);

 // Actual decoder/encoder oracle: column coercion and sparse-slot repair.
 // Independent paletteOrder remains a separately gated native model gap.
 const paletteLayoutCases=[];
 const paletteLayoutValues=[undefined,null,false,true,0,1,-2,257,3,2.5,'4',[],{},9007199254740991,9007199254740992];
 for(let i=0;i<paletteLayoutValues.length;++i)paletteLayoutCases.push([`columns-${i}`,d=>{d.paletteColumns=paletteLayoutValues[i];}]);
 const paletteSlotValues=[undefined,null,false,true,0,'slots',{},[],[1],[null,1],[1,1,2],[1,999,2],[1,'2',2],[1,false,2],[1,{},2],[1,[],2],[1,1.5,2],[1,9007199254740991,2],[1,-1,2],[1,0,2],[1,2,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,1]];
 for(let i=0;i<paletteSlotValues.length;++i)paletteLayoutCases.push([`slots-${i}`,d=>{d.paletteSlots=paletteSlotValues[i];}]);
 for(const columns of [1,3,8,256])for(const [layout,slots] of [['holes',[null,1,null,2,null]],['missing',[null,1]],['trailing',[1,2,...Array(17).fill(null)]]])paletteLayoutCases.push([`grid-${columns}-${layout}`,d=>{d.paletteColumns=columns;d.paletteSlots=slots;}]);
 for(const order of [undefined,null,false,{},'order',[],[1,'2',2],[1,1.5,2],[1,true,2],[1,9007199254740992,2]])paletteLayoutCases.push([`order-${paletteLayoutCases.length}`,d=>{d.paletteOrder=order;}]);
 paletteLayoutCases.push(['hidden-entry',d=>{d.paletteOrder=[1];d.paletteSlots=[1,2,null];}]);
 const paletteLayoutOracle=[];
 for(const [label,mutate] of paletteLayoutCases){const m=structuredClone(manifest),r={...files};mutate(m.document);r['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(r),decoded=decodeProject(bytes),canonical=encodeProject(decoded,{includePreview:false});const file=`palette-layout-${label}.moonsprite`;fs.writeFileSync(path.join(out,file),bytes);fs.writeFileSync(path.join(out,file.replace('.moonsprite','-canonical.moonsprite')),canonical);paletteLayoutOracle.push({file,columns:decoded.paletteColumns,order:decoded.paletteOrder,slots:decoded.paletteSlots});}
 fs.writeFileSync(path.join(out,'palette-layout-oracle.json'),JSON.stringify(paletteLayoutOracle,null,2));console.log(`Palette layout: ${paletteLayoutOracle.length} actual legacy cases`);
 console.log('Generated project manifest fixtures through legacy encodeProject');
})().catch(e=>{console.error(e);process.exitCode=1;});
