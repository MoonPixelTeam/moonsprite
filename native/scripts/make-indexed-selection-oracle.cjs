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
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts'),history=await imp('history.ts'),capture=await imp('tools-selection-transform-source.ts'),apply=await imp('tools-selection-transform-apply.ts'),translation=await imp('tools-selection-transform-translation.ts'),fill=await imp('tools-fill.ts');
 const {packColor,unpackColor}=await imp('raster.ts'),{selectionContains}=await imp('selection.ts'),{clampSelection}=await imp('tools-pixel-edit.ts');
 const composite=await imp('document-composite-region.ts');
 const raster=await imp('tools-selection-transform-raster.ts');
 const {floatingSelectionClipboard}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/workspace-floating-clipboard.ts')));
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x4000ff00},{id:65,color:0xff800080},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77],[],[77,53,41,7,19]];
 const cases=[];
 function run(spec={}){
  const {kind='move',layout='dense',palette=0,masked=false,copy=false,deferred=false,transform='translation',repeat='off',special='normal'}=spec;
  const w=spec.w??8,h=spec.h??6,sw=layout==='dense'?w:layout==='empty'||layout==='one'?1:4,sh=layout==='dense'?h:layout==='empty'||layout==='one'?1:3,ox=layout==='negative'?-1:layout==='dense'?0:2,oy=layout==='negative'?-1:layout==='dense'?0:1;
  const pe=entries.map(e=>({...e}));if(special==='opaque-zero')pe[0].color=0xff0000ff;if(special==='duplicate')pe.push({id:7,color:0xff00ff00});if(special==='transparent-first'){pe.find(e=>e.id===7).color=0x00123456;pe.push({id:7,color:0xff00ff00});}if(special==='transparent-last')pe.push({id:7,color:0x00123456});
  const d=model.createDocument('indexed selection',w,h,'indexed',false),l=d.layers[0];d.palette=pe.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;l.pixels=new Uint32Array(Array.from({length:sw*sh},(_,i)=>layout==='empty'?0:layout==='one'?7:spec.blank?0:[0,7,19,30,41,99,53,65][i%8]));model.setLayerStorageOrigin(l,{x:5,y:-3});
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0),display=()=>canvas().map(v=>pe.reduce((found,e)=>e.id===v?e:found,{color:0}).color);
  const selection={x:1,y:1,width:4,height:3,...spec.selection,...(masked?{mask:new Uint8Array([1,0,1,1,0,1,1,0,1,1,0,1])}:{})};
  const snapshot=()=>({pixels:canvas(),display:display(),geometry:{width:l.width,height:l.height,x:l.offsetX,y:l.offsetY,originX:model.getLayerStorageOrigin(l).x,originY:model.getLayerStorageOrigin(l).y}});
  const before=snapshot(),initialEntries=pe.map(e=>({...e}));
  const directCopy=()=>{
   const box=clampSelection(d,selection);if(!box)return null;const pixels=new Array(box.width*box.height).fill(0),mask=new Array(pixels.length).fill(0);let any=false;
   for(let y=0;y<box.height;y++)for(let x=0;x<box.width;x++){if(!selectionContains(selection,box.x+x,box.y+y))continue;const color=model.readLayerColorAt(d,l,box.x+x,box.y+y);if(!color.a)continue;const i=y*box.width+x;pixels[i]=packColor(color);mask[i]=1;any=true;}
   return any?{...box,originX:box.x,originY:box.y,pixels,mask}:null;
  };
  const copied=directCopy();
  const mergedBytes=composite.compositeRegion(d,selection.x,selection.y,selection.width,selection.height);const mergedPixels=[],mergedMask=[];for(let i=0;i<selection.width*selection.height;i++){const p=packColor({r:mergedBytes[i*4],g:mergedBytes[i*4+1],b:mergedBytes[i*4+2],a:mergedBytes[i*4+3]});const include=selectionContains(selection,selection.x+i%selection.width,selection.y+Math.floor(i/selection.width))&&(p>>>24)!==0;mergedPixels.push(include?p:0);mergedMask.push(include?1:0);}const merged=mergedMask.some(Boolean)?{width:selection.width,height:selection.height,originX:selection.x,originY:selection.y,pixels:mergedPixels,mask:mergedMask}:null;
  let source,target,edit=null,preview=null,clip=null;const angle=transform==='rotation'||transform==='rotsprite'?37:transform==='orthogonal'||transform==='rotsprite90'?90:0,opt=transform.startsWith('rotsprite');
  const sourceSelected={...selection,mask:selection.mask?.slice()};
  if(kind==='paste'){
   clip={width:3,height:2,pixels:[0x800000ff,0xff00ff00,0,0xffff0000,0xffffffff,0x00123456],mask:[1,1,1,1,0,1]};
   const values=new Uint32Array(clip.pixels.map((p,i)=>clip.mask[i]===1?model.paletteColorIdForCanvas(d,unpackColor(p)):0));
   source={selection:{x:0,y:1,width:3,height:2,mask:new Uint8Array(clip.mask)},values,selectedOffsets:new Uint32Array(0),opaqueOffsets:new Uint32Array(0),opaqueIndices:new Uint32Array(0),opaqueValues:new Uint32Array(0),origin:'clipboard'};
  }else source=capture.captureSelectionTransform(d,sourceSelected,l,{preserveOutsideCanvas:true,cacheOpaqueOffsets:!deferred});
  const transformed=()=>{
   const t={x:3,y:2,width:source.selection.width,height:source.selection.height};
   if(transform==='scale'){t.width=5;t.height=4;}
   if(transform==='flip')t.flipHorizontal=true;
   return t;
  };
  target=source?transformed():null;
  const updatedEntries=spec.paletteUpdate?pe.map(e=>({...e,color:e.id===7?0x00123456:e.id===99?0xffffffff:e.color})):null;
  if(updatedEntries){raster.selectionTransformCells(d,source,target,angle,undefined,l,undefined,false,opt);pe.splice(0,pe.length,...updatedEntries);d.palette=pe.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));}
  let live=null,floatingCopy=null;
  if(kind==='delete'||kind==='cut')edit=fill.clearSelection(d,selection,l);
  else if(kind==='flip')edit=apply.flipSelection(d,selection,'horizontal',l);
  else if(kind==='rotate')edit=apply.applySelectionTransform(d,source,{...selection},90,false,undefined,undefined,undefined,l);
  else {
   const isTranslation=transform==='translation'||transform==='rotsprite0';
   if(deferred){edit=isTranslation?translation.applySelectionTranslationCommit(d,source,target,kind==='paste'||copy,l,repeat):apply.applySelectionTransform(d,source,target,angle,kind==='paste'||copy,undefined,undefined,undefined,l,undefined,undefined,false,opt);}
   else if(isTranslation){preview=translation.applySelectionTranslationPreview(d,source,target,kind==='paste'||copy,null,l,undefined,repeat);edit=translation.selectionTranslationPreviewEdit(d,preview);}
   else edit=apply.applySelectionTransform(d,source,target,angle,kind==='paste'||copy,undefined,undefined,undefined,l,undefined,undefined,false,opt);
   live=snapshot();
   const bounds=awaitlessSelection.transformedSelectionBounds(target,angle);
   const actual=floatingSelectionClipboard({document:d,pendingPaste:{source,layerId:l.id,target:bounds,transformTarget:target,transformAngle:angle},selectionRotationAlgorithm:opt?'rotsprite':'fast'});
   floatingCopy=actual?{...actual,pixels:Array.from(actual.pixels),mask:Array.from(actual.mask)}:null;
  }
  const after=snapshot(),entry=edit?history.commitPixelEdit(d,edit,'selection'):null;entry?.undo();const undo=snapshot();entry?.redo();const redo=snapshot();
  cases.push({blank:!!spec.blank,updatedEntries,merged,name:`selection-${cases.length}`,kind,layout,palette,masked,copy,deferred,transform,repeat,special,w,h,sw,sh,ox,oy,entries:initialEntries,order:orders[palette],initial,selection:{...selection,mask:selection.mask?Array.from(selection.mask):null},clip,target,angle,opt,before,copied,live,floatingCopy,after,undo,redo,changed:!!entry});
 }
 const awaitlessSelection=await imp('selection.ts');
 for(const layout of ['dense','sparse','negative','empty','one'])for(const palette of [0,1,2,3])for(const masked of [false,true])for(const kind of ['move','paste','delete','cut','flip','rotate']){
  run({layout,palette,masked,kind});
  if(kind==='move'||kind==='paste')for(const transform of ['scale','rotation','rotsprite','flip','orthogonal'])run({layout,palette,masked,kind,transform});
 }
 for(const deferred of [false,true])for(const copy of [false,true])for(const repeat of ['off','both'])for(const special of ['normal','opaque-zero','duplicate'])run({deferred,copy,repeat,special});
 for(const layout of ['dense','sparse','negative'])for(const special of ['opaque-zero','transparent-first','transparent-last'])for(const deferred of [false,true])for(const kind of ['move','paste'])for(const transform of ['translation','scale','rotation','rotsprite','rotsprite0','rotsprite90'])run({layout,special,deferred,kind,transform});
 for(const kind of ['move','paste'])for(const transform of ['translation','scale','rotation','rotsprite'])run({kind,transform,w:300,h:230,deferred:true,layout:'sparse',palette:1,masked:true});
 for(const layout of ['dense','sparse'])for(const deferred of [false,true])for(const copy of [false,true])for(const transform of ['translation','rotation','rotsprite'])run({layout,deferred,copy,transform,paletteUpdate:true});
 for(const kind of ['move','paste','flip','rotate'])for(const deferred of [false,true])for(const transform of ['translation','rotation'])run({kind,deferred,transform,w:40,h:32,selection:{x:1,y:1,width:25,height:20}});
 for(const transform of ['translation','scale','rotsprite'])run({kind:'paste',blank:true,transform});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy indexed selection transactions generated`);
})().catch(error=>{console.error(error);process.exitCode=1;});
