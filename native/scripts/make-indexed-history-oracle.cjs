// Uses actual legacy document/history functions via Node's TypeScript loader.
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
  if(url.startsWith('file:')&&url.endsWith('.ts')) {let source=stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'});return {format:'module',source,shortCircuit:true};}
  return nextLoad(url,context);
 }
});

// Exercise unchanged legacy commitPixelEdit replay, including current palette
// normalization, row clipping, storage origins and raw dense region patches.
(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const {createDocument,setLayerStorageOrigin,getLayerStorageOrigin,expandLayerToRect}=await imp('document-model.ts');
 const {beginPixelEdit,commitPixelEdit}=await imp('history.ts');
 const unpack=v=>({r:v&255,g:(v>>>8)&255,b:(v>>>16)&255,a:v>>>24});
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:2147483647,color:0x8000ff00}];
 const orders=[[0,7,19,30,2147483647],[0,7,19],[19,7],[]];
 const cases=[];
 for(let palette=0;palette<orders.length;palette++)for(const layout of ['direct','expanded','cropped'])for(const kind of ['points','runs','dense','mixed']){
  const d=createDocument('indexed replay',8,6,'indexed',false),l=d.layers[0];
  d.palette=entries.map(e=>({id:e.id,name:`color ${e.id}`,color:unpack(e.color)}));d.paletteOrder=[0,7,19,30,2147483647];
  l.width=8;l.height=6;l.offsetX=-1;l.offsetY=1;l.pixels=new Uint32Array(Array.from({length:48},(_,i)=>[0,7,19,30,99,2147483647][i%6]));
  setLayerStorageOrigin(l,{x:5,y:-3});d.animation.cels[0].surface={...d.animation.cels[0].surface,width:8,height:6,offsetX:-1,offsetY:1,pixels:l.pixels};
  const points=kind==='points'||kind==='mixed'?[{index:0,before:30,after:2147483647},{index:10,before:99,after:30},{index:47,before:7,after:99}]:[];
  const runs=kind==='runs'||kind==='mixed'?[{index:6,length:5,before:30,after:2147483647},{index:7,length:1,before:19,after:30},{index:24,length:5,before:7,after:99}]:[];
  const dense=kind==='dense'||kind==='mixed'?{x:1,y:1,width:3,height:2,before:[99,30,7,2147483647,19,0],after:[30,99,2147483647,0,7,19]}:null;
  const edit=beginPixelEdit(l.id);if(points.length)edit.points={indices:new Uint32Array(points.map(p=>p.index)),before:new Uint32Array(points.map(p=>p.before)),after:new Uint32Array(points.map(p=>p.after)),count:points.length};if(runs.length)edit.runs=runs;if(dense)edit.denseRegion={...dense,x:dense.x+5,y:dense.y-3,before:new Uint32Array(dense.before),after:new Uint32Array(dense.after),changed:new Uint8Array(6).fill(1),count:6};
  const entry=commitPixelEdit(d,edit,'indexed replay');if(!entry)throw new Error('Missing history entry');
  d.paletteOrder=orders[palette];
  if(layout==='expanded'){if(!expandLayerToRect(l,-3,-1,12,10))throw new Error('Expansion rejected');}
  if(layout==='cropped'){const before=l.pixels;l.pixels=new Uint32Array(12);for(let y=0;y<3;y++)l.pixels.set(before.subarray((y+1)*8+2,(y+1)*8+6),y*4);l.width=4;l.height=3;l.offsetX=1;l.offsetY=2;setLayerStorageOrigin(l,{x:7,y:-2});}
  const origin=getLayerStorageOrigin(l),initial=Array.from(l.pixels),states=[];
  for(const action of ['redo','undo','redo']){entry[action]();states.push(Array.from(l.pixels));}
  cases.push({name:`${palette}-${layout}-${kind}`,width:l.width,height:l.height,offsetX:l.offsetX,offsetY:l.offsetY,originX:origin.x,originY:origin.y,entries,order:orders[palette],initial,points,runs,dense,states});
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(cases));console.log(`${cases.length} actual legacy indexed history replay cases`);
})().catch(error=>{console.error(error);process.exitCode=1;});
