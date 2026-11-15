// Executes actual legacy indexed image resize commands and snapshot history via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
const upngModuleUrl=pathToFileURL(require.resolve('upng-js',{paths:[legacy]})).href;
registerHooks({
 resolve(specifier,context,nextResolve) {
  // Bridge this legacy CommonJS dependency as the production bundler does.
  if(specifier==='upng-js'){const moduleUrl=upngModuleUrl;return {url:'data:text/javascript,'+encodeURIComponent('import value from '+JSON.stringify(moduleUrl)+';export const decode=value.decode,toRGBA8=value.toRGBA8;export default value;'),shortCircuit:true};}
  // Bundler asset URL imports are inert in these non-export command tests.
  if(specifier.startsWith("@/assets/")&&specifier.endsWith("?url"))return {url:"data:text/javascript,export default "+encodeURIComponent(JSON.stringify(pathToFileURL(path.join(legacy,"src/renderer/src",specifier.slice(2,-4))).href)),shortCircuit:true};
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
  if(url.startsWith('file:')&&url.endsWith('.ts')) {
   // Node strips explicit type imports; legacy's bundler also erases these
   // two interface imports. This changes no executable legacy statement.
   const input=fs.readFileSync(fileURLToPath(url),'utf8').replace('import { BrushGradientSample,','import { type BrushGradientSample,').replace(', BrushGradientSample,',', type BrushGradientSample,').replace(/, BrushMaskPoint(?=[, }])/g,', type BrushMaskPoint');
   return {format:'module',source:stripTypeScriptTypes(input,{mode:'transform'}),shortCircuit:true};
  }
  return nextLoad(url,context);
 }
});


(async()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 globalThis.window={requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,setTimeout,clearTimeout,moonSprite:{getResourceInfo:async()=>({freeBytes:16*1024**3,totalBytes:32*1024**3})}};
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src',p)));
 const model=await imp('core/document-model.ts'),anim=await imp('core/animation.ts'),{unpackColor}=await imp('core/raster.ts');
 const {createWorkspaceDocumentIoCommands}=await imp('store/workspace-commands-document-io.ts');
 const {detectDocumentPixelScale}=await imp('core/image-scale-detection.ts');
 const packed=p=>Array.from({length:p.length/4},(_,i)=>(p[i*4]|p[i*4+1]<<8|p[i*4+2]<<16|p[i*4+3]<<24)>>>0);
 const raw=s=>s.format==='indexed'?Array.from(s.pixels):packed(s.pixels);
 const snap=s=>{const origin='id' in s?model.getLayerStorageOrigin(s):{x:s.storageOriginX??0,y:s.storageOriginY??0};return {format:s.format,width:s.width,height:s.height,ox:s.offsetX,oy:s.offsetY,sx:origin.x,sy:origin.y,pixels:raw(s)};};
 const selection=s=>s?{x:s.x,y:s.y,width:s.width,height:s.height,mask:s.mask?Array.from(s.mask):[]}:null;
 const base=[{id:0,name:'zero',color:0},{id:7,name:'red',color:0xff0000ff},{id:19,name:'blue',color:0xffff0000},{id:30,name:'partial',color:0x80804020},{id:99,name:'hidden',color:0x00123456}];
 const cases=[];
 for(const palette of ['normal','opaque-zero','duplicate','empty'])for(const layout of ['dense','negative','positive','offcanvas','tiny','blank'])for(const target of [[14,10],[11,3],[3,8],[1,1],[7,5],[13,7]])for(const method of ['nearest','smooth'])for(let variant=0;variant<3;variant++){
  const w=7,h=5,sw=layout==='tiny'||layout==='blank'?1:layout==='dense'?w:6,sh=layout==='tiny'||layout==='blank'?1:layout==='dense'?h:4,ox=layout==='negative'?-3:layout==='positive'?2:layout==='offcanvas'?13:layout==='tiny'||layout==='blank'?-1:0,oy=layout==='negative'?1:layout==='positive'?-2:layout==='offcanvas'?9:0;
  const d=model.createDocument('indexed resize',w,h,'indexed',false),l=d.layers[0];
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,name:'duplicate',color:0xff00ff00});if(palette==='empty')entries.length=0;
  d.palette=entries.map(e=>({...e,color:unpackColor(e.color)}));d.paletteOrder=variant===2?[19,7]:[0,7,19,30,99];d.nextColorId=100;
  const initial=Array.from({length:sw*sh},(_,i)=>layout==='blank'?0:[0,7,19,30,99,404,2147483647,4294967295][i%8]);Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:new Uint32Array(initial)});model.setLayerStorageOrigin(l,{x:5,y:-3});anim.syncActiveAnimationLayer(d,l.id);
  let mask=null;if(variant===2){mask=model.createLayerMask(l.id,3,2);mask.offsetX=-1;mask.offsetY=1;model.setLayerStorageOrigin(mask,{x:-4,y:7});const values=[0,0xff000000,0xff808080,0xffffffff,0xff373737,0xffcccccc];for(let i=0;i<6;i++)for(let b=0;b<4;b++)mask.pixels[i*4+b]=(values[i]>>>(b*8))&255;d.animation.layerMasks.push({layerId:l.id,frameId:d.animation.activeFrameId,mask});}
  const sel=variant===0?null:variant===1?{x:1,y:-1,width:4,height:3}:{x:-1,y:1,width:5,height:3,mask:new Uint8Array(Array.from({length:15},(_,i)=>[0,1,2,255][i%4]))};
  const history=[];const session={document:d,selection:sel,history:{push:e=>history.push(e)},revision:0,contentRevision:0};
  const state={sessions:[session],activeId:d.id,mutateActive:f=>f(session)};
  const commands=createWorkspaceDocumentIoCommands({get:()=>state,set:change=>Object.assign(state,change),recording:{},services:{}});
  const snapshot=()=>({w:d.width,h:d.height,surface:snap(l),mask:mask?snap(mask):null,selection:selection(session.selection)});
  const before=snapshot();await commands.resizeActiveImage(target[0],target[1],method);if(state.message)throw Error(state.message);const expected=snapshot();if(history.length!==(w===target[0]&&h===target[1]?0:1))throw Error('history count');
  if(history.length){history[0].undo();if(JSON.stringify(snapshot())!==JSON.stringify(before))throw Error('legacy undo');history[0].redo();if(JSON.stringify(snapshot())!==JSON.stringify(expected))throw Error('legacy redo');}
  cases.push({name:`${palette}-${layout}-${target}-${method}-${variant}`,w,h,tw:target[0],th:target[1],method,entries,order:d.paletteOrder,before,expected,changed:history.length===1});
 }
 // Fractional negative boundaries and a final partial axis-table stripe.
 for(const ox of [-17,-1,3])for(const tw of [4095,4096,4097])for(const method of ['nearest','smooth']){
  const d=model.createDocument('stripe',17,3,'indexed',false),l=d.layers[0];Object.assign(l,{width:5,height:2,offsetX:ox,offsetY:-1,pixels:new Uint32Array([0,7,19,99,4294967295,404,19,7,2147483647,0])});model.setLayerStorageOrigin(l,{x:5,y:-3});anim.syncActiveAnimationLayer(d,l.id);const before={w:17,h:3,surface:snap(l),mask:null,selection:null};model.resizeDocumentImage(d,tw,2,method);const expected={w:d.width,h:d.height,surface:snap(l),mask:null,selection:null};cases.push({name:`stripe-${ox}-${tw}-${method}`,w:17,h:3,tw,th:2,method,entries:base,order:[0,7,19,30,99],before,expected,changed:true});
 }
 const linked=[];
 // Actual linked-layer synchronization chooses the active owner after scaling
 // independently placed shared surfaces, including fractional sparse bounds.
 for(const active of [0,1])for(const dx of [-4,0,5])for(const target of [[11,3],[3,8]])for(const method of ['nearest','smooth']){
  const d=model.createDocument('linked resize',7,5,'indexed',false),l=d.layers[0];d.palette=base.map(e=>({...e,color:unpackColor(e.color)}));d.paletteOrder=[0,7,19,30,99];d.nextColorId=100;
  Object.assign(l,{width:6,height:4,offsetX:-3,offsetY:1,pixels:new Uint32Array(Array.from({length:24},(_,i)=>[0,7,19,30,99,404,2147483647,4294967295][i%8]))});model.setLayerStorageOrigin(l,{x:5,y:-3});anim.syncActiveAnimationLayer(d,l.id);
  l.linkedContentId='resize-link';const second=model.createLayer('second',7,5,'indexed');Object.assign(second,{width:l.width,height:l.height,offsetX:l.offsetX+dx,offsetY:l.offsetY-2,pixels:l.pixels,linkedContentId:l.linkedContentId});model.setLayerStorageOrigin(second,{x:5,y:-3});d.layers.push(second);anim.syncActiveAnimationLayer(d,second.id);d.activeLayerId=d.layers[active].id;anim.synchronizeLinkedLayerContents(d,d.activeLayerId);
  const session={document:d,selection:null,history:{push:e=>history.push(e)}};const history=[],state={sessions:[session],activeId:d.id,mutateActive:f=>f(session)};
  const commands=createWorkspaceDocumentIoCommands({get:()=>state,set:c=>Object.assign(state,c),recording:{},services:{}});
  const snapshot=()=>({w:d.width,h:d.height,surface:snap(l),other:snap(second),mask:null,selection:null});const before=snapshot();await commands.resizeActiveImage(...target,method);if(state.message)throw Error(state.message);const expected=snapshot();history[0].undo();if(JSON.stringify(snapshot())!==JSON.stringify(before))throw Error('linked undo');history[0].redo();if(JSON.stringify(snapshot())!==JSON.stringify(expected))throw Error('linked redo');
  linked.push({name:`linked-${active}-${dx}-${target}-${method}`,w:7,h:5,tw:target[0],th:target[1],method,active,entries:base,order:d.paletteOrder,before,expected,changed:true});
 }
 const detections=[];
 for(const palette of ['normal','opaque-zero','duplicate','empty'])for(const factor of [2,3,4,7])for(const partial of [false,true]){
  const w=35,h=28,d=model.createDocument('detect indexed',w,h,'indexed',false),l=d.layers[0];const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,name:'duplicate',color:0xffff0000});if(palette==='empty')entries.length=0;d.palette=entries.map(e=>({...e,color:unpackColor(e.color)}));d.paletteOrder=[0,7,19,30,99];const initial=Array.from({length:w*h},(_,i)=>((Math.floor((i%w)/factor)+Math.floor(Math.floor(i/w)/factor))%2)?7:partial?30:19);l.pixels=new Uint32Array(initial);anim.syncActiveAnimationLayer(d,l.id);detections.push({name:`detect-${palette}-${factor}-${partial}`,w,h,entries,order:d.paletteOrder,initial,scale:detectDocumentPixelScale(d)??0});
 }
 fs.writeFileSync(out,JSON.stringify({cases,linked,detections}));console.log(`${cases.length} actual legacy indexed resize results/snapshot histories; ${linked.length} independently placed linked-layer cases; ${detections.length} indexed composite scale detections`);
})().catch(e=>{console.error(e);process.exitCode=1;});
