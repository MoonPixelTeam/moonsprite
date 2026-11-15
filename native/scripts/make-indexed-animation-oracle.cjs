// Uses actual legacy selection/clipboard/history functions via Node's TypeScript loader.
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
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src',p)));
 const model=await imp('core/document-model.ts'), history=await imp('core/history.ts');
 const {packColor,unpackColor}=await imp('core/raster.ts');
 const conversion=await imp('store/workspace-animation-cel-conversion.ts');
 const {captureSelectionTransform}=await imp('core/tools-selection-transform-source.ts');
 const {applySelectionTransform,moveSelection}=await imp('core/tools-selection-transform-apply.ts');
 const {applySelectionTranslationPreview,selectionTranslationPreviewEdit}=await imp('core/tools-selection-transform-translation.ts');
 const {selectionContains}=await imp('core/selection.ts');
 const animation=await imp('core/animation.ts');
 const {pasteCelSelection}=await imp('store/workspace-paste-cel-selection.ts');
 const baseEntries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x4000ff00},{id:65,color:0xff800080},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const palettes=['normal','opaque-zero','duplicate','transparent-first','transparent-last','empty'];
 const entriesFor=kind=>{const e=baseEntries.map(e=>({...e}));if(kind==='empty')return [];if(kind==='opaque-zero')e[0].color=0xff0000ff;if(kind==='duplicate')e.push({id:7,color:0xff00ff00});if(kind==='transparent-first'){e.find(v=>v.id===7).color=0x00123456;e.push({id:7,color:0xff00ff00});}if(kind==='transparent-last')e.push({id:7,color:0x00123456});return e;};
 const setup=(mode,entries,order,w=8,h=6)=>{const d=model.createDocument('animation oracle',w,h,mode,false);d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=order;return d;};
 const surface=s=>({width:s.width,height:s.height,x:s.offsetX,y:s.offsetY,format:s.format,pixels:Array.from(s.format==='indexed'?s.pixels:new Uint32Array(s.pixels.buffer,s.pixels.byteOffset,s.pixels.byteLength/4))});
 const layerSnapshot=l=>({width:l.width,height:l.height,x:l.offsetX,y:l.offsetY,originX:model.getLayerStorageOrigin(l).x,originY:model.getLayerStorageOrigin(l).y,pixels:Array.from(l.format==='indexed'?l.pixels:new Uint32Array(l.pixels.buffer,l.pixels.byteOffset,l.pixels.byteLength/4))});
 const conversionCases=[],centers=[],selections=[],multiSelections=[];
 for(const palette of palettes)for(const sourceMode of ['indexed','rgba'])for(const targetMode of ['indexed','rgba','grayscale'])for(const emptyOrder of [false,true]){
  const entries=entriesFor(palette),order=emptyOrder?[]:[19,7,41,53,65,77,99],d=setup(sourceMode,entries,order);
  const initial=sourceMode==='indexed'?[0,7,19,30,41,99,53,65,404,77,7,0]:[0,0xff0000ff,0xffff0000,0x00123456,0x800000ff,0x4000ff00,0xffffffff,0xff800080,0xff123456,0x01090807,0,0xff00ff00];
  const cel={id:'source',layerId:d.layers[0].id,frameId:d.animation.activeFrameId,opacity:0.6,zIndex:3,linkedCelId:null,surface:{format:sourceMode==='indexed'?'indexed':'rgba',width:4,height:3,offsetX:-1,offsetY:1,pixels:sourceMode==='indexed'?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer)}};
  const portable=conversion.animationCelClipboardSnapshot(d,cel);
  const targetEntries=entriesFor(palette==='empty'?'empty':'normal'),targetOrder=emptyOrder?[]:[77,19,7,53,41,65],target=setup(targetMode,targetEntries,targetOrder),result=conversion.animationCelForTarget(target,target.layers[0],portable);
  conversionCases.push({name:`${palette}-${sourceMode}-${targetMode}-${emptyOrder}`,entries,order,sourceMode,targetMode,targetEntries,targetOrder,initial,portable:surface(portable.surface),target:surface(result.surface)});
  for(const masked of [false,true]){
   const selection={x:0,y:1,width:3,height:2,...(masked?{mask:new Uint8Array([1,0,1,0,1,1])}:{})};
   const clipped=conversion.clipAnimationCelToSelection(cel,selection),copied=conversion.animationCelClipboardSnapshot(d,clipped),converted=conversion.animationCelForTarget(target,target.layers[0],copied),s=converted.surface;
   const l=target.layers[0];const beforeValue=targetMode==='indexed'?19:targetMode==='grayscale'?0xff353535:0xff202060;const targetWords=new Uint32Array(48).fill(beforeValue);l.pixels=targetMode==='indexed'?targetWords:new Uint8ClampedArray(targetWords.buffer);model.setLayerStorageOrigin(l,{x:5,y:-3});
   const values=new Uint32Array(s.width*s.height),mask=new Uint8Array(values.length);
   for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const i=y*s.width+x;const value=s.format==='indexed'?s.pixels[i]:new Uint32Array(s.pixels.buffer)[i];values[i]=value;mask[i]=(s.format==='indexed'?(target.palette.find(e=>e.id===value)?.color.a??0):(value>>>24))>0?1:0;}
   const source={selection:{x:s.offsetX,y:s.offsetY,width:s.width,height:s.height,mask},values,selectedOffsets:new Uint32Array(0),opaqueOffsets:new Uint32Array(0),opaqueIndices:new Uint32Array(0),opaqueValues:new Uint32Array(0),origin:'clipboard'};
   const edit=applySelectionTransform(target,source,{x:s.offsetX,y:s.offsetY,width:s.width,height:s.height},0,true,undefined,undefined,undefined,l);
   const after=layerSnapshot(l),entry=edit&&history.commitPixelEdit(target,edit,'paste selection');
   if(entry)entry.undo();const undo=layerSnapshot(l);if(entry)entry.redo();const redo=layerSnapshot(l);
   selections.push({name:`selection-${palette}-${sourceMode}-${targetMode}-${emptyOrder}-${masked}`,entries,order,sourceMode,targetMode,targetEntries,targetOrder,initial,selection:{...selection,mask:selection.mask?Array.from(selection.mask):null},portable:surface(copied.surface),target:surface(s),beforeValue,after,undo,redo,changed:!!entry});
  }
 }
 for(const palette of palettes)for(const layout of ['dense','sparse','negative','offcanvas','empty'])for(const selectionKind of ['none','rect','mask','outside'])for(const axis of ['horizontal','vertical','both']){
  const entries=entriesFor(palette),order=[19,7,41,53,65,77],d=setup('indexed',entries,order),l=d.layers[0];
  l.width=layout==='dense'?8:4;l.height=layout==='dense'?6:3;l.offsetX=layout==='negative'?-2:layout==='offcanvas'?-8:layout==='dense'?0:1;l.offsetY=layout==='negative'?-1:layout==='dense'?0:1;
  l.pixels=new Uint32Array(Array.from({length:l.width*l.height},(_,i)=>layout==='empty'?0:[7,0,41,99,19,53,404,65][i%8]));model.setLayerStorageOrigin(l,{x:5,y:-3});
  const selected=selectionKind==='none'?null:selectionKind==='outside'?{x:-2,y:-1,width:5,height:4}:{x:0,y:1,width:5,height:3,...(selectionKind==='mask'?{mask:new Uint8Array([1,0,1,1,0,1,1,0,1,0,1,0,1,0,1])}:{})};
  const bounds=selected??model.layerContentBounds(d,l),initial=layerSnapshot(l);let entry=null,dx=0,dy=0;
  if(bounds){dx=axis==='vertical'?0:Math.round(4-(bounds.x+bounds.width/2));dy=axis==='horizontal'?0:Math.round(3-(bounds.y+bounds.height/2));const src=selected?captureSelectionTransform(d,bounds,l,{preserveOutsideCanvas:true}):null;const target={...bounds,x:bounds.x+dx,y:bounds.y+dy};const edit=src?applySelectionTransform(d,src,target,0,false,undefined,undefined,undefined,l):moveSelection(d,bounds,dx,dy,false,l);entry=edit&&history.commitPixelEdit(d,edit,'center');}
  const after=layerSnapshot(l);if(entry)entry.undo();const undo=layerSnapshot(l);if(entry)entry.redo();const redo=layerSnapshot(l);
  centers.push({name:`center-${palette}-${layout}-${selectionKind}-${axis}`,entries,order,initial,selection:selected?{...selected,mask:selected.mask?Array.from(selected.mask):null}:null,axis,dx,dy,changed:!!entry,after,undo,redo});
 }
 // Execute the real multi-Cel paste entry: each cropped surface occupies only
 // part of the common bounds. Opaque ID0 must not turn union padding into paint.
 for(const targetMode of ['indexed','rgba','grayscale'])for(const linked of [false,true])for(const append of [false,true]){
  const entries=entriesFor('opaque-zero'),order=[0,19,7,41,53,65,77];
  const target=setup(targetMode,entries,order),tl=animation.ensureAnimationDocument(target),layer=target.layers[0],first=tl.activeFrameId;
  const second=animation.addBlankAnimationFrame(target);tl.activeFrameId=first;
  const initialValue=targetMode==='indexed'?19:targetMode==='grayscale'?0xff353535:0xff202060;
  for(const frame of tl.frames){const cel=animation.animationCelAt(tl,layer.id,frame.id);cel.surface={format:targetMode==='indexed'?'indexed':'rgba',width:8,height:6,offsetX:0,offsetY:0,pixels:targetMode==='indexed'?new Uint32Array(48).fill(initialValue):new Uint8ClampedArray(new Uint32Array(48).fill(initialValue).buffer)};}
  animation.refreshActiveAnimationFrame(target);
  if(linked)animation.connectAnimationCels(target,tl.cels.map(c=>c.id));
  tl.activeFrameId=append?second:first;animation.refreshActiveAnimationFrame(target);
  const input=[{width:1,height:2,x:1,y:1,pixels:[0xff00ff00,0xff0000ff]},{width:2,height:1,x:4,y:3,pixels:[0xffff0000,0x800000ff]}];
  const snapshot={selectionOnly:true,sourceDocumentId:'other',anchorLayerIndex:0,anchorFrameIndex:0,items:input.map((s,i)=>({layerIndex:0,frameIndex:i,cel:{id:'source-'+i,layerId:'source-layer',frameId:'source-frame-'+i,opacity:1,surface:{format:'rgba',width:s.width,height:s.height,offsetX:s.x,offsetY:s.y,pixels:new Uint8ClampedArray(new Uint32Array(s.pixels).buffer)}}}))};
  const session={document:target,selectedAnimationCellKeys:[],selection:null,selectionPivot:null,revision:0,contentRevision:0};
  pasteCelSelection(session,snapshot);
  const sources=session.pendingPaste.layers.map(s=>({frameIndex:tl.frames.findIndex(f=>f.id===s.frameId),pixels:Array.from(s.source.values),mask:Array.from(s.source.selection.mask)}));
  const after=tl.frames.map(f=>surface(animation.animationCelAt(tl,layer.id,f.id).surface));
  multiSelections.push({name:`multi-${targetMode}-${linked}-${append}`,targetMode,targetEntries:entries,targetOrder:order,linked,append,input,sources,after});
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({conversions:conversionCases,selections,centers,multiSelections}));console.log(`${conversionCases.length} actual legacy Cel conversions, ${selections.length} selection pastes, ${centers.length} center transactions, ${multiSelections.length} multi-Cel pastes generated`);
})().catch(error=>{console.error(error);process.exitCode=1;});
