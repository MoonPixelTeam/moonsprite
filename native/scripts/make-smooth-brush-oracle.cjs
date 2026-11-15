// Execute actual legacy smooth sampling, normalization and PixelEdit history.
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
 const model=await imp('document-model.ts'),animation=await imp('animation.ts'),history=await imp('history.ts'),{applySmoothBrush}=await imp('smooth-brush.ts'),{unpackColor}=await imp('raster.ts');
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x8000ff00},{id:99,color:0x00123456}];
 const snapshot=l=>({width:l.width,height:l.height,ox:l.offsetX,oy:l.offsetY,sx:model.getLayerStorageOrigin(l).x,sy:model.getLayerStorageOrigin(l).y,pixels:Array.from({length:l.width*l.height},(_,i)=>model.readLayerPacked(null,l,i))});
 const cases=[];
 function run(format,palette,layout,shape,strength,variant,size=9){
  const entries=base.map(e=>({...e}));if(palette===1)entries[0].color=0xff0000ff;if(palette===2)entries.push({id:7,color:0xff00ff00});if(palette===3)entries[1].color=0x00123456;if(palette===5)entries.length=0;
  const order=palette===4?[]:palette===3?[19,41]:[7,19,41];
  const w=size,h=size,sw=layout===1?6:layout===2?5:layout===3?1:w,sh=layout===1?7:layout===2?6:layout===3?1:h,ox=layout===1?-1:layout===2?2:layout===3?12:0,oy=layout===1?1:layout===2?-1:layout===3?11:0;
  const ids=[7,19,30,41,99,4000000000],rgba=[0xff0000ff,0xffff0000,0x8000ff00,0x00123456,0,0x40ffffff];
  const value=(x,y)=>{
   let filled=false;
   if(shape===0)filled=(x===2&&y===1)||(x===6&&y===6);
   if(shape===1)filled=(y===4&&[1,2,4,5,6].includes(x));
   if(shape===2)filled=x>=2&&x<=6&&y>=3&&y<=6||x===4&&y>=1&&y<3;
   if(shape===3)filled=x===y&&x>0&&x<8;
   if(shape===4)filled=x>0&&x<8&&y>0&&y<8&&!(x===4&&y===4);
   if(shape===5)filled=(x+y)%3===0||x===3&&y===4||x===4&&y===4;
   if(shape===6)filled=true;
   if(shape===7)filled=size>9?x%3!==0&&y%3!==0:x%3===1&&y%3===1;
   if(!filled)return format==='rgba'&&variant===2?0x00123456:0;
   return format==='indexed'?(shape===5?ids[(x+2*y+variant+60)%6]:[7,30,99][variant]):(shape===5?rgba[(x+2*y+variant+60)%6]:[0xff0000ff,0x8000ff00,0xffff0000][variant]);
  };
  const initial=Array.from({length:sw*sh},(_,i)=>value(i%sw+ox,Math.floor(i/sw)+oy));
  const d=model.createDocument('smooth oracle',w,h,format,false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=order;d.nextColorId=100;
  Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:format==='indexed'?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(l,{x:5,y:-3});animation.syncActiveAnimationLayer(d,l.id);
  const selection=variant===1?{x:1,y:0,width:w-2,height:h,mask:Array.from({length:(w-2)*h},(_,i)=>[1,1,0,2,255][i%5])}:variant===2?{x:0,y:1,width:w,height:h-2,mask:[]}:null;
  const select=selection?{...selection,mask:selection.mask.length?new Uint8Array(selection.mask):undefined}:null;
  let visited=Array.from({length:w*h},(_,i)=>i);if(variant===1)visited.reverse();if(variant===2)visited=visited.filter(i=>i%4!==0);
  const edit=history.beginPixelEdit(l.id),before=snapshot(l),produced=applySmoothBrush(d,l,edit,{visited:new Set(visited)},select,strength),after=snapshot(l),entry=history.commitPixelEdit(d,edit,'smooth',true);
  const dense=!!entry&&history.getCommittedPixelChanges(entry).regionPatches.length>0;
  const replayOrder=variant===2?[41,19]:null;if(replayOrder)d.paletteOrder=replayOrder;
  entry?.undo();const undo=snapshot(l);entry?.redo();const redo=snapshot(l);
  cases.push({name:`${format}-${palette}-${layout}-${shape}-${strength}-${variant}-${size}`,format,w,h,sw,sh,ox,oy,entries,order,initial,selection,visited,strength,before,after,undo,redo,produced,changed:!!entry,dense,replayOrder});
 }
 for(const format of ['indexed','rgba'])for(let palette=0;palette<6;palette++)for(let shape=0;shape<8;shape++)for(const strength of [-1,0,1,10,25,49,50,51,58,59,66,75,99,100,101])for(let variant=0;variant<3;variant++)run(format,palette,(shape+variant)%4,shape,strength,variant);
 // Full surfaces ensure isolated/bridge/hole cases also run without sparse clipping.
 for(const format of ['indexed','rgba'])for(let shape=0;shape<8;shape++)for(let variant=0;variant<3;variant++)for(const strength of [10,50,75,100])run(format,variant,0,shape,strength,variant);
 // Actual history crosses the 256-point dense threshold; undo must preserve hidden IDs.
 for(const format of ['indexed','rgba'])for(let palette=0;palette<6;palette++)for(let variant=0;variant<3;variant++)run(format,palette,0,7,100,variant,67);
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy smooth sampling and history cases; ${cases.filter(c=>c.dense).length} dense histories`);
})().catch(error=>{console.error(error);process.exitCode=1;});
