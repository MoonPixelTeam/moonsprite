// Executes actual legacy indexed canvas/crop/trim commands and snapshot history via Node's TypeScript loader.
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
 const packed=p=>Array.from({length:p.length/4},(_,i)=>(p[i*4]|p[i*4+1]<<8|p[i*4+2]<<16|p[i*4+3]<<24)>>>0);
 const snap=s=>{const o='id' in s?model.getLayerStorageOrigin(s):{x:s.storageOriginX??0,y:s.storageOriginY??0};return {format:s.format,width:s.width,height:s.height,ox:s.offsetX,oy:s.offsetY,sx:o.x,sy:o.y,pixels:s.format==='indexed'?Array.from(s.pixels):packed(s.pixels)};};
 const sel=s=>s?{x:s.x,y:s.y,width:s.width,height:s.height,mask:s.mask?Array.from(s.mask):[]}:null;
 const base=[{id:0,name:'zero',color:0},{id:7,name:'red',color:0xff0000ff},{id:19,name:'blue',color:0xffff0000},{id:30,name:'partial',color:0x80804020},{id:99,name:'hidden',color:0x00123456}];
 const cases=[];
 async function run(palette,layout,operation,target,anchor,trim,variant,extra='',active=0,linkDx=0){
  const w=7,h=5,d=model.createDocument('indexed canvas',w,h,'indexed',false),l=d.layers[0];
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,name:'duplicate',color:0xff00ff00});if(palette==='empty')entries.length=0;
  d.palette=entries.map(e=>({...e,color:unpackColor(e.color)}));d.paletteOrder=[0,7,19,30,99];d.nextColorId=100;
  const sw=layout==='dense'?w:layout==='tiny'||layout==='blank'?1:6,sh=layout==='dense'?h:layout==='tiny'||layout==='blank'?1:4;
  const ox=layout==='negative'?-3:layout==='positive'?2:layout==='offcanvas'?13:layout==='tiny'?3:0,oy=layout==='negative'?1:layout==='positive'?-2:layout==='offcanvas'?9:layout==='tiny'?2:0;
  Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:new Uint32Array(Array.from({length:sw*sh},(_,i)=>layout==='blank'?0:[0,7,19,30,99,404,2147483647,4294967295][i%8]))});model.setLayerStorageOrigin(l,{x:5,y:-3});anim.syncActiveAnimationLayer(d,l.id);
  if(extra==='linked'){
   l.linkedContentId='canvas-link';const second=model.createLayer('second',w,h,'indexed');Object.assign(second,{width:sw,height:sh,offsetX:ox+linkDx,offsetY:oy-2,pixels:l.pixels,linkedContentId:l.linkedContentId});model.setLayerStorageOrigin(second,{x:5,y:-3});d.layers.push(second);anim.syncActiveAnimationLayer(d,second.id);d.activeLayerId=d.layers[active].id;anim.synchronizeLinkedLayerContents(d,d.activeLayerId);
  }
  if(extra==='frames'||extra==='alias'){
   const first=d.animation.activeFrameId;const next=anim.addBlankAnimationFrame(d);d.animation.frames.find(f=>f.id===next).disabled=true;
   if(extra==='alias'){anim.activateAnimationFrame(d,first);anim.linkAnimationFrameCels(d,first,next,[l.id]);}
   else {Object.assign(l,{width:2,height:2,offsetX:4,offsetY:3,pixels:new Uint32Array([19,0,7,30])});model.setLayerStorageOrigin(l,{x:-2,y:6});anim.syncActiveAnimationLayer(d,l.id);anim.activateAnimationFrame(d,first);}
  }
  const masks=variant===3;
  if(masks){
   d.groups.push({id:'canvas-group',name:'group',parentGroupId:null,visible:true,locked:false,opacity:1,blendMode:'normal'});l.groupId='canvas-group';
   for(const group of [false,true]){const m=model.createLayerMask(group?'canvas-group':l.id,3,2);m.offsetX=-1;m.offsetY=1;model.setLayerStorageOrigin(m,{x:-4,y:7});const values=[0,0xff000000,0xff808080,0xffffffff,0xff373737,0xffcccccc];for(let i=0;i<6;i++)for(let b=0;b<4;b++)m.pixels[i*4+b]=(values[i]>>>(b*8))&255;
    (group?d.animation.groupMasks:d.animation.layerMasks).push({[group?'groupId':'layerId']:group?'canvas-group':l.id,frameId:d.animation.activeFrameId,mask:m});}
  }
  if(extra==='hidden')l.visible=false;if(extra==='locked')l.locked=true;
  const selection=variant===0?null:variant===1?{x:1,y:-1,width:4,height:3}:variant===2?{x:-1,y:1,width:5,height:3,mask:new Uint8Array(Array.from({length:15},(_,i)=>[0,1,2,255][i%4]))}:variant===4?{x:0,y:0,width:w,height:h}:variant===5?{x:20,y:20,width:3,height:2}:{x:1,y:1,width:3,height:3,mask:new Uint8Array(9)};
  const history=[],session={document:d,selection,selectionPivot:{x:2.5,y:-.5},history:{push:e=>history.push(e)},revision:0,contentRevision:0};
  const state={sessions:[session],activeId:d.id,mutateActive:f=>f(session),commitFloatingPaste:()=>{}};
  const commands=createWorkspaceDocumentIoCommands({get:()=>state,set:c=>Object.assign(state,c),recording:{},services:{}});
  const snapshot=()=>({w:d.width,h:d.height,selection:sel(session.selection),pivot:session.selectionPivot??null,
   cels:d.animation.cels.map(c=>({id:c.id,layerId:c.layerId,frameId:c.frameId,link:c.linkedCelId??'',surface:snap(anim.resolveAnimationCel(d.animation,c).surface)})),
   masks:[...d.animation.layerMasks.map(m=>({...m,group:false})),...d.animation.groupMasks.map(m=>({...m,group:true}))].map(m=>({id:m.mask.id,owner:m.group?m.groupId:m.layerId,frame:m.frameId,group:m.group,surface:snap(m.mask)}))});
  const before=snapshot(),layers=d.layers.map(l=>({id:l.id,visible:l.visible,locked:l.locked,opacity:l.opacity,group:l.groupId??'',linked:l.linkedContentId??''})),frames=d.animation.frames.map(f=>({...f}));
  if(operation==='resize')await commands.resizeActiveCanvas(...target,anchor,variant===6?-4:undefined,variant===6?3:undefined,trim);
  if(operation==='crop')await commands.cropActiveCanvas();if(operation==='trim-all')await commands.trimActiveCanvas();if(operation==='trim-current')await commands.trimActiveCanvasCurrentFrame();
  const expected=snapshot();if(history.length>1)throw Error('history count');if(history.length){history[0].undo();if(JSON.stringify(snapshot())!==JSON.stringify(before))throw Error('legacy undo '+extra);history[0].redo();if(JSON.stringify(snapshot())!==JSON.stringify(expected))throw Error('legacy redo '+extra);}
  cases.push({name:`${palette}-${layout}-${operation}-${target}-${anchor}-${trim}-${variant}-${extra}-${active}-${linkDx}`,w,h,tw:target[0],th:target[1],anchor:['nw','n','ne','w','c','e','sw','s','se'].indexOf(anchor),trim,dx:variant===6?-4:null,dy:variant===6?3:null,operation,entries,order:d.paletteOrder,layers,frames,activeLayer:d.activeLayerId,activeFrame:d.animation.activeFrameId,before,expected,changed:history.length===1,error:!!state.message});
 }
 for(const palette of ['normal','opaque-zero','duplicate','empty'])for(const layout of ['dense','negative','positive','offcanvas','tiny','blank']){
  for(const anchor of ['nw','n','ne','w','c','e','sw','s','se'])for(const trim of [false,true])await run(palette,layout,'resize',[4,8],anchor,trim,(cases.length%7));
  for(const operation of ['crop','trim-all','trim-current'])for(const variant of [0,1,2,3,4,5])await run(palette,layout,operation,[7,5],'c',true,variant);
 }
 for(const extra of ['linked','frames','alias','hidden','locked'])for(const operation of ['resize','crop','trim-all','trim-current'])for(const trim of [false,true])for(const active of (extra==='linked'?[0,1]:[0]))for(const dx of (extra==='linked'?[-4,0,5]:[0]))await run('normal','negative',operation,[4,8],'c',trim,2,extra,active,dx);
 for(const variant of [0,2,3,4,6])for(const trim of [false,true])await run('opaque-zero','negative','resize',[7,5],'c',trim,variant);
 fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy canvas/crop/trim commands and raw snapshot histories`);
})().catch(e=>{console.error(e);process.exitCode=1;});
