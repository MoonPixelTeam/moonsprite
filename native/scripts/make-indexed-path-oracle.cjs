// Uses actual legacy shape/preview/history functions via Node's TypeScript loader.
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
 const model=await imp('document-model.ts'),history=await imp('history.ts'),shapes=await imp('tools-shapes.ts'),brushes=await imp('tools-brush.ts');
 const {packColor,unpackColor,blendOver}=await imp('raster.ts'),{resolveInkStampColor,applyInkColor}=await imp('ink.ts');
 const {symmetryPoints}=await imp('symmetry.ts'),{selectionContains}=await imp('selection.ts'),{shareLinkedRasterContent}=await imp('linked-layers.ts');
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77,89],[],[77,53,41,7,19]],inks=['simple','copy-alpha-color','lock-alpha'];
 const variants=[{name:'solid',size:1,shape:'square'},{name:'round',size:4,shape:'round'},{name:'square',size:5,shape:'square'},{name:'line',size:5,shape:'line'},{name:'mask',size:1,shape:'square',width:2,height:2,intrinsicSize:true,coverage:[64,255,128,0]},{name:'colored',size:1,shape:'square',width:2,height:2,intrinsicSize:true,coverage:[255,255,255,255],colors:[0x800000ff,0xff00ff00,0xff0000ff,0x400000ff]},{name:'scaled',size:4,shape:'square',width:1,height:1,intrinsicSize:false,coverage:[255],colors:[0x800000ff]}];
 const cases=[];
 function run(spec={}){
  const {w=12,h=10,sw=w,sh=h,ox=0,oy=0,palette=0,color=0x800000ff,kind='line',variant=variants[0],opacity=35,ink=0,angle=0,symmetric=0,selection=null,absent=false,layout='mixed',special='normal',balanced=false,perfect=false,mode='paint',repeat='off',dither=false}=spec;
  const pe=entries.map(e=>({...e}));if(special==='duplicate')pe.push({id:7,color:0xff00ff00});if(special==='opaque-zero')pe[0].color=0xff0000ff;if(special==='hidden-rgb')pe.push({id:99,color:0x00123456});
  const d=model.createDocument('indexed path',w,h,'indexed',false),l=d.layers[0];d.palette=pe.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;l.pixels=new Uint32Array(Array.from({length:sw*sh},(_,i)=>layout==='zero'?0:layout==='one'?7:[0,7,19,30,41,99][i%6]));model.setLayerStorageOrigin(l,{x:5,y:-3});
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0),before=canvas();
  const peer=model.createLayer('linked',sw,sh,'indexed');peer.offsetX=ox;peer.offsetY=oy;model.setLayerStorageOrigin(peer,{x:5,y:-3});shareLinkedRasterContent(peer,l);
  const geometry=()=>{const o=model.getLayerStorageOrigin(l);return {width:l.width,height:l.height,x:l.offsetX,y:l.offsetY,originX:o.x,originY:o.y};};
  const linkedGeometry=()=>{shareLinkedRasterContent(peer,l);const o=model.getLayerStorageOrigin(peer);return {width:peer.width,height:peer.height,x:peer.offsetX,y:peer.offsetY,originX:o.x,originY:o.y};};
  const start=spec.start??{x:1,y:2},end=spec.end??{x:9,y:7},controls=spec.controls??[{x:3,y:-2},{x:8,y:10}];
  let points=kind==='curve'?shapes.bezierCurvePixelPoints(start,controls,end):shapes.lineShapePixelPoints(start,end,balanced);if(perfect)points=shapes.perfectPixelPathPoints(points);
  const axes={horizontal:!!(symmetric&1),vertical:!!(symmetric&2),diagonalUp:!!(symmetric&4),diagonalDown:!!(symmetric&8),rotational:!!(symmetric&16)},center=spec.center??{x:w/2,y:h/2};
  const select=selection?{...selection,mask:selection.mask?new Uint8Array(selection.mask):undefined}:null;
  const image=variant.coverage?{...variant,id:'fixture',sourceX:2,sourceY:1,coverage:new Uint8Array(variant.coverage),colors:variant.colors?new Uint32Array(variant.colors):undefined}:null;
  const patternOrigin={x:points[0].x-Math.floor((image?.intrinsicSize?image.width:variant.size)/2),y:points[0].y-Math.floor((image?.intrinsicSize?image.height:variant.size)/2)};
  const brushDither=dither?{enabled:true,template:'bayer-4',stage:8}:undefined;
  const previews=[];
  for(const paint of [0x00123456,color]){
   const display=Array.from({length:w*h},(_,i)=>{const index=model.layerIndexAt(l,i%w,Math.floor(i/w));return absent||index===null?0:pe.reduce((found,e)=>e.id===l.pixels[index]?e:found,{color:0}).color;});
   const centers=brushes.brushPathStampPoints(points,variant.size,image,angle,variant.shape),anchor=brushes.brushStampAnchor(variant.size,image,angle,variant.shape),seen=new Set();
   const overwrite=image?.intrinsicSize===true&&mode==='paint';if(overwrite)centers.reverse();
   for(const p of centers)for(const sample of brushes.brushMaskOffsets(variant.size,variant.shape,'solid',1,p.x-anchor.x,p.y-anchor.y,image,undefined,0,mode,patternOrigin.x,patternOrigin.y,brushDither,angle,true))for(const q of symmetryPoints({x:p.x-anchor.x+sample.x,y:p.y-anchor.y+sample.y},w,h,axes,center)){
    if(select&&!selectionContains(select,q.x,q.y))continue;const i=q.y*w+q.x;if(seen.has(i))continue;seen.add(i);
    const base=model.readLayerColorAt(d,l,q.x,q.y),source=sample.color??unpackColor(paint),coverage=Math.round(sample.coverage*opacity/100),previewInk=kind==='curve'?'simple':inks[ink],stamp=resolveInkStampColor(previewInk,source,coverage);
    const replacement=previewInk!=='simple'?(applyInkColor(previewInk,base,stamp)??base):overwrite?stamp:coverage<255||(source.a>0&&source.a<255)?blendOver(base,stamp):source;
    display[i]=packColor(model.resolveLayerCanvasColor(d,l,replacement));
   }
   previews.push(display);
  }
  const edit=history.beginPixelEdit(l.id);brushes.paintBrushPath(d,l,edit,points,variant.size,unpackColor(color),select,variant.shape,'solid',1,image,undefined,0,mode,patternOrigin,axes,center,repeat,brushDither,true,angle,inks[ink]);
  const after=canvas(),afterGeometry=geometry(),linkedAfter=linkedGeometry(),entry=history.commitPixelEdit(d,edit,'path');entry?.undo();const undo=canvas(),undoGeometry=geometry(),linkedUndo=linkedGeometry();entry?.redo();const redo=canvas(),redoGeometry=geometry(),linkedRedo=linkedGeometry();
  cases.push({name:spec.name??`path-${cases.length}`,w,h,sw,sh,ox,oy,entries:pe,order:orders[palette],initial,before,color,kind,variant,opacity,ink,angle,symmetric,selection,center,absent,balanced,perfect,mode,repeat,dither,start,end,controls,points:points.map(p=>({x:p.x,y:p.y})),previews,after,undo,redo,afterGeometry,undoGeometry,redoGeometry,linkedAfter,linkedUndo,linkedRedo,changed:!!entry});
 }
 for(const kind of ['line','curve'])for(let palette=0;palette<4;palette++)for(const color of [0,0x00123456,0x800000ff,0xff0000ff])for(let ink=0;ink<3;ink++)for(const variant of variants)run({kind,palette,color,ink,variant});
 for(const kind of ['line','curve'])for(const variant of variants)for(const opacity of [0,100])for(const angle of [0,37,90])run({kind,variant,opacity,angle,ink:2,symmetric:3,perfect:true,balanced:true});
 for(const kind of ['line','curve'])for(const geometry of ['cropped','negative','placeholder-zero','placeholder-one','absent'])for(const special of ['normal','duplicate','opaque-zero','hidden-rgb'])for(const variant of [variants[0],variants[4],variants[5]])run({kind,variant,special,absent:geometry==='absent',sw:geometry==='absent'?12:geometry.startsWith('placeholder')?1:4,sh:geometry==='absent'?10:geometry.startsWith('placeholder')?1:3,ox:geometry==='absent'?0:geometry==='negative'?-2:3,oy:geometry==='absent'?0:geometry==='negative'?-1:2,layout:geometry==='placeholder-zero'||geometry==='absent'?'zero':geometry==='placeholder-one'?'one':'mixed',symmetric:15});
 for(const variant of variants)for(const mode of ['paint','pattern-source','pattern-target'])for(const ink of [0,1,2])for(const kind of ['line','curve'])run({kind,variant,mode,ink,angle:37,symmetric:16,center:{x:3,y:2.5},selection:{x:1,y:1,width:9,height:8,mask:Array.from({length:72},(_,i)=>i%5?1:0)}});
 for(const shape of ['square','round','line'])for(const angle of [0,30.5,90,135])for(const dither of [false,true])run({variant:{name:'rotated',size:7,shape},angle,dither,symmetric:15,start:{x:-3,y:-2},end:{x:10,y:7},center:{x:2.5,y:3}});
 for(const repeat of ['x','y','both'])for(const variant of [variants[1],variants[5]])run({variant,repeat,start:{x:9,y:7},end:{x:15,y:12},symmetric:3});
 for(const mode of ['paint','pattern-source','pattern-target'])for(const ink of [0,1,2])for(const kind of ['line','curve'])run({kind,mode,ink,variant:{name:'scaled-pattern',size:5,shape:'square',width:2,height:2,intrinsicSize:false,coverage:[255,255,255,255],colors:[0xff0000ff,0x800000ff,0xffff0000,0xff00ff00]},angle:37});
 for(const mode of ['paint','pattern-source','pattern-target'])for(const ink of [0,1,2])for(const kind of ['line','curve'])run({kind,mode,ink,variant:{name:'scaled-mask-pattern',size:5,shape:'square',width:2,height:2,intrinsicSize:false,coverage:[64,255,128,0]},angle:37});
 for(const area of [255,256,257,768])run({w:area,h:2,variant:{name:'dense',size:1,shape:'square'},start:{x:0,y:0},end:{x:area-1,y:0},color:0xff0000ff,palette:1});
 for(const variant of [variants[0],{name:'spacing',size:64,shape:'square'}])run({w:512,h:256,sw:2,sh:2,ox:200,oy:100,variant,start:{x:180,y:90},end:{x:215,y:105}});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy indexed line/curve transactions and two display previews`);
})().catch(error=>{console.error(error);process.exitCode=1;});
