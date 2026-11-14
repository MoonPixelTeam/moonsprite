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
 const model=await imp('document-model.ts'),history=await imp('history.ts'),shapes=await imp('tools-shapes.ts');
 const {packColor,unpackColor,blendOver}=await imp('raster.ts');
 const {unboundedShapePreview}=await imp('shape-preview.ts');
 const {symmetryPoints}=await imp('symmetry.ts');
 const {selectionContains}=await imp('selection.ts');
 const {polygonLassoPreviewPoints}=await imp('canvas-input-path.ts');
 const {shareLinkedRasterContent}=await imp('linked-layers.ts');
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77,89],[],[77,53,41,7,19]];
 const cases=[],legacyDefects=[],kinds=['rectangle','rectangle-outline','ellipse','ellipse-outline','polygon','freeform'];
 function run(spec){
  const {w=12,h=10,sw=w,sh=h,ox=0,oy=0,palette=0,color=0x800000ff,kind='rectangle',bounds={x:1,y:2,width:7,height:5},angle=0,radius=0,stroke=1,opacity=100,ink=0,selection=null,symmetric=0,layout='mixed',absent=false,special='normal',balanced=false,path:inputPath}=spec;
  const paletteEntries=entries.map(e=>({...e}));if(special==='duplicate')paletteEntries.push({id:7,color:0xff00ff00});if(special==='opaque-zero')paletteEntries[0].color=0xff0000ff;if(special==='hidden-rgb')paletteEntries.push({id:99,color:0x00123456});
  const d=model.createDocument('indexed shape',w,h,'indexed',false),l=d.layers[0];d.palette=paletteEntries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;l.pixels=new Uint32Array(Array.from({length:sw*sh},(_,i)=>layout==='zero'?0:layout==='one'?7:[0,7,19,30,41,99][(i%sw+Math.floor(i/sw))%6]));model.setLayerStorageOrigin(l,{x:5,y:-3});
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0),before=canvas();
  const peer=model.createLayer('linked shape',sw,sh,'indexed');peer.offsetX=ox;peer.offsetY=oy;model.setLayerStorageOrigin(peer,{x:5,y:-3});shareLinkedRasterContent(peer,l);
  const geometry=()=>{const origin=model.getLayerStorageOrigin(l);return {width:l.width,height:l.height,x:l.offsetX,y:l.offsetY,originX:origin.x,originY:origin.y};};
  const linkedGeometry=()=>{shareLinkedRasterContent(peer,l);const origin=model.getLayerStorageOrigin(peer);return {width:peer.width,height:peer.height,x:peer.offsetX,y:peer.offsetY,originX:origin.x,originY:origin.y};};
  const axes={horizontal:!!(symmetric&1),vertical:!!(symmetric&2),diagonalUp:!!(symmetric&4),diagonalDown:!!(symmetric&8)},center=spec.center??{x:w/2,y:h/2};
  const select=selection?{...selection,mask:selection.mask?new Uint8Array(selection.mask):undefined}:null;
  const path=inputPath??[{x:-1,y:1},{x:8,y:2},{x:9,y:7},{x:3,y:8}];
  const polygon=kind==='polygon'||kind==='freeform';
  const normalizedAngle=((angle%360)+360)%360;
  const effectiveBounds=!spec.rawLegacy&&!polygon&&normalizedAngle<1e-9?{...bounds,x:Math.round(bounds.x),y:Math.round(bounds.y)}:bounds;
  const contour=polygon?polygonLassoPreviewPoints(path.slice(0,-1),path.at(-1),kind==='polygon',balanced):unboundedShapePreview(effectiveBounds,kind,angle,radius,stroke);
  // canvas-render-shape-preview calls previewColorAt with session opacity,
  // simple ink, fixed original layer and each contour destination once.
  const previews=[];
  for(const paint of [0x00123456,color]){
   const display=Array.from({length:w*h},(_,i)=>{const index=model.layerIndexAt(l,i%w,Math.floor(i/w));return absent||index===null?0:packColor(d.palette.reduce((found,e)=>e.id===l.pixels[index]?e:found,{color:unpackColor(0)}).color);});
   const seen=new Set(),coverage=Math.round(255*opacity/100),c=unpackColor(paint),stamp={...c,a:Math.round(c.a*coverage/255)};
   for(const point of contour)for(const p of symmetryPoints(point,w,h,axes,center,false)){
    if(p.x<0||p.y<0||p.x>=w||p.y>=h||(select&&!selectionContains(select,p.x,p.y)))continue;
    const key=p.y*w+p.x;if(seen.has(key))continue;seen.add(key);
    const current=model.readLayerColorAt(d,l,p.x,p.y);
    const replacement=coverage<255||(c.a>0&&c.a<255)?blendOver(current,stamp):c;
    display[key]=packColor(model.resolveLayerCanvasColor(d,l,replacement));
   }
   previews.push(display);
  }
  const edit=history.beginPixelEdit(l.id);
  if(polygon){const points=kind==='polygon'?shapes.filledPolygonPathPixelPoints(d,path,balanced):shapes.filledShapePathPixelPoints(d,path);shapes.paintShapePixelPoints(d,l,edit,points,unpackColor(color),select,axes,center);}
  else shapes.paintShape(d,l,edit,effectiveBounds,kind,unpackColor(color),select,axes,center,angle,radius,stroke);
  const after=canvas(),afterGeometry=geometry(),linkedAfter=linkedGeometry(),entry=history.commitPixelEdit(d,edit,'shape');entry?.undo();const undo=canvas(),undoGeometry=geometry(),linkedUndo=linkedGeometry();entry?.redo();const redo=canvas(),redoGeometry=geometry(),linkedRedo=linkedGeometry();
  (spec.rawLegacy?legacyDefects:cases).push({name:spec.name??`shape-${cases.length}`,w,h,sw,sh,ox,oy,entries:paletteEntries,order:orders[palette],initial,before,color,kind,bounds,angle,radius,stroke,opacity,ink,selection,symmetric,center,absent,balanced,path,contour,previews,after,undo,redo,afterGeometry,undoGeometry,redoGeometry,linkedAfter,linkedUndo,linkedRedo,changed:!!entry});
 }
 for(const kind of kinds)for(let palette=0;palette<4;palette++)for(const color of [0,0x00123456,0x800000ff,0xff0000ff,0xff123456])for(let ink=0;ink<3;ink++)run({kind,palette,color,ink});
 for(const kind of kinds)for(const angle of [0,30,90,135,270])for(const stroke of [1,2,5])for(const radius of [0,2])run({kind,angle,stroke,radius,bounds:{x:-2,y:-1,width:9,height:7},symmetric:angle===30?15:3});
 for(const kind of kinds)for(const geometry of ['cropped','negative','placeholder-zero','placeholder-nonzero','absent'])for(const color of [0,0x800000ff,0xff0000ff])for(const special of ['normal','duplicate','opaque-zero','hidden-rgb']){
  const placeholder=geometry.startsWith('placeholder');run({name:`${geometry}-${kind}-${cases.length}`,kind,color,special,sw:geometry==='absent'?12:placeholder?1:4,sh:geometry==='absent'?10:placeholder?1:3,ox:geometry==='negative'?-2:geometry==='absent'?0:3,oy:geometry==='negative'?-1:geometry==='absent'?0:2,layout:geometry==='absent'||geometry==='placeholder-zero'?'zero':geometry==='placeholder-nonzero'?'one':'mixed',absent:geometry==='absent',symmetric:3});
 }
 for(const kind of kinds)for(const opacity of [0,35,100])for(const symmetric of [0,1,2,4,8,15])for(const masked of [false,true])run({kind,opacity,symmetric,balanced:true,selection:{x:1,y:1,width:8,height:7,...(masked?{mask:Array.from({length:56},(_,i)=>i%5?1:0)}:{})}});
 for(const kind of ['rectangle','ellipse'])run({name:`large-points-${kind}`,w:512,h:512,kind,bounds:{x:0,y:0,width:512,height:512},path:[{x:0,y:0},{x:511,y:0},{x:511,y:511},{x:0,y:511}],palette:1,color:0xff0000ff});

 // Offset symmetry centers can reflect off-canvas axis-aligned source pixels
 // into the canvas. Rotated primitives and filled polygon points clip first.
 for(const kind of kinds.slice(0,4))for(const angle of [0,17,45,90,359])for(const radius of [0,2])run({name:`edge-${kind}-${angle}-${radius}`,kind,angle,radius,bounds:{x:-3,y:-2,width:8,height:6},symmetric:15,center:{x:2.5,y:3}});
 for(const kind of kinds.slice(0,4))for(const angle of [0,17,45,90,359])run({name:`fractional-${kind}-${angle}`,kind,angle,bounds:{x:1.5,y:2.5,width:7,height:5},stroke:2});
 for(const kind of kinds.slice(0,4))run({name:`legacy-fractional-defect-${kind}`,kind,rawLegacy:true,bounds:{x:1.5,y:2.5,width:7,height:5},stroke:2});
 for(const area of [255,256,257,768])for(const masked of [false,true])run({name:`patch-${area}-${masked}`,w:area,h:1,kind:'rectangle',bounds:{x:0,y:0,width:area,height:1},palette:1,color:0xff0000ff,selection:masked?{x:0,y:0,width:area,height:1,mask:Array.from({length:area},(_,i)=>i%3===0?1:0)}:null});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases,legacyDefects}));console.log(`${cases.length} actual legacy indexed shape transactions and two contour previews`);
})().catch(error=>{console.error(error);process.exitCode=1;});
