// Uses actual legacy brush/history functions via Node's TypeScript loader.
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
 const {paintBrush,inheritBrushPaintBaseline}=await imp('tools-brush.ts');
 const {beginBrushTailEdit}=await imp('tools-pixel-edit-state.ts');
 const {appendPerfectPixelSegment}=await imp('tools-shapes.ts');
 const {unpackColor}=await imp('raster.ts');
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77,89],[],[77,53,41,7,19]];
 const variants=[{name:'solid',size:1},{name:'wide',size:3},{name:'mask',size:1,coverage:[64],width:1,height:1,intrinsicSize:true},{name:'colored',size:1,coverage:[255,255],colors:[0x800000ff,0xff00ff00],width:2,height:1,intrinsicSize:true},{name:'scaled',size:2,coverage:[255],colors:[0x800000ff],width:1,height:1,intrinsicSize:false}];
 const sources=[0xff0000ff,0x800000ff,0,0x00123456,0x010000ff];
 const cases=[];
 for(let palette=0;palette<orders.length;palette++)for(let ink=0;ink<3;ink++)for(const opacity of [0,17,50,100])for(const variant of variants)for(const color of sources){
  const d=model.createDocument('indexed brush',8,6,'indexed',false),l=d.layers[0];
  d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  l.width=8;l.height=6;l.offsetX=l.offsetY=0;l.pixels=new Uint32Array(Array.from({length:48},(_,i)=>[0,7,19,30,41,99][i%6]));
  const initial=Array.from(l.pixels),edit=history.beginPixelEdit(l.id);
  const image=variant.coverage?{...variant,id:'fixture',coverage:new Uint8Array(variant.coverage),colors:variant.colors?new Uint32Array(variant.colors):undefined}:null;
  const path=[[1,2],[2,2],[3,2],[2,2],[2,3]];
  let previewAfter;
  const paint=()=>{for(const [step,[x,y]] of path.entries()){paintBrush(d,l,edit,x,y,variant.size,unpackColor(color),'square',null,'solid',1,image,undefined,0,'paint',undefined,undefined,undefined,undefined,opacity/100,undefined,false,undefined,'off',undefined,0,true,['simple','copy-alpha-color','lock-alpha'][ink]);if(step===2)previewAfter=Array.from(l.pixels);}};
  paint();const after=Array.from(l.pixels),entry=history.commitPixelEdit(d,edit,'brush');
  entry?.undo();const undo=Array.from(l.pixels);entry?.redo();const redo=Array.from(l.pixels);
  history.revertPixelEdit(d,edit);const cancel=Array.from(l.pixels);
  cases.push({name:`${palette}-${ink}-${opacity}-${variant.name}-${color}`,entries,order:orders[palette],initial,color,ink,opacity,variant,path,previewAfter,after,undo,redo,cancel,changed:!!entry});
 }
 // Exercise inherited paint baselines and transparent-gradient crossings with
 // the actual paintBrush state machine, including repeated equal coverage.
 const dynamic=[];
 for(let ink=0;ink<3;ink++)for(const imageKind of ['none','colored'])for(const transparent of [false,true])for(const inherited of [false,true]){
  const d=model.createDocument('dynamic indexed',8,6,'indexed',false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[1];l.pixels=new Uint32Array(48).fill(41);
  const edit=history.beginPixelEdit(l.id),initial=Array.from(l.pixels),baseline=inherited?initial.map((_,i)=>[7,19,30,99][i%4]):null,image=imageKind==='colored'?{id:'dynamic',width:1,height:1,intrinsicSize:true,coverage:new Uint8Array([255]),colors:new Uint32Array([0x800000ff])}:null;
  if(baseline)inheritBrushPaintBaseline(edit,new Map(baseline.map((v,i)=>[i,v])));
  const start=transparent?0x000000ff:0xff0000ff,end=0xff00ff00;
  const samples=[{x:2,y:2,opacity:30,t:.6},{x:2,y:2,opacity:80,t:.9},{x:2,y:2,opacity:80,t:0},{x:3,y:2,opacity:50,t:.5}];
  for(const p of samples)paintBrush(d,l,edit,p.x,p.y,1,unpackColor(0xff0000ff),'square',null,'solid',1,image,undefined,0,'paint',undefined,undefined,undefined,undefined,p.opacity/100,undefined,false,{startColor:unpackColor(start),endColor:unpackColor(end),gradientAmount:p.t,dither:'none'},'off',undefined,0,true,['simple','copy-alpha-color','lock-alpha'][ink]);
  const after=Array.from(l.pixels),entry=history.commitPixelEdit(d,edit,'dynamic');entry?.undo();const undo=Array.from(l.pixels);entry?.redo();const redo=Array.from(l.pixels);history.revertPixelEdit(d,edit);
  dynamic.push({name:`dynamic-${ink}-${imageKind}-${transparent}-${inherited}`,entries,order:orders[1],initial,baseline,ink,start,end,samples,imageKind,after,undo,redo,cancel:Array.from(l.pixels),changed:!!entry});
 }
 const perfect=[];
 for(let palette=0;palette<orders.length;palette++)for(let ink=0;ink<3;ink++)for(const opacity of [50,100])for(const color of [0xff0000ff,0])for(const colored of [false,true]){
  const d=model.createDocument('perfect indexed',8,6,'indexed',false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];l.pixels=new Uint32Array(Array.from({length:48},(_,i)=>[0,7,19,30,41,99][i%6]));
  const initial=Array.from(l.pixels),path=[[1,2],[2,2],[2,3],[3,3],[4,3],[4,2],[3,2],[2,2]],states=[];
  const image=colored?{id:'perfect',width:1,height:1,intrinsicSize:true,coverage:new Uint8Array([255]),colors:new Uint32Array([0x800000ff])}:null;
  const paint=(edit,p)=>paintBrush(d,l,edit,p.x,p.y,1,unpackColor(color),'square',null,'solid',1,image,undefined,0,'paint',undefined,undefined,undefined,undefined,opacity/100,undefined,false,undefined,'off',undefined,0,true,['simple','copy-alpha-color','lock-alpha'][ink]);
  let tail=history.beginPixelEdit(l.id);const points=[{x:1,y:2,size:1,opacityScale:opacity/100}],parent=history.beginPixelEdit(l.id);let stable=0;
  paint(tail,points[0]);states.push(Array.from(l.pixels));
  for(const [x,y] of path.slice(1)){
   history.revertPixelEdit(d,tail);appendPerfectPixelSegment(points,{x,y,size:1,opacityScale:opacity/100});tail=beginBrushTailEdit(parent);
   const end=Math.max(0,points.length-2);for(let i=stable;i<end;i++)paint(parent,points[i]);stable=end;for(let i=end;i<points.length;i++)paint(tail,points[i]);states.push(Array.from(l.pixels));
  }
  const merged=history.mergePixelEdits(parent,tail),after=Array.from(l.pixels),entry=history.commitPixelEdit(d,merged,'perfect');entry?.undo();const undo=Array.from(l.pixels);entry?.redo();const redo=Array.from(l.pixels);history.revertPixelEdit(d,merged);
  perfect.push({name:`perfect-${palette}-${ink}-${opacity}-${color}-${colored}`,entries,order:orders[palette],initial,ink,opacity,color,colored,path,states,after,undo,redo,cancel:Array.from(l.pixels),changed:!!entry});
 }
 const aligned=[];
 for(let palette=0;palette<orders.length;palette++)for(let ink=0;ink<3;ink++)for(const opacity of [50,100])for(const color of [0xff0000ff,0]){
  const d=model.createDocument('aligned indexed',8,6,'indexed',false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];l.pixels=new Uint32Array(Array.from({length:48},(_,i)=>[0,7,19,30,41,99][i%6]));
  const initial=Array.from(l.pixels),paths=[[[1,2],[2,2]],[[1,2],[1,3]],[[1,2],[2,2],[3,2]]],states=[];let edit=history.beginPixelEdit(l.id);
  for(const points of paths){history.revertPixelEdit(d,edit);edit=history.beginPixelEdit(l.id);for(const [x,y] of points)paintBrush(d,l,edit,x,y,1,unpackColor(color),'square',null,'solid',1,null,undefined,0,'paint',undefined,undefined,undefined,undefined,opacity/100,undefined,false,undefined,'off',undefined,0,true,['simple','copy-alpha-color','lock-alpha'][ink]);states.push(Array.from(l.pixels));}
  const after=Array.from(l.pixels),entry=history.commitPixelEdit(d,edit,'aligned');entry?.undo();const undo=Array.from(l.pixels);entry?.redo();const redo=Array.from(l.pixels);history.revertPixelEdit(d,edit);
  aligned.push({name:`aligned-${palette}-${ink}-${opacity}-${color}`,entries,order:orders[palette],initial,ink,opacity,color,paths,states,after,undo,redo,cancel:Array.from(l.pixels),changed:!!entry});
 }
 const geometry=[];
 for(const kind of ['absent','cropped','negative'])for(const palette of [0,1])for(let ink=0;ink<3;ink++)for(const color of [0xff0000ff,0])for(const variant of [variants[0],variants[1],variants[3]]){
  const d=model.createDocument('sparse indexed',8,6,'indexed',false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  const width=kind==='absent'?8:kind==='cropped'?2:3,height=kind==='absent'?6:kind==='cropped'?2:3,offsetX=kind==='negative'?-1:kind==='cropped'?2:0,offsetY=offsetX;
  l.width=width;l.height=height;l.offsetX=offsetX;l.offsetY=offsetY;l.pixels=new Uint32Array(Array.from({length:width*height},(_,i)=>kind==='absent'?0:[7,30,99,41][i%4]));model.setLayerStorageOrigin(l,{x:5,y:-3});
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:48},(_,i)=>model.readLayerPackedAt(d,l,i%8,Math.floor(i/8))??0),before=canvas(),edit=history.beginPixelEdit(l.id),path=[[1,2],[2,2],[3,2],[3,3],[4,3]];
  const image=variant.coverage?{...variant,id:'geometry',coverage:new Uint8Array(variant.coverage),colors:new Uint32Array(variant.colors)}:null;
  for(const [x,y] of path)paintBrush(d,l,edit,x,y,variant.size,unpackColor(color),'square',null,'solid',1,image,undefined,0,'paint',undefined,undefined,undefined,undefined,.5,undefined,false,undefined,'off',undefined,0,true,['simple','copy-alpha-color','lock-alpha'][ink]);
  const after=canvas(),entry=history.commitPixelEdit(d,edit,'geometry');entry?.undo();const undo=canvas();entry?.redo();const redo=canvas();history.revertPixelEdit(d,edit);
  geometry.push({name:`geometry-${kind}-${palette}-${ink}-${color}-${variant.name}`,kind,width,height,offsetX,offsetY,originX:5,originY:-3,entries,order:orders[palette],initial,before,variant,ink,opacity:50,color,path,after,undo,redo,cancel:canvas(),changed:!!entry});
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases,dynamic,perfect,aligned,geometry}));console.log(`${cases.length} actual legacy brush transactions, ${dynamic.length} gradient/baseline crossings, ${perfect.length} perfect tails, ${aligned.length} aligned replays and ${geometry.length} sparse/offset cases`);
})().catch(error=>{console.error(error);process.exitCode=1;});
