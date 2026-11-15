// Run actual legacy spray particles, paintBrush and PixelEdit history with fixed randomness.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,next){
  let target;
  if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target)for(const candidate of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return {url:pathToFileURL(candidate).href,shortCircuit:true};
  try{return next(specifier,context);}catch(error){
   if(specifier.startsWith('.')||specifier.startsWith('node:')||specifier.startsWith('file:'))throw error;
   const store=path.join(legacy,'node_modules/.pnpm'),name=specifier.split('/')[0],matches=fs.readdirSync(store).filter(n=>n.startsWith(name+'@'));
   if(matches.length!==1)throw error;
   return {url:pathToFileURL(require.resolve(path.join(store,matches[0],'node_modules',specifier))).href,shortCircuit:true};
  }
 },
 load(url,context,next){
  if(url.startsWith('file:')&&url.endsWith('.ts')){
   const input=fs.readFileSync(fileURLToPath(url),'utf8').replace('import { BrushGradientSample,','import { type BrushGradientSample,').replace(', BrushGradientSample,',', type BrushGradientSample,').replace(/, BrushMaskPoint(?=[, }])/g,', type BrushMaskPoint');
   return {format:'module',source:stripTypeScriptTypes(input,{mode:'transform'}),shortCircuit:true};
  }
  return next(url,context);
 }
});
(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts'),history=await imp('history.ts'),brush=await imp('tools-brush.ts'),air=await imp('airbrush.ts'),{unpackColor}=await imp('raster.ts');
 const cases=[];
 function run(format,palette,shape,variant,dense=false){
  const w=dense?65:13,h=dense?51:11,layout=variant%3,sw=layout===1?w+4:layout===2?w-4:w,sh=layout===1?h+6:layout===2?h-3:h,ox=layout===1?-2:layout===2?2:0,oy=layout===1?-3:layout===2?1:0;
  const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x8000ff00},{id:99,color:0x00123456}];
  if(palette===1)entries[0].color=0xff0000ff;if(palette===2)entries.push({id:7,color:0xff00ff00});if(palette===3)entries.push({id:7,color:0x00123456});if(palette===4)entries[1].color=0x00123456;if(palette===5)entries.length=0;if(palette===6){entries[1].color=0;entries.push({id:7,color:0xff0000ff});}
  const order=palette===3?[]:palette===4?[19,41]:[7,19,41],initial=Array.from({length:sw*sh},(_,i)=>format==='indexed'?[0,7,19,30,41,99,4000000000][i%7]:[0,0xff0000ff,0xffff0000,0x8000ff00,0x00123456,0x40ffffff,0][i%7]);
  const radius=dense?16:[1,2,4,16][variant%4],scatter=dense?20:[0,4,12,64][(variant>>1)%4],density=dense?128:[1,8,32][variant%3],angle=[0,37,90,-145][(variant>>2)%4],axes=dense?0:variant,center={x:variant%2?.5:w/2,y:variant%2?1:h/2};
  const symmetry={horizontal:!!(axes&1),vertical:!!(axes&2),diagonalUp:!!(axes&4),diagonalDown:!!(axes&8),rotational:!!(axes&16)},repeat=['off','x','y','both'][variant%4],color=dense?0xff0000ff:[0,0x00123456,0xff0000ff,0x8000ff00,0x40ffffff][variant%5];
  const selection=!dense&&variant%3===1?{x:1,y:1,width:w-2,height:h-2,mask:Array.from({length:(w-2)*(h-2)},(_,i)=>[1,0,2,255,1][i%5])}:null,select=selection?{...selection,mask:new Uint8Array(selection.mask)}:null;
  let seed=(0x12345678+variant*71+palette*13)>>>0;const initialSeed=seed,random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const centers=dense?[{x:20,y:20},{x:40,y:25},{x:20,y:20}]:[{x:0,y:0},{x:w-1,y:h-1},{x:0,y:0}],batches=centers.map(p=>({center:p,particles:air.generateAirbrushParticles(p,{particleRadius:radius,scatterRadius:scatter,density},random)}));
  function make(){const d=model.createDocument('spray oracle',w,h,format,false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=order;d.nextColorId=100;Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:format==='indexed'?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(l,{x:5,y:-3});return {d,l};}
  const canvas=(d,l)=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0);
  function paint(d,l){const edit=history.beginPixelEdit(l.id),states=[];for(const batch of batches){for(const p of batch.particles)brush.paintBrush(d,l,edit,p.x,p.y,air.airbrushParticleSize(radius),unpackColor(color),shape,select,'solid',1,null,undefined,0,'paint',undefined,symmetry,center,undefined,1,undefined,false,undefined,repeat,undefined,shape==='round'?0:angle,true,'simple');states.push(canvas(d,l));}return {edit,states};}
  const {d,l}=make(),{edit,states}=paint(d,l),after=canvas(d,l),entry=history.commitPixelEdit(d,edit,'spray',true),isDense=!!entry&&history.getCommittedPixelChanges(entry).regionPatches.length>0,replayOrder=variant%3===1?[41,19]:null;
  if(replayOrder)d.paletteOrder=replayOrder;entry?.undo();const undo=canvas(d,l);entry?.redo();const redo=canvas(d,l);
  const cancelled=make(),cancelEdit=paint(cancelled.d,cancelled.l).edit;history.revertPixelEdit(cancelled.d,cancelEdit);
  cases.push({name:`${format}-${palette}-${shape}-${variant}-${dense}`,format,w,h,sw,sh,ox,oy,entries,order,initial,shape,radius,scatter,density,angle,axes,center,repeat,color,selection,seed:initialSeed,batches,states,after,undo,redo,cancel:canvas(cancelled.d,cancelled.l),changed:!!entry,dense:isDense,replayOrder});
 }
 for(const format of ['indexed','rgba'])for(let palette=0;palette<7;++palette)for(const shape of ['round','square','line'])for(let variant=0;variant<32;++variant)run(format,palette,shape,variant);
 for(const format of ['indexed','rgba'])for(let palette=0;palette<7;++palette)for(const shape of ['round','square','line'])for(let variant=0;variant<3;++variant)run(format,palette,shape,variant,true);
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy spray cases; ${cases.filter(c=>c.dense).length} dense histories`);
})().catch(error=>{console.error(error);process.exitCode=1;});
