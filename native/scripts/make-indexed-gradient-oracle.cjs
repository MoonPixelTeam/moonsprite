// Uses actual legacy gradient/preview/history functions via Node's TypeScript loader.
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
 const model=await imp('document-model.ts'),history=await imp('history.ts');
 const gradient=await imp('gradient.ts'),{packColor,unpackColor}=await imp('raster.ts');
 const {gradientReplacementColor}=await imp('gradient-preview.ts');
 const {createGradientReplacementSampler}=await imp('gradient-preview-sampling.ts');
 const {createCompositePointSampler}=await imp('document-composite-sampling.ts');
 const {shareLinkedRasterContent}=await imp('linked-layers.ts');
 const {selectionContains}=await imp('selection.ts');
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77,89],[],[77,53,41,7,19]];
 const cases=[];
 function run(spec){
  const {w=8,h=6,sw=w,sh=h,ox=0,oy=0,palette=0,first=0xff0000ff,last=0xffff0000,tolerance=0,contiguous=true,connectivity=4,selection=null,seed=[1,2],visible=false,layout='mixed',absent=false,dither=0,radial=false,stops=[],special='normal'}=spec;
  const paletteEntries=entries.map(e=>({...e}));if(special==='duplicate')paletteEntries.push({id:7,color:0xff00ff00});if(special==='opaque-zero')paletteEntries[0].color=0xff0000ff;if(special==='hidden-rgb')paletteEntries.push({id:99,color:0x00123456});
  const d=model.createDocument('indexed gradient',w,h,'indexed',false),l=d.layers[0];d.palette=paletteEntries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;
  l.pixels=new Uint32Array(Array.from({length:sw*sh},(_,i)=>layout==='uniform'?41:layout==='zero'?0:layout==='one'?7:layout==='unknown'?99:[0,7,19,30,41,99][(i%sw+Math.floor(i/sw))%6]));
  model.setLayerStorageOrigin(l,{x:5,y:-3});
  // Layer ordering follows the existing fill oracle's bottom-first reference.
  if(visible){const top=model.createLayer('visible',w,h,'indexed');top.pixels=new Uint32Array(Array.from({length:w*h},(_,i)=>i%w===3?7:0));d.layers.unshift(top);}
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0),before=canvas();
  const peer=model.createLayer('linked gradient',sw,sh,'indexed');peer.offsetX=ox;peer.offsetY=oy;model.setLayerStorageOrigin(peer,{x:5,y:-3});shareLinkedRasterContent(peer,l);
  const geometry=()=>{const origin=model.getLayerStorageOrigin(l);return {width:l.width,height:l.height,x:l.offsetX,y:l.offsetY,originX:origin.x,originY:origin.y};};
  const linkedGeometry=()=>{shareLinkedRasterContent(peer,l);const origin=model.getLayerStorageOrigin(peer);return {width:peer.width,height:peer.height,x:peer.offsetX,y:peer.offsetY,originX:origin.x,originY:origin.y};};
  const select=selection?{...selection,mask:selection.mask?new Uint8Array(selection.mask):undefined}:null;
  const start={x:seed[0],y:seed[1]},end={x:w-1,y:h-1};
  const gradientStops=stops.length?stops.map(s=>({position:s.position,color:unpackColor(s.color)})):undefined;
  const updates=[{tolerance:0,contiguous:true,connectivity:4,visible:false,first:0x00123456,last:0x00000000,dither:0,radial:false,stops:[]},{tolerance,contiguous,connectivity,visible,first,last,dither,radial,stops}];
  const previews=[],regions=[];
  for(const update of updates){
   const options={connectivity:update.connectivity,sourceColorAt:update.visible?createCompositePointSampler(d):undefined};
   const region=gradient.gradientRegionSelection(d,l,start,update.tolerance,update.contiguous,options);regions.push(region?Array.from({length:w*h},(_,i)=>selectionContains(region,i%w,Math.floor(i/w))?1:0):[]);
   const sample=gradient.createGradientColorSampler(unpackColor(update.first),unpackColor(update.last),start,end,gradient.GRADIENT_DITHER_PRESETS[update.dither],update.radial?'radial':'linear',{},update.stops.length?update.stops.map(s=>({position:s.position,color:unpackColor(s.color)})):undefined);
   const display=Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w),index=model.layerIndexAt(l,x,y);return index===null?0:packColor(d.palette.reduce((found,e)=>e.id===l.pixels[index]?e:found,{color:unpackColor(0)}).color);});
   // Run actual canvas-render-gradient writeSample helpers before applying edits.
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(region&&selectionContains(region,x,y)&&(!select||selectionContains(select,x,y))){const source=sample(x,y),current=absent?unpackColor(0):model.readLayerColorAt(d,l,x,y);display[y*w+x]=packColor(model.resolveLayerCanvasColor(d,l,gradientReplacementColor(current,source)));}
   previews.push(display);
  }
  const options={connectivity,sourceColorAt:visible?createCompositePointSampler(d):undefined};
  const region=gradient.gradientRegionSelection(d,l,start,tolerance,contiguous,options);
  const edit=gradient.applyGradient(d,l,start,end,unpackColor(first),unpackColor(last),select,gradient.GRADIENT_DITHER_PRESETS[dither],region,radial?'radial':'linear',{},gradientStops);
  const after=canvas(),afterGeometry=geometry(),linkedAfter=linkedGeometry(),entry=edit?history.commitPixelEdit(d,edit,'gradient'):null;entry?.undo();const undo=canvas(),undoGeometry=geometry(),linkedUndo=linkedGeometry();entry?.redo();const redo=canvas(),redoGeometry=geometry(),linkedRedo=linkedGeometry();
  cases.push({name:spec.name??`gradient-${cases.length}`,w,h,sw,sh,ox,oy,entries:paletteEntries,order:orders[palette],initial,before,first,last,tolerance,contiguous,connectivity,selection,seed,visible,absent,dither,radial,stops,previews,regions,after,undo,redo,afterGeometry,undoGeometry,redoGeometry,linkedAfter,linkedUndo,linkedRedo,changed:!!entry,dense:!!edit?.denseRegion});
 }
 const sources=[[0xff0000ff,0xffff0000],[0x800000ff,0x4000ff00],[0,0x00123456],[0x010000ff,0x80ff0000]];
 for(let palette=0;palette<4;palette++)for(const [first,last] of sources)for(const tolerance of [0,1,128,255])for(const contiguous of [true,false])for(const connectivity of [4,8])run({palette,first,last,tolerance,contiguous,connectivity});
 for(const kind of ['cropped','negative','placeholder-zero','placeholder-nonzero','absent'])for(let palette=0;palette<4;palette++)for(const [first,last] of sources)for(const visible of [false,true]){const placeholder=kind.startsWith('placeholder');run({name:`${kind}-${cases.length}`,sw:kind==='absent'?8:placeholder?1:4,sh:kind==='absent'?6:placeholder?1:3,ox:kind==='negative'?-2:kind==='absent'?0:2,oy:kind==='negative'?-1:kind==='absent'?0:1,palette,first,last,tolerance:1,absent:kind==='absent',layout:kind==='absent'||kind==='placeholder-zero'?'zero':kind==='placeholder-nonzero'?'one':'mixed',visible});}
 for(const masked of [false,true])for(const [first,last] of sources)for(let dither=0;dither<9;dither++)for(const radial of [false,true])run({first,last,dither,radial,tolerance:255,selection:{x:1,y:1,width:6,height:4,...(masked?{mask:Array.from({length:24},(_,i)=>i%5?1:0)}:{})}});
 for(const special of ['duplicate','opaque-zero','hidden-rgb'])for(const shape of ['full','sparse','zero'])for(const [first,last] of sources)run({name:`${special}-${shape}-${cases.length}`,special,first,last,tolerance:255,sw:shape==='full'?8:shape==='zero'?1:4,sh:shape==='full'?6:shape==='zero'?1:3,ox:shape==='full'?0:2,oy:shape==='full'?0:1,layout:shape==='zero'?'zero':'mixed'});
 for(const special of ['normal','duplicate'])for(let dither=0;dither<9;dither++)run({special,dither,radial:dither%2===1,tolerance:255,stops:[{position:0,color:0x00123456},{position:.3,color:0x800000ff},{position:.3,color:0xffff0000},{position:1,color:0xffffffff}]});
 for(const layout of ['uniform','unknown','zero'])for(const masked of [false,true])run({name:`dense-${layout}-${masked}`,w:512,h:512,layout,first:layout==='unknown'?0:0xff0000ff,last:layout==='unknown'?0:0xffff0000,tolerance:255,seed:[256,256],selection:masked?{x:0,y:0,width:512,height:512,mask:Array.from({length:512*512},(_,i)=>i%7?1:0)}:null});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy indexed gradient transactions and two previews per transaction`);
})().catch(error=>{console.error(error);process.exitCode=1;});
