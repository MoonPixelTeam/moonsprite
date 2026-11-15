// Executes actual legacy indexed anti-alias kernels and PixelEdit history via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,nextResolve) {
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
 globalThis.localStorage={getItem:()=>null};
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src',p)));
 const model=await imp('core/document-model.ts'),anim=await imp('core/animation.ts'),{unpackColor}=await imp('core/raster.ts');
 const {antiAliasSelection}=await imp('core/tools-outline.ts'),history=await imp('core/history.ts');
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0x800908a0},{id:41,color:0x40408020},{id:53,color:0xff800080},{id:65,color:0xff00ff00},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const snapshot=layer=>({width:layer.width,height:layer.height,ox:layer.offsetX,oy:layer.offsetY,sx:model.getLayerStorageOrigin(layer).x,sy:model.getLayerStorageOrigin(layer).y,pixels:Array.from(layer.pixels)});
 const cases=[];let alteredCancels=0;
 for(const palette of ['normal','opaque-zero','duplicate','transparent-first','transparent-last','empty'])for(const orderKind of ['all','subset','empty'])for(const layout of ['dense','negative','offcanvas','tiny','blank','dense-blank','interior'])for(let source=0;source<3;source++)for(let variant=0;variant<6;variant++){
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,color:0xff00ff00});if(palette==='transparent-first'){entries.find(e=>e.id===7).color=0x00123456;entries.push({id:7,color:0xff00ff00});}if(palette==='transparent-last')entries.push({id:7,color:0x00123456});if(palette==='empty')entries.length=0;
  const order=orderKind==='all'?base.map(e=>e.id):orderKind==='subset'?[77,41,65,7]:[];
  const w=7,h=7,tiny=layout==='tiny'||layout==='blank',sw=tiny?1:layout==='dense'||layout==='dense-blank'||layout==='interior'?w:5,sh=sw,ox=layout==='negative'?-1:layout==='offcanvas'||layout==='blank'?9:tiny?3:0,oy=layout==='negative'?1:layout==='offcanvas'||layout==='blank'?8:tiny?3:0;
  const initial=Array.from({length:sw*sh},(_,i)=>{const x=i%sw,y=Math.floor(i/sw);if(layout==='blank'||layout==='dense-blank')return 0;if(layout==='interior')return x>0&&y>0&&x<6&&y<6?x>=2&&y>=2&&x<=4&&y<=4?19:7:0;return x===y?[7,19,30,41,65,77,53][x%7]:(x+y)%5===0?99:(x+y)%11===0?404:0;});
  const make=()=>{const d=model.createDocument('indexed AA',w,h,'indexed',false),layer=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=[...order];d.nextColorId=100;Object.assign(layer,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:new Uint32Array(initial)});model.setLayerStorageOrigin(layer,{x:5,y:-3});anim.syncActiveAnimationLayer(d,layer.id);return [d,layer];};
  const options={color:variant===2?0x00654321:variant===3?0x8052a317:variant===4?0xff17a352:null,opacity:[50,0,100,37,100,130][variant],interior:variant%2===1,colorSource:source};
  const selection=variant===5?{x:-1,y:0,width:7,height:7,mask:new Uint8Array(Array.from({length:49},(_,i)=>i%7===0?2:i%3===0?0:1))}:null;
  const apply=(d,l)=>antiAliasSelection(d,l,selection,options.color===null?null:unpackColor(options.color),options.opacity,options.interior,['automatic','canvas','palette'][source]);
  const [d,l]=make(),before=snapshot(l),edit=apply(d,l),expected=snapshot(l),entry=edit?history.commitPixelEdit(d,edit,'AA'):null;let undo=expected,redo=expected;
  if(entry){entry.undo();undo=snapshot(l);entry.redo();redo=snapshot(l);}
  const [cancelDoc,cancelLayer]=make(),cancelEdit=apply(cancelDoc,cancelLayer);history.revertPixelEdit(cancelDoc,cancelEdit);const cancelled=snapshot(cancelLayer);
  // Compare world pixels at the modified sites separately from storage expansion.
  if(cancelEdit&&[...cancelEdit.before].some(([i,v])=>cancelLayer.pixels[i]!==v))alteredCancels++;
  if(d.palette.length!==entries.length||d.nextColorId!==100)throw Error('palette allocation');
  cases.push({name:`${palette}-${orderKind}-${layout}-${source}-${variant}`,w,h,sw,sh,ox,oy,initial,entries:entries.map(e=>({...e,name:String(e.id)})),order,options,selection:selection?{...selection,mask:Array.from(selection.mask)}:null,produced:!!entry,expected,undo,redo,cancelled});
 }

 // Exercise actual command previews, sequential targets, background exclusion and
 // scalar masks against an indexed document composite, with no reimplementation.
 const {createSelectionAntiAliasCommands}=await imp('store/workspace-commands-selection-anti-alias.ts');
 const scenes=[];
 for(const kind of ['background-below','background-above','background-target','multiple','mask'])for(let source=0;source<3;source++)for(let variant=0;variant<3;variant++){
  const w=7,h=7,d=model.createDocument('indexed AA scene',w,h,'indexed',false),layer=d.layers[0];
  d.palette=base.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=base.map(e=>e.id);d.nextColorId=100;
  const initial=Array.from({length:49},(_,i)=>i%8===0&&i<41?[7,19,30,41,65,77][i/8]:0);layer.pixels=new Uint32Array(initial);model.setLayerStorageOrigin(layer,{x:5,y:-3});
  const other=model.createLayer('Other',w,h,'indexed');other.pixels=new Uint32Array(Array.from({length:49},(_,i)=>kind==='multiple'?(i%8===1?19:0):77));model.setLayerStorageOrigin(other,{x:5,y:-3});
  if(kind.startsWith('background')){if(kind==='background-target')layer.background={mode:'canvas'};else other.background={mode:'canvas'};}
  if(kind==='background-above')d.layers.push(other);else d.layers.unshift(other);
  anim.syncActiveAnimationFrame(d);
  const mask=kind==='mask'?model.createLayerMask(layer.id,w,h):null;
  if(mask){for(let i=0;i<49;i++){const value=i%8===0?0xff000000:0xffffffff;for(let b=0;b<4;b++)mask.pixels[i*4+b]=(value>>>(b*8))&255;}d.animation.layerMasks.push({layerId:layer.id,frameId:d.animation.activeFrameId,mask});}
  const options={color:null,opacity:[50,0,100][variant],interior:variant===2,colorSource:source};
  const selection=variant===2?{x:0,y:0,width:7,height:7,mask:new Uint8Array(Array.from({length:49},(_,i)=>i%11===0?2:1))}:null;
  const session={document:d,selection,selectedLayerIds:kind==='multiple'?[other.id,layer.id]:[layer.id],layerSelectionExplicit:true,selectedGroupIds:[],selectedGroupId:null,selectedAnimationFrameIds:[],selectedAnimationCellKeys:[],selectedAnimationMaskCellKeys:[],activeLayerMaskId:mask?.id??null,revision:0,contentRevision:0};
  const state={sessions:[session],activeId:d.id};const commands=createSelectionAntiAliasCommands({get:()=>state,set:()=>{},recording:{recordDocumentOperation:()=>{}}});
  const target=mask??layer;
  const snap=t=>t.format==='indexed'?snapshot(t):({...snapshot(t),pixels:Array.from({length:t.width*t.height},(_,i)=>(t.pixels[i*4]|t.pixels[i*4+1]<<8|t.pixels[i*4+2]<<16|t.pixels[i*4+3]<<24)>>>0)});
  const before=snap(target),otherBefore=snap(other),preview=commands.previewAntiAliasSelection(null,options.opacity,options.interior,['automatic','canvas','palette'][source]);
  const expected=snap(target),otherExpected=snap(other);
  const again=commands.previewAntiAliasSelection(null,options.opacity,options.interior,['automatic','canvas','palette'][source],preview);
  if(JSON.stringify(snap(target))!==JSON.stringify(expected)||JSON.stringify(snap(other))!==JSON.stringify(otherExpected))throw Error('scene repeated preview');
  commands.restoreAntiAliasPreview(again);
  scenes.push({name:`${kind}-${source}-${variant}`,kind,w,h,initial,otherInitial:Array.from(otherBefore.pixels),maskInitial:mask?before.pixels:null,entries:base.map(e=>({...e,name:String(e.id)})),order:[...d.paletteOrder],options,selection:selection?{...selection,mask:Array.from(selection.mask)}:null,produced:!!preview,expected,otherExpected});
 }
 // Both point replay and dense-region replay must use the actual PixelEdit
 // implementation after changing the currently visible palette order.
 const histories=[];
 for(const size of [7,67]){
  const d=model.createDocument('AA history',size,size,'indexed',false),l=d.layers[0];
  d.palette=base.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=base.map(e=>e.id);d.nextColorId=100;
  const initial=Array.from({length:size*size},(_,i)=>{const x=i%size,y=Math.floor(i/size);return x%4===y%4?7:0;});l.pixels=new Uint32Array(initial);model.setLayerStorageOrigin(l,{x:5,y:-3});anim.syncActiveAnimationLayer(d,l.id);
  const options={color:0xff17a352,opacity:100,interior:false,colorSource:0};
  const edit=antiAliasSelection(d,l,null,unpackColor(options.color),100,false,'automatic');
  const entry=edit&&history.commitPixelEdit(d,edit,'AA',true);if(!entry)throw Error('history case must edit');
  const committed=history.getCommittedPixelChanges(entry),dense=committed.regionPatches.length>0;
  if(dense!==(size===67))throw Error('history representation coverage');
  const expected=snapshot(l),replayOrder=[77,19];d.paletteOrder=replayOrder;entry.undo();const undo=snapshot(l);entry.redo();const redo=snapshot(l);
  histories.push({name:`history-${size}`,w:size,h:size,initial,entries:base.map(e=>({...e,name:String(e.id)})),order:base.map(e=>e.id),options,selection:null,produced:true,expected,undo,redo,replayOrder,dense});
 }
 fs.writeFileSync(out,JSON.stringify({cases,alteredCancels,scenes,histories}));console.log(cases.length+' actual legacy AA results/history/cancel; '+alteredCancels+' cancels remap hidden IDs; '+scenes.length+' actual command scene previews; '+histories.length+' palette-change history cases');
})().catch(e=>{console.error(e);process.exitCode=1;});
